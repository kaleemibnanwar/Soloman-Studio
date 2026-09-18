import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Minus,
  Search,
  Redo2,
  Undo2,
  Save,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Paintbrush,
  Type,
  Copy,
  Scissors,
  ClipboardPaste,
  Eraser,
  ListChecks,
  ArrowDownAZ,
  ArrowUpAZ,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  MiniSelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import {
  type CellPos,
  type CellStyle,
  type GridData,
  type SelectionRange,
  type SheetState,
  cloneSheets,
  colIndexToLetters,
  emptySheet,
  formatCellDisplay,
  isInRange,
  makeGrid,
  normalizeRange,
  optionChipStyle,
  optionColorVar,
  parseNumeric,
} from "./types";
import { gridToTsv, tsvToGrid } from "./clipboard";
import { type Bounds, commitFill, computeFillPreview } from "./fill";
import {
  evaluateWorkbook,
  formulaValueToDisplayString,
  isFormula,
  isFormulaError,
  shiftFormulaRefs,
} from "./formulaEngine";

const ROW_HEADER_WIDTH = 44;
const DEFAULT_COL_WIDTH = 100;
const MIN_COL_WIDTH = 44;
const MAX_HISTORY = 100;

interface ContextMenuState {
  x: number;
  y: number;
  kind: "cell" | "row" | "col";
  row?: number;
  col?: number;
}

export interface SpreadsheetGridProps {
  fileLabel: string;
  initialSheets: SheetState[];
  allowMultipleSheets: boolean;
  allowFormatting: boolean;
  onSave: (sheets: SheetState[]) => Promise<void>;
}

function selectionBounds(selection: SelectionRange, grid: GridData) {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(selection);
  return {
    minRow: Math.max(0, minRow),
    maxRow: Math.min(grid.length - 1, maxRow),
    minCol: Math.max(0, minCol),
    maxCol: Math.min((grid[0]?.length ?? 1) - 1, maxCol),
  };
}

/** A1, or A1:B3 for a range spanning two distinct cells. */
function cellRefString(a: CellPos, b?: CellPos): string {
  const ref1 = `${colIndexToLetters(a.col)}${a.row + 1}`;
  if (!b || (b.row === a.row && b.col === a.col)) return ref1;
  const ref2 = `${colIndexToLetters(b.col)}${b.row + 1}`;
  return `${ref1}:${ref2}`;
}

