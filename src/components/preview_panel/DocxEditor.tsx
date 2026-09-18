import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  Plus,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  MiniSelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";

interface DocxEditorProps {
  appId: number | null;
  filePath: string;
}

interface RunLike {
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface ParagraphLike {
  text?: string;
  children?: (string | RunLike)[];
  heading?: string;
  alignment?: string;
  numbering?: unknown;
  bullet?: { level: number };
  [key: string]: unknown;
}

type SectionChildLike = { paragraph?: ParagraphLike; table?: TableLike } & Record<string, unknown>;

interface SectionLike {
  children?: SectionChildLike[];
  [key: string]: unknown;
}

interface TableCellLike {
  children?: SectionChildLike[];
  [key: string]: unknown;
}

interface TableRowLike {
  cells?: TableCellLike[];
  [key: string]: unknown;
}

interface TableLike {
  rows?: TableRowLike[];
  [key: string]: unknown;
}

type Alignment = "left" | "center" | "right" | "justify";

interface TableCellBlock {
  id: string;
  initialHtml: string;
  raw?: TableCellLike;
}

interface Block {
  id: string;
  sectionIndex: number;
  kind: "paragraph" | "table" | "other";
  headingLevel?: 1 | 2 | 3 | 4;
  alignment: Alignment;
  bulleted: boolean;
  initialHtml: string;
  raw?: SectionChildLike;
  tableRows?: TableCellBlock[][];
}

const HEADING_TO_LEVEL: Record<string, 1 | 2 | 3 | 4> = {
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
};
const LEVEL_TO_HEADING: Record<number, string> = {
  1: "Heading1",
  2: "Heading2",
  3: "Heading3",
  4: "Heading4",
};
const ALIGN_TO_UI: Record<string, Alignment> = {
  center: "center",
  right: "right",
  both: "justify",
  justified: "justify",
};
const UI_TO_ALIGN: Record<Alignment, string | undefined> = {
  left: undefined,
  center: "center",
  right: "right",
  justify: "both",
};
const HEADING_SELECT_LABELS: Record<string, string> = {
  "0": "Normal",
  "1": "Heading 1",
  "2": "Heading 2",
  "3": "Heading 3",
  "4": "Heading 4",
};

let nextBlockId = 1;
function newBlockId(): string {
  return `block-${nextBlockId++}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function runsToHtml(children: (string | RunLike)[] | undefined): string {
  if (!children || children.length === 0) return "";
  return children
    .map((r) => {
      if (typeof r === "string") return escapeHtml(r);
      let html = escapeHtml(r.text ?? "");
      if (r.bold) html = `<strong>${html}</strong>`;
      if (r.italic) html = `<em>${html}</em>`;
      if (r.underline) html = `<u>${html}</u>`;
      return html;
    })
    .join("");
}

function paragraphToBlock(paragraph: ParagraphLike, sectionIndex: number): Block {
  const headingLevel = paragraph.heading ? HEADING_TO_LEVEL[paragraph.heading] : undefined;
  const alignment = (paragraph.alignment && ALIGN_TO_UI[paragraph.alignment]) || "left";
  const bulleted = !!paragraph.numbering || !!paragraph.bullet;
  const html =
    paragraph.text != null ? escapeHtml(paragraph.text) : runsToHtml(paragraph.children);
  return {
    id: newBlockId(),
    sectionIndex,
    kind: "paragraph",
    headingLevel,
    alignment,
    bulleted,
    initialHtml: html || "<br>",
  };
}

function paragraphToHtml(paragraph: ParagraphLike): string {
  return paragraph.text != null ? escapeHtml(paragraph.text) : runsToHtml(paragraph.children);
}

/** A table cell can hold multiple paragraphs; flattened into one contentEditable, joined by <br>. */
function cellToBlock(cell: TableCellLike, id: string): TableCellBlock {
  const paragraphs = (cell.children ?? [])
    .map((c) => c.paragraph)
    .filter((p): p is ParagraphLike => !!p);
  const html = paragraphs.map(paragraphToHtml).join("<br>");
  return { id, initialHtml: html || "<br>", raw: cell };
}

function tableToBlock(table: TableLike, sectionIndex: number): Block {
  const tableRows = (table.rows ?? []).map((row, r) =>
    (row.cells ?? []).map((cell, c) => cellToBlock(cell, `${newBlockId()}-r${r}c${c}`)),
  );
  return {
    id: newBlockId(),
    sectionIndex,
    kind: "table",
    alignment: "left",
    bulleted: false,
    initialHtml: "",
    raw: { table },
    tableRows,
  };
}

function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (typeof node === "string") {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, acc);
    return acc;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.text === "string") acc.push(o.text);
    for (const key of ["children", "rows", "cells", "paragraph"]) {
      if (key in o) collectText(o[key], acc);
    }
  }
  return acc;
}

/** Walks a contentEditable's DOM, tracking bold/italic/underline ancestry, into flat runs. */
function htmlToRuns(root: HTMLElement): RunLike[] {
  const runs: RunLike[] = [];
  const walk = (node: ChildNode, flags: { bold?: boolean; italic?: boolean; underline?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ text, ...flags });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const next = { ...flags };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u") next.underline = true;
    if (tag === "br") return;
    for (const child of Array.from(el.childNodes)) walk(child, next);
  };
  for (const child of Array.from(root.childNodes)) walk(child, {});
  return runs;
}

/** Same walk as htmlToRuns, but a <br> becomes a paragraph break (used for table cells, which can hold multiple paragraphs). */
function htmlToParagraphs(root: HTMLElement): ParagraphLike[] {
  const runs: RunLike[] = [];
  const BREAK = { text: "\n" };
  const walk = (node: ChildNode, flags: { bold?: boolean; italic?: boolean; underline?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ text, ...flags });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      runs.push(BREAK);
      return;
    }
    const next = { ...flags };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u") next.underline = true;
    for (const child of Array.from(el.childNodes)) walk(child, next);
  };
  for (const child of Array.from(root.childNodes)) walk(child, {});

  const paragraphs: ParagraphLike[] = [];
  let current: RunLike[] = [];
  const flush = () => {
    if (current.length === 0) {
      paragraphs.push({ text: "" });
    } else if (current.length === 1 && !current[0].bold && !current[0].italic && !current[0].underline) {
      paragraphs.push({ text: current[0].text ?? "" });
    } else {
      paragraphs.push({ children: current });
    }
    current = [];
  };
  for (const run of runs) {
    if (run === BREAK) flush();
    else current.push(run);
  }
  flush();
  return paragraphs;
}

function OtherBlockPreview({ raw }: { raw: SectionChildLike }) {
  const kind = "images" in raw ? "Image" : "Content";
  const text = collectText(raw).filter(Boolean).join(" ");
  return (
    <div className="my-2 rounded border border-dashed bg-muted/30 px-3 py-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {kind} (preserved, not editable here)
      </div>
      {text && <div className="text-xs text-muted-foreground">{text}</div>}
    </div>
  );
}

/**
 * Rich-text .docx editor: per-paragraph contentEditable blocks (Enter splits a
 * new paragraph, matching block editors like Notion), a toolbar for bold/
 * italic/underline/heading/alignment/bullet list, editable tables (bold/
 * italic/underline per cell; each cell's original width/shading/borders are
 * preserved), and save-back via generateDocx. Other non-paragraph content
 * (images, charts) round-trips untouched but isn't editable here.
 */
export function DocxEditor({ appId, filePath }: DocxEditorProps) {
  const [document_, setDocument] = useState<{ sections?: SectionLike[] } | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [inlineState, setInlineState] = useState({ bold: false, italic: false, underline: false });

  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const refreshInlineState = () => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const withinBlock =
      anchor && Array.from(blockRefs.current.values()).some((el) => el.contains(anchor));
    if (!withinBlock) return;
    setInlineState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  useEffect(() => {
    document.addEventListener("selectionchange", refreshInlineState);
    return () => document.removeEventListener("selectionchange", refreshInlineState);
  }, []);

  useEffect(() => {
    if (appId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc.office
      .parseFile({ appId, relPath: filePath })
      .then((result) => {
        if (cancelled) return;
        if (!result || result.kind !== "docx") {
          setError("Couldn't read this file. It may be corrupted or missing.");
          return;
        }
        const data = result.data as { sections?: SectionLike[] };
        const sections = data.sections?.length ? data.sections : [{ children: [] }];
        const nextBlocks: Block[] = [];
        sections.forEach((section, sectionIndex) => {
          for (const child of section.children ?? []) {
            if (child.paragraph) {
              nextBlocks.push(paragraphToBlock(child.paragraph, sectionIndex));
            } else if (child.table) {
              nextBlocks.push(tableToBlock(child.table, sectionIndex));
            } else {
              nextBlocks.push({
                id: newBlockId(),
                sectionIndex,
                kind: "other",
                alignment: "left",
                bulleted: false,
                initialHtml: "",
                raw: child,
              });
            }
          }
        });
        setDocument(data);
        setBlocks(
          nextBlocks.length > 0
            ? nextBlocks
            : [
                {
                  id: newBlockId(),
                  sectionIndex: 0,
                  kind: "paragraph",
                  alignment: "left",
                  bulleted: false,
                  initialHtml: "<br>",
                },
              ],
        );
        setDirty(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, filePath]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const el = blockRefs.current.get(pendingFocusId);
    el?.focus();
    setPendingFocusId(null);
  }, [pendingFocusId, blocks]);

  const focusedBlock = useMemo(
    () => blocks.find((b) => b.id === focusedBlockId) ?? null,
    [blocks, focusedBlockId],
  );

  const applyInline = (cmd: "bold" | "italic" | "underline") => {
    const el = focusedBlockId ? blockRefs.current.get(focusedBlockId) : null;
    if (!el) return;
    el.focus();
    document.execCommand(cmd);
    refreshInlineState();
    setDirty(true);
  };

  const updateFocusedBlock = (patch: Partial<Block>) => {
    if (!focusedBlockId) return;
    setBlocks((prev) => prev.map((b) => (b.id === focusedBlockId ? { ...b, ...patch } : b)));
    setDirty(true);
  };

  const insertParagraphAfter = (id: string) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const section = prev[index]?.sectionIndex ?? 0;
      const block: Block = {
        id: newBlockId(),
        sectionIndex: section,
        kind: "paragraph",
        alignment: "left",
        bulleted: false,
        initialHtml: "<br>",
      };
      const next = [...prev];
      next.splice(index + 1, 0, block);
      setPendingFocusId(block.id);
      return next;
    });
    setDirty(true);
  };

  const deleteBlock = (id: string) => {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== id)));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!document_ || appId == null) return;
    setSaving(true);
    try {
      const bySection = new Map<number, SectionChildLike[]>();
      for (const block of blocks) {
        const children = bySection.get(block.sectionIndex) ?? [];
        if (!bySection.has(block.sectionIndex)) bySection.set(block.sectionIndex, children);

        if (block.kind === "other") {
          if (block.raw) children.push(block.raw);
          continue;
        }

        if (block.kind === "table") {
          const originalTable = (block.raw?.table as TableLike | undefined) ?? {};
          const rows = (block.tableRows ?? []).map((row, r) => {
            const originalRow = originalTable.rows?.[r] ?? {};
            const cells = row.map((cellBlock) => {
              const cellEl = blockRefs.current.get(cellBlock.id);
              const cellChildren = cellEl
                ? htmlToParagraphs(cellEl).map((paragraph) => ({ paragraph }))
                : [{ paragraph: { text: "" } }];
              return { ...cellBlock.raw, children: cellChildren };
            });
            return { ...originalRow, cells };
          });
          children.push({ table: { ...originalTable, rows } });
          continue;
        }

        const el = blockRefs.current.get(block.id);
        const runs = el ? htmlToRuns(el) : [];
        const paragraph: ParagraphLike = {};
        if (block.headingLevel) paragraph.heading = LEVEL_TO_HEADING[block.headingLevel];
        const alignValue = UI_TO_ALIGN[block.alignment];
        if (alignValue) paragraph.alignment = alignValue;
        if (block.bulleted) paragraph.bullet = { level: 0 };

        if (runs.length === 0) {
          paragraph.text = "";
        } else if (runs.length === 1 && !runs[0].bold && !runs[0].italic && !runs[0].underline) {
          paragraph.text = runs[0].text ?? "";
        } else {
          paragraph.children = runs;
        }
        children.push({ paragraph });
      }

      const sections = (document_.sections?.length ? document_.sections : [{}]).map(
        (section, i) => ({ ...section, children: bySection.get(i) ?? [] }),
      );

      await ipc.office.writeDocxFile({
        appId,
        relPath: filePath,
        document: { ...document_, sections },
      });
      setDirty(false);
      showSuccess("Saved");
    } catch (err) {
      showError(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !document_) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error ?? "Failed to load file"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Select
          value={String(focusedBlock?.headingLevel ?? 0)}
          onValueChange={(v) =>
            updateFocusedBlock({ headingLevel: v === "0" ? undefined : (Number(v) as 1 | 2 | 3 | 4) })
          }
        >
          <MiniSelectTrigger className="h-7 w-28 text-xs">
            <SelectValue>{(v: string) => HEADING_SELECT_LABELS[v] ?? "Normal"}</SelectValue>
          </MiniSelectTrigger>
          <SelectContent>
            <SelectItem value="0">Normal</SelectItem>
            <SelectItem value="1">Heading 1</SelectItem>
            <SelectItem value="2">Heading 2</SelectItem>
            <SelectItem value="3">Heading 3</SelectItem>
            <SelectItem value="4">Heading 4</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 h-5 w-px bg-border" />
        <Toggle size="sm" pressed={inlineState.bold} onPressedChange={() => applyInline("bold")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={inlineState.italic} onPressedChange={() => applyInline("italic")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={inlineState.underline}
          onPressedChange={() => applyInline("underline")}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </Toggle>

        <div className="mx-1 h-5 w-px bg-border" />
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "left"}
          onPressedChange={() => updateFocusedBlock({ alignment: "left" })}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "center"}
          onPressedChange={() => updateFocusedBlock({ alignment: "center" })}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "right"}
          onPressedChange={() => updateFocusedBlock({ alignment: "right" })}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "justify"}
          onPressedChange={() => updateFocusedBlock({ alignment: "justify" })}
          title="Justify"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </Toggle>

        <div className="mx-1 h-5 w-px bg-border" />
        <Toggle
          size="sm"
          pressed={!!focusedBlock?.bulleted}
          onPressedChange={(pressed) => updateFocusedBlock({ bulleted: pressed })}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>

        <div className="ml-auto flex items-center gap-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {filePath}
            {dirty && " •"}
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-8 py-8">
        <div className="rounded-lg border bg-background p-10 shadow-sm">
          {blocks.map((block) =>
            block.kind === "other" ? (
              <OtherBlockPreview key={block.id} raw={block.raw!} />
            ) : block.kind === "table" ? (
              <table key={block.id} className="my-3 w-full table-fixed border-collapse">
                <tbody>
                  {(block.tableRows ?? []).map((row, r) => (
                    <tr key={r}>
                      {row.map((cellBlock) => (
                        <td key={cellBlock.id} className="border align-top">
                          <div
                            ref={(el) => {
                              if (el) blockRefs.current.set(cellBlock.id, el);
                              else blockRefs.current.delete(cellBlock.id);
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            dangerouslySetInnerHTML={{ __html: cellBlock.initialHtml }}
                            onFocus={() => {
                              setFocusedBlockId(cellBlock.id);
                              refreshInlineState();
                            }}
                            onInput={() => setDirty(true)}
                            className="min-h-[1.5em] px-2 py-1 text-sm leading-snug outline-none focus:bg-accent/20"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div key={block.id} className="group relative flex items-start gap-1">
                <div
                  ref={(el) => {
                    if (el) blockRefs.current.set(block.id, el);
                    else blockRefs.current.delete(block.id);
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: block.initialHtml }}
                  onFocus={() => {
                    setFocusedBlockId(block.id);
                    refreshInlineState();
                  }}
                  onInput={() => setDirty(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      insertParagraphAfter(block.id);
                    }
                  }}
                  className={cn(
                    "min-h-[1.75em] flex-1 rounded px-1 py-0.5 leading-relaxed outline-none focus:bg-accent/20",
                    block.headingLevel === 1 && "text-3xl font-bold",
                    block.headingLevel === 2 && "text-2xl font-bold",
                    block.headingLevel === 3 && "text-xl font-semibold",
                    block.headingLevel === 4 && "text-lg font-semibold",
                    block.alignment === "center" && "text-center",
                    block.alignment === "right" && "text-right",
                    block.alignment === "justify" && "text-justify",
                    block.bulleted && "list-disc pl-5 marker:text-muted-foreground [display:list-item]",
                  )}
                />
                <button
                  type="button"
                  className="mt-1 hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                  onClick={() => deleteBlock(block.id)}
                  aria-label="Delete paragraph"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => insertParagraphAfter(blocks[blocks.length - 1].id)}
          >
            <Plus className="h-3.5 w-3.5" /> Paragraph
          </Button>
        </div>
      </div>
    </div>
  );
}
