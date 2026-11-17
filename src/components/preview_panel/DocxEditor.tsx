import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Plus,
  Trash2,
  Loader2,
  Save,
  Table as TableIcon,
  Quote,
  Minus,
  ListTree,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Clock,
  FileText,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  strike?: boolean;
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
  kind: "paragraph" | "table" | "callout" | "divider" | "other";
  headingLevel?: 1 | 2 | 3 | 4;
  alignment: Alignment;
  bulleted: boolean;
  numbered?: boolean;
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
      if (r.strike) html = `<s>${html}</s>`;
      return html;
    })
    .join("");
}

function paragraphToBlock(paragraph: ParagraphLike, sectionIndex: number): Block {
  const headingLevel = paragraph.heading ? HEADING_TO_LEVEL[paragraph.heading] : undefined;
  const alignment = (paragraph.alignment && ALIGN_TO_UI[paragraph.alignment]) || "left";
  const bulleted = !!paragraph.numbering || !!paragraph.bullet;
  const html = paragraph.text != null ? escapeHtml(paragraph.text) : runsToHtml(paragraph.children);
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

function OtherBlockPreview({ raw }: { raw: SectionChildLike }) {
  return (
    <div className="my-2 rounded border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
      [Embedded document object]
    </div>
  );
}

export function DocxEditor({ appId, filePath }: DocxEditorProps) {
  const [document_, setDocument] = useState<{ sections?: SectionLike[] } | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [zoom, setZoom] = useState(100);

  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrike, setIsStrike] = useState(false);

  const refreshInlineState = () => {
    try {
      setIsBold(document.queryCommandState("bold"));
      setIsItalic(document.queryCommandState("italic"));
      setIsUnderline(document.queryCommandState("underline"));
      setIsStrike(document.queryCommandState("strikethrough"));
    } catch {
      // Ignored if queryCommandState fails
    }
  };

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
        const doc = result.data as { sections?: SectionLike[] };
        setDocument(doc);
        const nextBlocks: Block[] = [];
        const sections = doc.sections?.length ? doc.sections : [{ children: [] }];
        sections.forEach((sec, sIdx) => {
          (sec.children ?? []).forEach((child) => {
            if (child.paragraph) {
              nextBlocks.push(paragraphToBlock(child.paragraph, sIdx));
            } else if (child.table) {
              nextBlocks.push(tableToBlock(child.table, sIdx));
            } else {
              nextBlocks.push({
                id: newBlockId(),
                sectionIndex: sIdx,
                kind: "other",
                alignment: "left",
                bulleted: false,
                initialHtml: "",
                raw: child,
              });
            }
          });
        });
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

  const docStats = useMemo(() => {
    let totalWords = 0;
    let totalChars = 0;
    for (const b of blocks) {
      if (b.kind === "paragraph" || b.kind === "callout") {
        const text = (b.initialHtml || "").replace(/<[^>]*>/g, " ").trim();
        if (text) {
          totalWords += text.split(/\s+/).filter(Boolean).length;
          totalChars += text.length;
        }
      }
    }
    const readTimeMin = Math.max(1, Math.ceil(totalWords / 200));
    return { words: totalWords, chars: totalChars, readTimeMin };
  }, [blocks]);

  const headings = useMemo(() => {
    return blocks
      .filter((b) => b.headingLevel != null)
      .map((b) => ({
        id: b.id,
        level: b.headingLevel!,
        text: (b.initialHtml || "").replace(/<[^>]*>/g, "").trim() || "Untitled Heading",
      }));
  }, [blocks]);

  const applyInline = (cmd: "bold" | "italic" | "underline" | "strikethrough") => {
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

  const insertParagraphAfter = (id: string, customKind: Block["kind"] = "paragraph") => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const section = prev[index]?.sectionIndex ?? 0;
      const block: Block = {
        id: newBlockId(),
        sectionIndex: section,
        kind: customKind,
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

  const insertTableAfter = (id: string) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const section = prev[index]?.sectionIndex ?? 0;
      const rows: TableCellBlock[][] = [
        [
          { id: newBlockId(), initialHtml: "Header 1" },
          { id: newBlockId(), initialHtml: "Header 2" },
          { id: newBlockId(), initialHtml: "Header 3" },
        ],
        [
          { id: newBlockId(), initialHtml: "Item 1" },
          { id: newBlockId(), initialHtml: "Item 2" },
          { id: newBlockId(), initialHtml: "Item 3" },
        ],
      ];
      const block: Block = {
        id: newBlockId(),
        sectionIndex: section,
        kind: "table",
        alignment: "left",
        bulleted: false,
        initialHtml: "",
        tableRows: rows,
      };
      const next = [...prev];
      next.splice(index + 1, 0, block);
      return next;
    });
    setDirty(true);
  };

  const insertDividerAfter = (id: string) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const section = prev[index]?.sectionIndex ?? 0;
      const block: Block = {
        id: newBlockId(),
        sectionIndex: section,
        kind: "divider",
        alignment: "left",
        bulleted: false,
        initialHtml: "",
      };
      const next = [...prev];
      next.splice(index + 1, 0, block);
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
              const text = cellEl ? cellEl.innerText.trim() : "";
              return {
                ...cellBlock.raw,
                children: [{ paragraph: { text } }],
              };
            });
            return { ...originalRow, cells };
          });
          children.push({ table: { ...originalTable, rows } });
          continue;
        }

        // Paragraphs & Callouts
        const el = blockRefs.current.get(block.id);
        const text = el ? el.innerText.trim() : "";
        const paragraph: ParagraphLike = {
          text,
          heading: block.headingLevel ? LEVEL_TO_HEADING[block.headingLevel] : undefined,
          alignment: UI_TO_ALIGN[block.alignment],
          bullet: block.bulleted ? { level: 0 } : undefined,
        };
        children.push({ paragraph });
      }

      const sections = (document_.sections ?? [{}]).map((sec, i) => ({
        ...sec,
        children: bySection.get(i) ?? [],
      }));

      await ipc.office.writeDocxFile({
        appId,
        relPath: filePath,
        document: { ...document_, sections },
      });
      setDirty(false);
      showSuccess("Document saved");
    } catch (e) {
      showError(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      {/* Enhanced Word Studio Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-background px-3 py-1.5 shadow-xs shrink-0">
        {/* Headings Selector */}
        <Select
          value={focusedBlock?.headingLevel ? String(focusedBlock.headingLevel) : "0"}
          onValueChange={(v) => {
            const level = v === "0" ? undefined : (Number(v) as 1 | 2 | 3 | 4);
            updateFocusedBlock({ headingLevel: level });
          }}
        >
          <MiniSelectTrigger className="h-7 w-28 text-xs font-medium">
            <SelectValue>
              {
                HEADING_SELECT_LABELS[
                  focusedBlock?.headingLevel ? String(focusedBlock.headingLevel) : "0"
                ]
              }
            </SelectValue>
          </MiniSelectTrigger>
          <SelectContent>
            <SelectItem value="0">Normal</SelectItem>
            <SelectItem value="1">Heading 1</SelectItem>
            <SelectItem value="2">Heading 2</SelectItem>
            <SelectItem value="3">Heading 3</SelectItem>
            <SelectItem value="4">Heading 4</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 h-5 w-px bg-border/60" />

        {/* Inline Formatting */}
        <Toggle
          size="sm"
          pressed={isBold}
          onPressedChange={() => applyInline("bold")}
          title="Bold (Ctrl+B)"
          className="h-7 w-7 p-0"
        >
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={isItalic}
          onPressedChange={() => applyInline("italic")}
          title="Italic (Ctrl+I)"
          className="h-7 w-7 p-0"
        >
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={isUnderline}
          onPressedChange={() => applyInline("underline")}
          title="Underline (Ctrl+U)"
          className="h-7 w-7 p-0"
        >
          <Underline className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={isStrike}
          onPressedChange={() => applyInline("strikethrough")}
          title="Strikethrough"
          className="h-7 w-7 p-0"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </Toggle>

        <div className="mx-1 h-5 w-px bg-border/60" />

        {/* Alignment */}
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "left"}
          onPressedChange={() => updateFocusedBlock({ alignment: "left" })}
          title="Align Left"
          className="h-7 w-7 p-0"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "center"}
          onPressedChange={() => updateFocusedBlock({ alignment: "center" })}
          title="Align Center"
          className="h-7 w-7 p-0"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "right"}
          onPressedChange={() => updateFocusedBlock({ alignment: "right" })}
          title="Align Right"
          className="h-7 w-7 p-0"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={focusedBlock?.alignment === "justify"}
          onPressedChange={() => updateFocusedBlock({ alignment: "justify" })}
          title="Justify"
          className="h-7 w-7 p-0"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </Toggle>

        <div className="mx-1 h-5 w-px bg-border/60" />

        {/* Lists & Inserts */}
        <Toggle
          size="sm"
          pressed={!!focusedBlock?.bulleted}
          onPressedChange={(pressed) => updateFocusedBlock({ bulleted: pressed })}
          title="Bullet list"
          className="h-7 w-7 p-0"
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => insertTableAfter(focusedBlockId ?? blocks[blocks.length - 1].id)}
              >
                <TableIcon size={14} />
              </Button>
            }
          />
          <TooltipContent>Insert Table</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  insertParagraphAfter(focusedBlockId ?? blocks[blocks.length - 1].id, "callout")
                }
              >
                <Quote size={14} />
              </Button>
            }
          />
          <TooltipContent>Insert Callout Container</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => insertDividerAfter(focusedBlockId ?? blocks[blocks.length - 1].id)}
              >
                <Minus size={14} />
              </Button>
            }
          />
          <TooltipContent>Insert Horizontal Divider</TooltipContent>
        </Tooltip>

        {/* Document Stats & Outline */}
        <div className="ml-auto flex items-center gap-2">
          {headings.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-[11px] font-medium text-muted-foreground",
                showOutline && "bg-muted text-foreground",
              )}
              onClick={() => setShowOutline((v) => !v)}
            >
              <ListTree size={12} />
              <span>Outline</span>
            </Button>
          )}

          <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
            {docStats.words} words • ~{docStats.readTimeMin}m
          </span>

          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Main Document Layout (Outline Drawer + Printable Page Canvas) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showOutline && headings.length > 0 && (
          <div className="w-56 shrink-0 border-r border-border/60 bg-background/50 p-3 overflow-y-auto space-y-1">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1">
              Document Outline
            </div>
            {headings.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const el = blockRefs.current.get(h.id);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.focus();
                }}
                className={cn(
                  "w-full truncate text-left text-xs py-1 px-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
                  h.level === 1 && "font-semibold text-foreground",
                  h.level === 2 && "pl-3",
                  h.level >= 3 && "pl-5 text-[11px]",
                )}
              >
                <ChevronRight size={10} className="shrink-0 text-muted-foreground/60" />
                <span className="truncate">{h.text}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="w-full max-w-3xl rounded-xl border border-border/70 bg-background p-12 shadow-md space-y-3">
            {blocks.map((block) =>
              block.kind === "other" ? (
                <OtherBlockPreview key={block.id} raw={block.raw!} />
              ) : block.kind === "table" ? (
                <div
                  key={block.id}
                  className="my-4 overflow-x-auto rounded-lg border border-border/60"
                >
                  <table className="w-full table-fixed border-collapse">
                    <tbody>
                      {(block.tableRows ?? []).map((row, r) => (
                        <tr
                          key={r}
                          className={
                            r === 0
                              ? "bg-muted/50 font-semibold"
                              : r % 2 === 1
                                ? "bg-muted/10"
                                : "bg-background"
                          }
                        >
                          {row.map((cellBlock) => (
                            <td key={cellBlock.id} className="border border-border/40 align-top">
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
                                className="min-h-[1.5em] px-2.5 py-1.5 text-xs leading-snug outline-none focus:bg-accent/20"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : block.kind === "divider" ? (
                <div key={block.id} className="my-4 flex items-center gap-2 group">
                  <hr className="flex-1 border-t border-border/80" />
                  <button
                    type="button"
                    className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                    onClick={() => deleteBlock(block.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ) : block.kind === "callout" ? (
                <div
                  key={block.id}
                  className="my-3 rounded-lg border border-border/60 border-l-4 border-l-primary bg-primary/5 p-4 flex items-start justify-between group"
                >
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
                    className="min-h-[1.5em] flex-1 text-xs leading-relaxed outline-none"
                  />
                  <button
                    type="button"
                    className="hidden text-muted-foreground hover:text-destructive group-hover:block ml-2"
                    onClick={() => deleteBlock(block.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
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
                      "min-h-[1.75em] flex-1 rounded px-1.5 py-0.5 leading-relaxed outline-none focus:bg-accent/20 transition-colors",
                      block.headingLevel === 1 &&
                        "text-2xl font-bold text-foreground mt-4 mb-2 tracking-tight",
                      block.headingLevel === 2 &&
                        "text-xl font-bold text-foreground mt-3 mb-1.5 tracking-tight",
                      block.headingLevel === 3 && "text-lg font-semibold text-foreground mt-2 mb-1",
                      block.headingLevel === 4 &&
                        "text-base font-semibold text-foreground mt-1.5 mb-1",
                      !block.headingLevel && "text-xs text-foreground/90 my-1",
                      block.alignment === "center" && "text-center",
                      block.alignment === "right" && "text-right",
                      block.alignment === "justify" && "text-justify",
                      block.bulleted && "list-disc pl-5 marker:text-primary [display:list-item]",
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

            <div className="pt-4 border-t border-border/40 flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => insertParagraphAfter(blocks[blocks.length - 1].id)}
              >
                <Plus size={13} /> Paragraph
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => insertTableAfter(blocks[blocks.length - 1].id)}
              >
                <TableIcon size={13} /> Table
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => insertParagraphAfter(blocks[blocks.length - 1].id, "callout")}
              >
                <Quote size={13} /> Callout Card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => insertDividerAfter(blocks[blocks.length - 1].id)}
              >
                <Minus size={13} /> Divider
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