export function SpreadsheetGrid({
  fileLabel,
  initialSheets,
  allowMultipleSheets,
  allowFormatting,
  onSave,
}: SpreadsheetGridProps) {
  const [history, setHistory] = useState<SheetState[][]>([initialSheets]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [savedIndex, setSavedIndex] = useState(0);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [colWidths, setColWidths] = useState<Record<string, number[]>>({});
  const [selection, setSelection] = useState<SelectionRange | null>(
    initialSheets.length > 0 ? { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } } : null,
  );
  const [editing, setEditing] = useState<{ pos: CellPos; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingSheet, setRenamingSheet] = useState<{ index: number; value: string } | null>(
    null,
  );
  const [fillPreview, setFillPreview] = useState<Bounds | null>(null);
  const [selecting, setSelecting] = useState<CellPos | null>(null);
  const [optionsPrompt, setOptionsPrompt] = useState<{ x: number; y: number; value: string } | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);
  const clipboardRef = useRef<GridData | null>(null);
  const clipboardOriginRef = useRef<CellPos | null>(null);
  const isFillDraggingRef = useRef(false);
  const fillOriginRef = useRef<Bounds | null>(null);
  const fillPreviewRef = useRef<Bounds | null>(null);
  const resizeRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);
  const draggedTabRef = useRef<number | null>(null);
  const isInsertingRefRef = useRef(false);
  const refInsertOriginRef = useRef<CellPos | null>(null);
  const refInsertStartRef = useRef<number | null>(null);

  const sheets = history[historyIndex];
  const computedValues = useMemo(() => evaluateWorkbook(sheets), [sheets]);
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];
  const grid = activeSheet.grid;
  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;
  const widths = colWidths[activeSheet.id] ?? Array.from({ length: colCount }, () => DEFAULT_COL_WIDTH);
  const dirty = historyIndex !== savedIndex;

  const computedGrid = useMemo(() => {
    const values = computedValues.get(activeSheet.id);
    if (!values) return grid.map((row) => row.map((cell) => cell.text));
    return values.map((row) => row.map(formulaValueToDisplayString));
  }, [computedValues, activeSheet.id, grid]);

  const selBounds = selection ? selectionBounds(selection, grid) : null;

  const activeCell = editing?.pos ?? selection?.focus ?? null;
  const activeCellData = activeCell ? grid[activeCell.row]?.[activeCell.col] : undefined;

  const gridTemplateColumns = useMemo(
    () => `${ROW_HEADER_WIDTH}px ${widths.map((w) => `${w}px`).join(" ")}`,
    [widths],
  );

  const commit = useCallback((nextSheets: SheetState[]) => {
    setHistory((prev) => {
      const truncated = prev.slice(0, historyIndex + 1);
      const next = [...truncated, nextSheets].slice(-MAX_HISTORY);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  const updateActiveGrid = useCallback(
    (updater: (grid: GridData) => GridData) => {
      const next = cloneSheets(sheets);
      next[activeSheetIndex] = { ...next[activeSheetIndex], grid: updater(next[activeSheetIndex].grid) };
      commit(next);
    },
    [sheets, activeSheetIndex, commit],
  );

  const ensureSize = (g: GridData, rows: number, cols: number): GridData => {
    let next = g;
    if (next.length < rows) {
      const width = next[0]?.length ?? cols;
      next = [...next, ...Array.from({ length: rows - next.length }, () => makeGrid(1, width)[0])];
    }
    if ((next[0]?.length ?? 0) < cols) {
      next = next.map((row) => [
        ...row,
        ...Array.from({ length: cols - row.length }, () => ({ text: "" })),
      ]);
    }
    return next;
  };

  const undo = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex((i) => i - 1);
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) setHistoryIndex((i) => i + 1);
  }, [historyIndex, history.length]);

  const commitEdit = useCallback(
    (pos: CellPos, value: string) => {
      updateActiveGrid((g) => {
        const next = ensureSize(g, pos.row + 1, pos.col + 1).map((row) => [...row]);
        next[pos.row][pos.col] = { ...next[pos.row][pos.col], text: value };
        return next;
      });
    },
    [updateActiveGrid],
  );

  const finishEditing = useCallback(
    (save: boolean) => {
      if (!editing) return;
      if (save) commitEdit(editing.pos, editing.value);
      setEditing(null);
    },
    [editing, commitEdit],
  );

  const startEditing = (pos: CellPos, initialValue?: string) => {
    const current = grid[pos.row]?.[pos.col]?.text ?? "";
    setEditing({ pos, value: initialValue ?? current });
  };

  const moveFocus = (delta: { row: number; col: number }, extend: boolean) => {
    setSelection((prev) => {
      const base = prev?.focus ?? { row: 0, col: 0 };
      const nextFocus: CellPos = {
        row: Math.max(0, Math.min(rowCount - 1, base.row + delta.row)),
        col: Math.max(0, Math.min(colCount - 1, base.col + delta.col)),
      };
      return { anchor: extend ? (prev?.anchor ?? nextFocus) : nextFocus, focus: nextFocus };
    });
  };

  const applyStyle = (patch: CellStyle) => {
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection, grid);
    updateActiveGrid((g) =>
      g.map((row, r) =>
        row.map((cell, c) => {
          if (r < minRow || r > maxRow || c < minCol || c > maxCol) return cell;
          const style = { ...cell.style, ...patch };
          return { ...cell, style };
        }),
      ),
    );
  };

  const toggleStyle = (key: "bold" | "italic" | "underline") => {
    const current = activeCellData?.style?.[key];
    applyStyle({ [key]: !current });
  };

  const openOptionsPrompt = (anchor: { x: number; y: number }) => {
    const existing = activeCellData?.style?.options;
    setOptionsPrompt({ x: anchor.x, y: anchor.y, value: existing?.join(", ") ?? "" });
  };

  const applyOptionsPrompt = () => {
    if (!optionsPrompt) return;
    const options = optionsPrompt.value
      .split(",")
      .map((s) => s.trim())
      .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i);
    applyStyle({ options: options.length > 0 ? options : undefined });
    setOptionsPrompt(null);
  };

  const removeOptions = () => {
    applyStyle({ options: undefined });
    setOptionsPrompt(null);
  };

  const clearSelection = () => {
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection, grid);
    updateActiveGrid((g) =>
      g.map((row, r) =>
        row.map((cell, c) =>
          r >= minRow && r <= maxRow && c >= minCol && c <= maxCol ? { text: "" } : cell,
        ),
      ),
    );
  };

  const copySelection = async () => {
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection, grid);
    const region = grid.slice(minRow, maxRow + 1).map((row) => row.slice(minCol, maxCol + 1));
    clipboardRef.current = region;
    clipboardOriginRef.current = { row: minRow, col: minCol };
    const displayRegion = computedGrid
      .slice(minRow, maxRow + 1)
      .map((row) => row.slice(minCol, maxCol + 1).map((text) => ({ text })));
    try {
      await navigator.clipboard.writeText(gridToTsv(displayRegion));
    } catch {
      // Clipboard permission denied - the in-memory fallback below still works for paste.
    }
  };

  const pasteAt = (pos: CellPos, region: GridData) => {
    updateActiveGrid((g) => {
      const next = ensureSize(g, pos.row + region.length, pos.col + (region[0]?.length ?? 0)).map(
        (row) => [...row],
      );
      for (let r = 0; r < region.length; r++) {
        for (let c = 0; c < region[r].length; c++) {
          next[pos.row + r][pos.col + c] = { ...region[r][c] };
        }
      }
      return next;
    });
  };

  const handlePaste = async () => {
    if (!selection) return;
    let region = clipboardRef.current;
    let origin = clipboardOriginRef.current;
    try {
      const text = await navigator.clipboard.readText();
      const lastCopiedTsv = clipboardRef.current
        ? gridToTsv(clipboardRef.current.map((row) => row.map((c) => ({ text: c.text }))))
        : null;
      if (text && text !== lastCopiedTsv) {
        region = tsvToGrid(text);
        origin = null;
      } else if (text && !region) {
        region = tsvToGrid(text);
      }
    } catch {
      // Fall back to the in-memory clipboard captured on our own last copy/cut.
    }
    if (!region) return;
    const target = selection.focus;
    let pasteRegion = region;
    if (origin) {
      const rowDelta = target.row - origin.row;
      const colDelta = target.col - origin.col;
      if (rowDelta !== 0 || colDelta !== 0) {
        pasteRegion = region.map((row) =>
          row.map((cell) =>
            isFormula(cell.text)
              ? { ...cell, text: `=${shiftFormulaRefs(cell.text.slice(1), rowDelta, colDelta)}` }
              : cell,
          ),
        );
      }
    }
    pasteAt(target, pasteRegion);
  };

  const handleCut = async () => {
    await copySelection();
    clearSelection();
  };

  // Sheet management
  const addSheet = () => {
    const next = [...sheets, emptySheet(`Sheet${sheets.length + 1}`)];
    commit(next);
    setActiveSheetIndex(next.length - 1);
  };

  const deleteSheet = (index: number) => {
    if (sheets.length <= 1) return;
    const next = sheets.filter((_, i) => i !== index);
    commit(next);
    setActiveSheetIndex((cur) => Math.max(0, cur >= next.length ? next.length - 1 : cur === index ? Math.max(0, index - 1) : cur));
  };

  const renameSheet = (index: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = sheets.map((s, i) => (i === index ? { ...s, name: trimmed } : s));
    commit(next);
  };

  const reorderSheets = (from: number, to: number) => {
    if (from === to) return;
    const next = [...sheets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
    setActiveSheetIndex(to);
  };

  // Row / column structural edits
  const insertRow = (at: number) => {
    updateActiveGrid((g) => {
      const width = g[0]?.length ?? 1;
      const blank = Array.from({ length: width }, () => ({ text: "" }));
      const next = [...g];
      next.splice(at, 0, blank);
      return next;
    });
  };

  const deleteRow = (at: number) => {
    updateActiveGrid((g) => (g.length <= 1 ? g : g.filter((_, i) => i !== at)));
  };

  const insertCol = (at: number) => {
    updateActiveGrid((g) => g.map((row) => {
      const next = [...row];
      next.splice(at, 0, { text: "" });
      return next;
    }));
    setColWidths((prev) => {
      const w = [...(prev[activeSheet.id] ?? Array.from({ length: colCount }, () => DEFAULT_COL_WIDTH))];
      w.splice(at, 0, DEFAULT_COL_WIDTH);
      return { ...prev, [activeSheet.id]: w };
    });
  };

  const deleteCol = (at: number) => {
    updateActiveGrid((g) => (colCount <= 1 ? g : g.map((row) => row.filter((_, i) => i !== at))));
    setColWidths((prev) => {
      const w = (prev[activeSheet.id] ?? []).filter((_, i) => i !== at);
      return { ...prev, [activeSheet.id]: w };
    });
  };

  /**
   * Sorts by computed value (numeric-aware) so formula results sort correctly,
   * not just their text. Row 1 is always treated as a header and stays put.
   * Formula cells get their row references shifted by how far their row
   * moved, so e.g. "=B2*2" in a row that moves from index 2 to 5 becomes
   * "=B5*2" - otherwise sorting would silently point formulas at whatever
   * ended up in their old position.
   */
  const sortColumn = (col: number, direction: "asc" | "desc") => {
    updateActiveGrid((g) => {
      if (g.length <= 1) return g;
      const values = computedValues.get(activeSheet.id);
      const header = g[0];
      const bodyRows = g.slice(1).map((row, i) => ({ row, originalIndex: i, computed: values?.[i + 1]?.[col] }));
      bodyRows.sort((a, b) => {
        const na = typeof a.computed === "number" ? a.computed : parseNumeric(a.row[col]?.text ?? "");
        const nb = typeof b.computed === "number" ? b.computed : parseNumeric(b.row[col]?.text ?? "");
        const cmp =
          na != null && nb != null
            ? na - nb
            : String(a.computed ?? a.row[col]?.text ?? "").localeCompare(
                String(b.computed ?? b.row[col]?.text ?? ""),
              );
        return direction === "asc" ? cmp : -cmp;
      });
      const sortedRows = bodyRows.map(({ row, originalIndex }, newIndex) => {
        const rowDelta = newIndex - originalIndex;
        if (rowDelta === 0) return row;
        return row.map((cell) =>
          isFormula(cell.text)
            ? { ...cell, text: `=${shiftFormulaRefs(cell.text.slice(1), rowDelta, 0)}` }
            : cell,
        );
      });
      return [header, ...sortedRows];
    });
  };

  // Find & replace
  const matches = useMemo(() => {
    if (!findQuery) return [] as CellPos[];
    const q = findQuery.toLowerCase();
    const found: CellPos[] = [];
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.text.toLowerCase().includes(q)) found.push({ row: r, col: c });
      }),
    );
    return found;
  }, [findQuery, grid]);

  useEffect(() => {
    setFindMatchIndex(0);
  }, [findQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const pos = matches[findMatchIndex % matches.length];
    setSelection({ anchor: pos, focus: pos });
  }, [findMatchIndex, matches]);

  const replaceAll = () => {
    if (!findQuery) return;
    const q = findQuery.toLowerCase();
    updateActiveGrid((g) =>
      g.map((row) =>
        row.map((cell) =>
          cell.text.toLowerCase().includes(q)
            ? { ...cell, text: cell.text.split(new RegExp(findQuery, "gi")).join(replaceQuery) }
            : cell,
        ),
      ),
    );
  };

  // Keyboard handling
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (selecting) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        setSelecting(null);
      }
      return;
    }
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        finishEditing(false);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        finishEditing(true);
        moveFocus({ row: 1, col: 0 }, false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        finishEditing(true);
        moveFocus({ row: 0, col: e.shiftKey ? -1 : 1 }, false);
      }
      return;
    }

    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && e.key === "c") {
      e.preventDefault();
      void copySelection();
      return;
    }
    if (mod && e.key === "x") {
      e.preventDefault();
      void handleCut();
      return;
    }
    if (mod && e.key === "v") {
      e.preventDefault();
      void handlePaste();
      return;
    }
    if (mod && e.key === "a") {
      e.preventDefault();
      setSelection({ anchor: { row: 0, col: 0 }, focus: { row: rowCount - 1, col: colCount - 1 } });
      return;
    }
    if (mod && e.key === "f") {
      e.preventDefault();
      setFindOpen(true);
      return;
    }
    if (mod && e.key === "s") {
      e.preventDefault();
      void handleSave();
      return;
    }
    if (allowFormatting && mod && (e.key === "b" || e.key === "i" || e.key === "u")) {
      e.preventDefault();
      toggleStyle(e.key === "b" ? "bold" : e.key === "i" ? "italic" : "underline");
      return;
    }
    if (!selection) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus({ row: -1, col: 0 }, e.shiftKey);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus({ row: 1, col: 0 }, e.shiftKey);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus({ row: 0, col: -1 }, e.shiftKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus({ row: 0, col: 1 }, e.shiftKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveFocus({ row: 0, col: e.shiftKey ? -1 : 1 }, false);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (grid[selection.focus.row]?.[selection.focus.col]?.style?.options?.length) {
        setSelecting(selection.focus);
      } else {
        startEditing(selection.focus);
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clearSelection();
    } else if (e.key.length === 1 && !e.altKey) {
      // Without this, focus shifts to the newly-mounted cell <input> mid-keystroke
      // and the browser's own default key handling inserts the character a second
      // time on top of the one startEditing already seeded - e.g. typing "=" to
      // start a formula produced "==" instead of "=".
      e.preventDefault();
      startEditing(selection.focus, e.key);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sheets);
      setSavedIndex(historyIndex);
      showSuccess("Saved");
    } catch (err) {
      showError(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  // Column resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const delta = e.clientX - resize.startX;
      setColWidths((prev) => {
        const w = [...(prev[activeSheet.id] ?? Array.from({ length: colCount }, () => DEFAULT_COL_WIDTH))];
        w[resize.col] = Math.max(MIN_COL_WIDTH, resize.startWidth + delta);
        return { ...prev, [activeSheet.id]: w };
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      if (isFillDraggingRef.current) {
        isFillDraggingRef.current = false;
        const origin = fillOriginRef.current;
        const target = fillPreviewRef.current;
        if (origin && target && (target.maxRow > origin.maxRow || target.maxCol > origin.maxCol)) {
          updateActiveGrid((g) => {
            const patches = commitFill(origin, target, g);
            const next = g.map((row) => [...row]);
            for (const p of patches) next[p.row][p.col] = p.cell;
            return next;
          });
          setSelection({ anchor: { row: target.minRow, col: target.minCol }, focus: { row: target.maxRow, col: target.maxCol } });
        }
        fillOriginRef.current = null;
        fillPreviewRef.current = null;
        setFillPreview(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [activeSheet.id, colCount, updateActiveGrid]);

  useEffect(() => {
    const onDocClick = () => {
      setContextMenu(null);
      setOptionsPrompt(null);
      setSelecting(null);
    };
    window.addEventListener("click", onDocClick);
    return () => window.removeEventListener("click", onDocClick);
  }, []);

  const NUMBER_FORMATS: { value: NonNullable<CellStyle["numberFormat"]>; label: string }[] = [
    { value: "general", label: "General" },
    { value: "number", label: "Number" },
    { value: "integer", label: "Integer" },
    { value: "currency", label: "Currency" },
    { value: "percent", label: "Percent" },
    { value: "date", label: "Date" },
  ];

  return (
    <div className="flex h-full flex-col" onClick={() => setContextMenu(null)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Undo (Ctrl+Z)" disabled={historyIndex === 0} onClick={undo}>
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Redo (Ctrl+Y)" disabled={historyIndex === history.length - 1} onClick={redo}>
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        {allowFormatting && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <Toggle size="sm" pressed={!!activeCellData?.style?.bold} onPressedChange={() => toggleStyle("bold")} title="Bold (Ctrl+B)">
              <Bold className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={!!activeCellData?.style?.italic} onPressedChange={() => toggleStyle("italic")} title="Italic (Ctrl+I)">
              <Italic className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={!!activeCellData?.style?.underline} onPressedChange={() => toggleStyle("underline")} title="Underline (Ctrl+U)">
              <Underline className="h-3.5 w-3.5" />
            </Toggle>

            <Popover>
              <PopoverTrigger
                render={
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Text color">
                    <Type className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <PopoverContent className="w-56">
                <ColorPicker
                  id="text-color"
                  value={activeCellData?.style?.color ?? "#000000"}
                  onChange={(color) => applyStyle({ color })}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger
                render={
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Fill color">
                    <Paintbrush className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <PopoverContent className="w-56">
                <ColorPicker
                  id="fill-color"
                  value={activeCellData?.style?.fill ?? "#ffffff"}
                  onChange={(fill) => applyStyle({ fill })}
                />
              </PopoverContent>
            </Popover>

            <div className="mx-1 h-5 w-px bg-border" />
            <Toggle size="sm" pressed={activeCellData?.style?.align === "left"} onPressedChange={() => applyStyle({ align: "left" })} title="Align left">
              <AlignLeft className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={activeCellData?.style?.align === "center"} onPressedChange={() => applyStyle({ align: "center" })} title="Align center">
              <AlignCenter className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={activeCellData?.style?.align === "right"} onPressedChange={() => applyStyle({ align: "right" })} title="Align right">
              <AlignRight className="h-3.5 w-3.5" />
            </Toggle>

            <Select
              value={activeCellData?.style?.numberFormat ?? "general"}
              onValueChange={(v) => applyStyle({ numberFormat: v as CellStyle["numberFormat"] })}
            >
              <MiniSelectTrigger className="ml-1 h-7 text-xs">
                <SelectValue>
                  {(v: string) => NUMBER_FORMATS.find((f) => f.value === v)?.label ?? "General"}
                </SelectValue>
              </MiniSelectTrigger>
              <SelectContent>
                {NUMBER_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Dropdown list (Stage/Status options)"
              disabled={!selection}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                openOptionsPrompt({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => insertRow(rowCount)}>
          <Plus className="h-3 w-3" /> Row
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => insertCol(colCount)}>
          <Plus className="h-3 w-3" /> Column
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Find & replace (Ctrl+F)" onClick={() => setFindOpen((v) => !v)}>
          <Search className="h-3.5 w-3.5" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {fileLabel}
            {dirty && " •"}
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b px-2 py-1">
        <span className="w-14 shrink-0 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground">
          {activeCell ? `${colIndexToLetters(activeCell.col)}${activeCell.row + 1}` : ""}
        </span>
        <Input
          className="h-7 flex-1 font-mono text-xs"
          value={editing ? editing.value : (activeCellData?.text ?? "")}
          onChange={(e) => {
            if (!activeCell) return;
            setEditing({ pos: activeCell, value: e.target.value });
          }}
          onFocus={() => {
            if (activeCell && !editing) startEditing(activeCell);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishEditing(true);
              moveFocus({ row: 1, col: 0 }, false);
            } else if (e.key === "Escape") {
              finishEditing(false);
            }
          }}
        />
      </div>

      {/* Find & replace */}
      {findOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
          <Input
            autoFocus
            placeholder="Find"
            className="h-7 w-40 text-xs"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
          />
          <Input
            placeholder="Replace with"
            className="h-7 w-40 text-xs"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {matches.length > 0 ? `${(findMatchIndex % matches.length) + 1}/${matches.length}` : "0/0"}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={matches.length === 0} onClick={() => setFindMatchIndex((i) => i - 1)}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={matches.length === 0} onClick={() => setFindMatchIndex((i) => i + 1)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!findQuery} onClick={replaceAll}>
            Replace all
          </Button>
          <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => setFindOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Grid */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        <div style={{ display: "grid", gridTemplateColumns, width: "max-content" }}>
          <div
            className="sticky top-0 left-0 z-20 border-b border-r bg-muted"
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          {widths.map((w, c) => (
            <div
              key={c}
              className="sticky top-0 z-10 cursor-pointer select-none border-b border-r bg-muted px-1.5 py-1 text-center text-xs font-medium text-muted-foreground"
              style={{ gridColumn: c + 2, gridRow: 1, position: "sticky", width: w }}
              onClick={() => {
                if (editing && editing.value.startsWith("=")) {
                  const ref = `${colIndexToLetters(c)}:${colIndexToLetters(c)}`;
                  setEditing((prev) => (prev ? { ...prev, value: prev.value + ref } : prev));
                  return;
                }
                setSelection({ anchor: { row: 0, col: c }, focus: { row: rowCount - 1, col: c } });
                containerRef.current?.focus();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, kind: "col", col: c });
              }}
            >
              {colIndexToLetters(c)}
              <div
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  resizeRef.current = { col: c, startX: e.clientX, startWidth: w };
                }}
              />
            </div>
          ))}

          {grid.map((row, r) => (
            <div key={r} style={{ display: "contents" }}>
              <div
                className="sticky left-0 z-10 cursor-pointer select-none border-b border-r bg-muted px-1.5 py-1 text-center text-xs text-muted-foreground"
                style={{ gridColumn: 1, gridRow: r + 2 }}
                onClick={() => {
                  if (editing && editing.value.startsWith("=")) {
                    const ref = `${r + 1}:${r + 1}`;
                    setEditing((prev) => (prev ? { ...prev, value: prev.value + ref } : prev));
                    return;
                  }
                  setSelection({ anchor: { row: r, col: 0 }, focus: { row: r, col: colCount - 1 } });
                  containerRef.current?.focus();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, kind: "row", row: r });
                }}
              >
                {r + 1}
              </div>
              {row.map((cell, c) => {
                const pos = { row: r, col: c };
                const isEditing = editing?.pos.row === r && editing.pos.col === c;
                const isSelectingOptions = selecting?.row === r && selecting?.col === c;
                const isFocus = selection?.focus.row === r && selection.focus.col === c;
                const isSelected = selection ? isInRange(pos, selection) : false;
                const isFillHandleCell = !!selBounds && r === selBounds.maxRow && c === selBounds.maxCol;
                const inFillPreview =
                  !!fillPreview &&
                  !!selBounds &&
                  r >= fillPreview.minRow &&
                  r <= fillPreview.maxRow &&
                  c >= fillPreview.minCol &&
                  c <= fillPreview.maxCol &&
                  !(r >= selBounds.minRow && r <= selBounds.maxRow && c >= selBounds.minCol && c <= selBounds.maxCol);
                const options = cell.style?.options;
                const computedText = computedGrid[r]?.[c] ?? cell.text;
                return (
                  <div
                    key={c}
                    className={cn(
                      "relative border-b border-r px-1.5 py-1 text-xs",
                      isSelected && "bg-primary/10",
                      isFocus && "outline outline-2 -outline-offset-1 outline-primary",
                      inFillPreview && "outline outline-1 outline-dashed outline-primary/70",
                    )}
                    style={{
                      gridColumn: c + 2,
                      gridRow: r + 2,
                      backgroundColor: !isSelected ? cell.style?.fill : undefined,
                      color: cell.style?.color,
                      fontWeight: cell.style?.bold ? 600 : undefined,
                      fontStyle: cell.style?.italic ? "italic" : undefined,
                      textDecoration: cell.style?.underline ? "underline" : undefined,
                      textAlign: cell.style?.align,
                    }}
                    onMouseDown={(e) => {
                      // Clicking a cell while composing a formula inserts its reference at the
                      // end of what's typed so far - the standard "click to reference" flow -
                      // instead of navigating away and blurring (which would commit the
                      // in-progress "=SUM(" text as a literal value and corrupt the formula).
                      if (editing && editing.value.startsWith("=")) {
                        e.preventDefault();
                        isInsertingRefRef.current = true;
                        refInsertOriginRef.current = pos;
                        refInsertStartRef.current = editing.value.length;
                        setEditing((prev) =>
                          prev ? { ...prev, value: prev.value + cellRefString(pos) } : prev,
                        );
                        return;
                      }
                      isSelectingRef.current = true;
                      setSelection({ anchor: e.shiftKey ? (selection?.anchor ?? pos) : pos, focus: pos });
                      containerRef.current?.focus();
                    }}
                    onMouseEnter={() => {
                      if (isInsertingRefRef.current && refInsertOriginRef.current && refInsertStartRef.current != null) {
                        const ref = cellRefString(refInsertOriginRef.current, pos);
                        const start = refInsertStartRef.current;
                        setEditing((prev) => (prev ? { ...prev, value: prev.value.slice(0, start) + ref } : prev));
                      } else if (isFillDraggingRef.current && fillOriginRef.current) {
                        const next = computeFillPreview(fillOriginRef.current, pos);
                        fillPreviewRef.current = next;
                        setFillPreview(next);
                      } else if (isSelectingRef.current) {
                        setSelection((prev) => ({ anchor: prev?.anchor ?? pos, focus: pos }));
                      }
                    }}
                    onMouseUp={() => {
                      isSelectingRef.current = false;
                      isInsertingRefRef.current = false;
                      refInsertOriginRef.current = null;
                      refInsertStartRef.current = null;
                    }}
                    onDoubleClick={() => (options?.length ? setSelecting(pos) : startEditing(pos))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!selection || !isInRange(pos, selection)) {
                        setSelection({ anchor: pos, focus: pos });
                      }
                      setContextMenu({ x: e.clientX, y: e.clientY, kind: "cell" });
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className="absolute inset-0 h-full w-full bg-background px-1.5 py-1 text-xs outline outline-2 outline-primary"
                        value={editing.value}
                        onChange={(e) => setEditing({ pos, value: e.target.value })}
                        onBlur={() => finishEditing(true)}
                      />
                    ) : options && options.length > 0 ? (
                      <button
                        type="button"
                        className="flex h-full w-full items-center gap-1 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelecting(pos);
                        }}
                      >
                        {computedText ? (
                          <span
                            className="truncate rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"
                            style={optionChipStyle(optionColorVar(options, computedText))}
                          >
                            {computedText}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Select…</span>
                        )}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "block truncate",
                          isFormula(cell.text) && isFormulaError(computedText) && "font-medium text-destructive",
                        )}
                        title={isFormula(cell.text) && isFormulaError(computedText) ? computedText : undefined}
                      >
                        {formatCellDisplay({ ...cell, text: computedText })}
                      </span>
                    )}

                    {isSelectingOptions && options && (
                      <div
                        className="absolute left-0 top-full z-30 mt-0.5 min-w-[9rem] max-w-[16rem] rounded-md border bg-popover p-1 shadow-md"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                          onClick={() => {
                            commitEdit(pos, "");
                            setSelecting(null);
                          }}
                        >
                          Clear
                        </button>
                        {options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                            onClick={() => {
                              commitEdit(pos, opt);
                              setSelecting(null);
                            }}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: `var(${optionColorVar(options, opt)})` }}
                            />
                            <span className="truncate">{opt}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {isFillHandleCell && !isEditing && (
                      <div
                        className="absolute -bottom-1 -right-1 z-20 h-2 w-2 cursor-crosshair rounded-sm border border-background bg-primary"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (!selBounds) return;
                          isFillDraggingRef.current = true;
                          fillOriginRef.current = selBounds;
                          fillPreviewRef.current = selBounds;
                          setFillPreview(selBounds);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Sheet tabs */}
      {allowMultipleSheets && (
        <div className="flex items-center gap-1 overflow-x-auto border-t bg-muted/30 px-2 py-1">
          {sheets.map((sheet, i) => (
            <div
              key={sheet.id}
              draggable
              onDragStart={() => {
                draggedTabRef.current = i;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedTabRef.current != null) reorderSheets(draggedTabRef.current, i);
                draggedTabRef.current = null;
              }}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs",
                i === activeSheetIndex
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-background/60",
              )}
            >
              {renamingSheet?.index === i ? (
                <input
                  autoFocus
                  className="w-20 bg-transparent outline-none"
                  value={renamingSheet.value}
                  onChange={(e) => setRenamingSheet({ index: i, value: e.target.value })}
                  onBlur={() => {
                    renameSheet(i, renamingSheet.value);
                    setRenamingSheet(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameSheet(i, renamingSheet.value);
                      setRenamingSheet(null);
                    } else if (e.key === "Escape") {
                      setRenamingSheet(null);
                    }
                  }}
                />
              ) : (
                <button type="button" onClick={() => setActiveSheetIndex(i)} onDoubleClick={() => setRenamingSheet({ index: i, value: sheet.name })}>
                  {sheet.name}
                </button>
              )}
              {sheets.length > 1 && renamingSheet?.index !== i && (
                <button
                  type="button"
                  className="hidden text-muted-foreground hover:text-destructive group-hover:inline"
                  onClick={() => deleteSheet(i)}
                  aria-label={`Delete ${sheet.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Add sheet" onClick={addSheet}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-sm shadow-md"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "cell" && (
            <>
              <ContextMenuButton icon={Copy} label="Copy" onClick={() => void copySelection()} />
              <ContextMenuButton icon={Scissors} label="Cut" onClick={() => void handleCut()} />
              <ContextMenuButton icon={ClipboardPaste} label="Paste" onClick={() => void handlePaste()} />
              <div className="my-1 h-px bg-border" />
              <ContextMenuButton icon={Eraser} label="Clear contents" onClick={clearSelection} />
              {allowFormatting && (
                <ContextMenuButton
                  icon={ListChecks}
                  label="Dropdown list options…"
                  onClick={() => {
                    const anchor = { x: contextMenu.x, y: contextMenu.y };
                    setContextMenu(null);
                    openOptionsPrompt(anchor);
                  }}
                />
              )}
            </>
          )}
          {contextMenu.kind === "row" && contextMenu.row != null && (
            <>
              <ContextMenuButton icon={Plus} label="Insert row above" onClick={() => insertRow(contextMenu.row!)} />
              <ContextMenuButton icon={Plus} label="Insert row below" onClick={() => insertRow(contextMenu.row! + 1)} />
              <div className="my-1 h-px bg-border" />
              <ContextMenuButton icon={Minus} label="Delete row" onClick={() => deleteRow(contextMenu.row!)} />
            </>
          )}
          {contextMenu.kind === "col" && contextMenu.col != null && (
            <>
              <ContextMenuButton icon={ArrowDownAZ} label="Sort A → Z" onClick={() => sortColumn(contextMenu.col!, "asc")} />
              <ContextMenuButton icon={ArrowUpAZ} label="Sort Z → A" onClick={() => sortColumn(contextMenu.col!, "desc")} />
              <div className="my-1 h-px bg-border" />
              <ContextMenuButton icon={Plus} label="Insert column left" onClick={() => insertCol(contextMenu.col!)} />
              <ContextMenuButton icon={Plus} label="Insert column right" onClick={() => insertCol(contextMenu.col! + 1)} />
              <div className="my-1 h-px bg-border" />
              <ContextMenuButton icon={Minus} label="Delete column" onClick={() => deleteCol(contextMenu.col!)} />
            </>
          )}
        </div>
      )}

      {/* Dropdown list options editor */}
      {optionsPrompt && (
        <div
          className="fixed z-50 w-64 rounded-md border bg-popover p-2 text-sm shadow-md"
          style={{ top: optionsPrompt.y, left: optionsPrompt.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 text-xs font-medium text-foreground">Dropdown options</div>
          <Input
            autoFocus
            value={optionsPrompt.value}
            onChange={(e) => setOptionsPrompt({ ...optionsPrompt, value: e.target.value })}
            placeholder="Not started, In progress, Done"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyOptionsPrompt();
              } else if (e.key === "Escape") {
                setOptionsPrompt(null);
              }
            }}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Comma-separated. Cells become a colored picker.</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={removeOptions}>
              Remove
            </Button>
            <Button size="sm" className="h-6 text-xs" onClick={applyOptionsPrompt}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
      onClick={onClick}
    >
      <Icon className="h-3 w-3 text-muted-foreground" />
      {label}
    </button>
  );
}
