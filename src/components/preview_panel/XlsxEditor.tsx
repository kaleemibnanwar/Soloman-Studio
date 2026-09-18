import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ipc } from "@/ipc/types";
import { SpreadsheetGrid } from "./spreadsheet/SpreadsheetGrid";
import {
  type CellPos,
  type CellStyle,
  type SheetState,
  makeGrid,
  makeRef,
  parseRef,
} from "./spreadsheet/types";
import { type FormulaValue, evaluateWorkbook, isFormula, isFormulaError } from "./spreadsheet/formulaEngine";

interface XlsxEditorProps {
  appId: number | null;
  filePath: string;
}

interface CellLike {
  reference?: string;
  value?: string | number | boolean | { text?: string; runs?: { text: string }[] } | null;
  formula?: string | { formula: string };
  error?: string;
  style?: unknown;
}

interface RowLike {
  rowNumber?: number;
  cells?: CellLike[];
}

interface DataValidationLike {
  sqref?: string;
  type?: string;
  formula1?: string;
}

interface WorksheetLike {
  name?: string;
  rows?: RowLike[];
  dataValidations?: DataValidationLike[];
  [key: string]: unknown;
}

interface WorkbookStyles {
  fonts?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[];
  fills?: { color?: string; type?: string }[];
  cellXfs?: { fontId?: number; fillId?: number; numFmtId?: number; alignment?: { horizontal?: string } }[];
  numFmts?: { numFmtId: number; formatCode: string }[];
  [key: string]: unknown;
}

/** The formula, if present, is the true source of truth - we recompute it ourselves rather than trusting the file's (possibly stale) cached value. */
function cellDisplayValue(cell: CellLike): string {
  if (cell.formula) {
    return typeof cell.formula === "string" ? `=${cell.formula}` : `=${cell.formula.formula}`;
  }
  const v = cell.value;
  if (v == null) {
    if (cell.error) return cell.error;
    return "";
  }
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.runs)) return v.runs.map((r) => r.text).join("");
  }
  return "";
}

/** Typed text back into a cell value: numbers/booleans round-trip as their native type, everything else stays a string. */
function parseCellInput(text: string): string | number | boolean | null {
  if (text === "") return null;
  if (text === "TRUE") return true;
  if (text === "FALSE") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function normalizeColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const clean = hex.replace(/^#/, "");
  if (clean.length === 8) return `#${clean.slice(2)}`;
  if (clean.length === 6) return `#${clean}`;
  return undefined;
}

function toHexColor(css: string | undefined): string | undefined {
  if (!css) return undefined;
  return css.replace(/^#/, "").toUpperCase();
}

function categorizeFormatCode(code: string): NonNullable<CellStyle["numberFormat"]> {
  if (/%/.test(code)) return "percent";
  if (/[$€£¥]/.test(code)) return "currency";
  if (/[dmy]/i.test(code) && !/0/.test(code)) return "date";
  if (/0/.test(code)) return "number";
  return "general";
}

function builtinNumFmtCategory(id: number): CellStyle["numberFormat"] | undefined {
  if (id === 0) return undefined;
  if (id === 9 || id === 10) return "percent";
  if (id >= 5 && id <= 8) return "currency";
  if (id >= 1 && id <= 4) return "number";
  if (id >= 14 && id <= 22) return "date";
  return undefined;
}

function resolveNumberFormat(
  workbook: WorkbookStyles,
  numFmtId: number | undefined,
): CellStyle["numberFormat"] | undefined {
  if (numFmtId == null) return undefined;
  const custom = workbook.numFmts?.find((f) => f.numFmtId === numFmtId);
  if (custom) return categorizeFormatCode(custom.formatCode);
  return builtinNumFmtCategory(numFmtId);
}

/** Resolves a parsed cell's style, which office-open returns as either an inline object or an index into the workbook's shared style table. */
function resolveCellStyle(workbook: WorkbookStyles, style: unknown): CellStyle | undefined {
  if (style == null) return undefined;
  const result: CellStyle = {};

  if (typeof style === "number") {
    const xf = workbook.cellXfs?.[style];
    if (!xf) return undefined;
    const font = xf.fontId != null ? workbook.fonts?.[xf.fontId] : undefined;
    const fill = xf.fillId != null ? workbook.fills?.[xf.fillId] : undefined;
    if (font?.bold) result.bold = true;
    if (font?.italic) result.italic = true;
    if (font?.underline) result.underline = true;
    const color = normalizeColor(font?.color);
    if (color) result.color = color;
    const fillColor = normalizeColor(fill?.color);
    if (fillColor) result.fill = fillColor;
    const align = xf.alignment?.horizontal;
    if (align === "center" || align === "right" || align === "left") result.align = align;
    const numberFormat = resolveNumberFormat(workbook, xf.numFmtId);
    if (numberFormat) result.numberFormat = numberFormat;
  } else if (typeof style === "object") {
    const obj = style as {
      font?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string };
      fill?: { color?: string };
      alignment?: { horizontal?: string };
      numFmt?: string;
    };
    if (obj.font?.bold) result.bold = true;
    if (obj.font?.italic) result.italic = true;
    if (obj.font?.underline) result.underline = true;
    const color = normalizeColor(obj.font?.color);
    if (color) result.color = color;
    const fillColor = normalizeColor(obj.fill?.color);
    if (fillColor) result.fill = fillColor;
    const align = obj.alignment?.horizontal;
    if (align === "center" || align === "right" || align === "left") result.align = align;
    if (obj.numFmt) result.numberFormat = categorizeFormatCode(obj.numFmt);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

const NUM_FMT_CODES: Record<string, string> = {
  number: "#,##0.00",
  integer: "#,##0",
  currency: "$#,##0.00",
  percent: "0.00%",
  date: "mm/dd/yyyy",
};

function cellStyleToOfficeStyle(style: CellStyle | undefined): Record<string, unknown> | undefined {
  if (!style) return undefined;
  const result: Record<string, unknown> = {};
  if (style.bold || style.italic || style.underline || style.color) {
    const font: Record<string, unknown> = {};
    if (style.bold) font.bold = true;
    if (style.italic) font.italic = true;
    if (style.underline) font.underline = true;
    if (style.color) font.color = toHexColor(style.color);
    result.font = font;
  }
  if (style.fill) {
    result.fill = { type: "solid", color: toHexColor(style.fill) };
  }
  if (style.align) {
    result.alignment = { horizontal: style.align };
  }
  if (style.numberFormat && style.numberFormat !== "general") {
    result.numFmt = NUM_FMT_CODES[style.numberFormat];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** A literal xlsx list-validation formula1 looks like `"Option A,Option B,Option C"`. Range-based lists aren't round-tripped. */
function parseListFormula(formula1: string | undefined): string[] | null {
  if (!formula1) return null;
  const trimmed = formula1.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

/** Space-separated sqref may list multiple refs/ranges; clamps ranges to the sheet's used bounds so a whole-column validation doesn't explode. */
function expandSqref(sqref: string, rowCount: number, colCount: number): CellPos[] {
  const positions: CellPos[] = [];
  for (const part of sqref.trim().split(/\s+/)) {
    if (!part) continue;
    const [startRef, endRef] = part.split(":");
    const start = parseRef(startRef);
    if (!start) continue;
    const end = endRef ? parseRef(endRef) : start;
    if (!end) continue;
    const maxRow = Math.min(Math.max(start.row, end.row), rowCount - 1);
    const maxCol = Math.min(Math.max(start.col, end.col), colCount - 1);
    for (let r = Math.min(start.row, end.row); r <= maxRow; r++) {
      for (let c = Math.min(start.col, end.col); c <= maxCol; c++) positions.push({ row: r, col: c });
    }
  }
  return positions;
}

function worksheetToSheet(worksheet: WorksheetLike, workbook: WorkbookStyles, id: string): SheetState {
  let maxRow = 0;
  let maxCol = 0;
  for (const row of worksheet.rows ?? []) {
    if (row.rowNumber) maxRow = Math.max(maxRow, row.rowNumber);
    for (const cell of row.cells ?? []) {
      const parsed = cell.reference ? parseRef(cell.reference) : null;
      if (parsed) maxCol = Math.max(maxCol, parsed.col + 1);
    }
  }
  const rowCount = Math.max(maxRow, 1);
  const colCount = Math.max(maxCol, 1);
  const grid = makeGrid(rowCount, colCount);
  for (const row of worksheet.rows ?? []) {
    const rIdx = (row.rowNumber ?? 0) - 1;
    if (rIdx < 0 || rIdx >= rowCount) continue;
    for (const cell of row.cells ?? []) {
      const parsed = cell.reference ? parseRef(cell.reference) : null;
      if (!parsed || parsed.col < 0 || parsed.col >= colCount) continue;
      grid[rIdx][parsed.col] = {
        text: cellDisplayValue(cell),
        style: resolveCellStyle(workbook, cell.style),
      };
    }
  }
  for (const validation of worksheet.dataValidations ?? []) {
    if (validation.type !== "list" || !validation.sqref) continue;
    const options = parseListFormula(validation.formula1);
    if (!options || options.length === 0) continue;
    for (const pos of expandSqref(validation.sqref, rowCount, colCount)) {
      const cell = grid[pos.row][pos.col];
      grid[pos.row][pos.col] = { ...cell, style: { ...cell.style, options } };
    }
  }
  return { id, name: worksheet.name || "Sheet", grid };
}

function sheetToWorksheet(
  sheet: SheetState,
  original: WorksheetLike | undefined,
  computed: FormulaValue[][],
): WorksheetLike {
  const rows = sheet.grid.map((row, rIdx) => ({
    rowNumber: rIdx + 1,
    cells: row
      .map((cell, cIdx): CellLike | null => {
        if (cell.text === "" && cell.style == null) return null;
        const officeStyle = cellStyleToOfficeStyle(cell.style);
        const cellOptions: CellLike = {
          reference: makeRef(rIdx, cIdx),
          value: parseCellInput(cell.text),
        };
        if (isFormula(cell.text)) {
          cellOptions.formula = cell.text.slice(1);
          const value = computed[rIdx]?.[cIdx];
          if (value !== undefined && isFormulaError(value)) {
            cellOptions.error = value as string;
            cellOptions.value = null;
          } else if (value !== undefined) {
            cellOptions.value = value;
          }
        }
        if (officeStyle) cellOptions.style = officeStyle;
        return cellOptions;
      })
      .filter((c): c is CellLike => c !== null),
  }));

  const validationGroups = new Map<string, { options: string[]; refs: string[] }>();
  sheet.grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      const options = cell.style?.options;
      if (!options || options.length === 0) return;
      const key = options.join("");
      const ref = makeRef(r, c);
      const group = validationGroups.get(key);
      if (group) group.refs.push(ref);
      else validationGroups.set(key, { options, refs: [ref] });
    }),
  );
  const dataValidations = [...validationGroups.values()].map(({ options, refs }) => ({
    sqref: refs.join(" "),
    type: "list" as const,
    formula1: `"${options.join(",")}"`,
    allowBlank: true,
  }));

  return {
    ...original,
    name: sheet.name,
    rows,
    dataValidations: dataValidations.length > 0 ? dataValidations : undefined,
  };
}

/**
 * Full spreadsheet editor for .xlsx files: multi-sheet, formatting (bold/
 * italic/underline/color/fill/alignment/number format), formulas and
 * functions (SUM, IF, VLOOKUP, ...) evaluated live and re-evaluated on every
 * edit, dropdown/status option cells backed by native xlsx list data
 * validation, fill-handle drag to copy/increment/extend a series, keyboard
 * navigation, range selection, formula-aware copy/paste, undo/redo, find &
 * replace.
 */
export function XlsxEditor({ appId, filePath }: XlsxEditorProps) {
  const [sheets, setSheets] = useState<SheetState[] | null>(null);
  const [workbook, setWorkbook] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const originalWorksheets = useRef<Map<string, WorksheetLike>>(new Map());

  useEffect(() => {
    if (appId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc.office
      .parseFile({ appId, relPath: filePath })
      .then((result) => {
        if (cancelled) return;
        if (!result || result.kind !== "xlsx") {
          setError("Couldn't read this file. It may be corrupted or missing.");
          return;
        }
        const data = result.data as { worksheets?: WorksheetLike[] } & WorkbookStyles;
        const worksheets = data.worksheets?.length ? data.worksheets : [{ name: "Sheet1", rows: [] }];
        originalWorksheets.current = new Map();
        const nextSheets = worksheets.map((worksheet, i) => {
          const id = `sheet-${i}`;
          originalWorksheets.current.set(id, worksheet);
          return worksheetToSheet(worksheet, data, id);
        });
        setWorkbook(data);
        setSheets(nextSheets);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !sheets || !workbook) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error ?? "Failed to load file"}
      </div>
    );
  }

  return (
    <SpreadsheetGrid
      fileLabel={filePath}
      initialSheets={sheets}
      allowMultipleSheets
      allowFormatting
      onSave={async (nextSheets) => {
        if (appId == null) return;
        const computed = evaluateWorkbook(nextSheets);
        const worksheets = nextSheets.map((sheet) =>
          sheetToWorksheet(
            sheet,
            originalWorksheets.current.get(sheet.id),
            computed.get(sheet.id) ?? sheet.grid.map((row) => row.map(() => "")),
          ),
        );
        await ipc.office.writeXlsxFile({
          appId,
          relPath: filePath,
          workbook: { ...workbook, worksheets },
        });
      }}
    />
  );
}
