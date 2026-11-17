export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  numberFormat?: "general" | "number" | "integer" | "currency" | "percent" | "date";
  /** Restricts the cell to a fixed set of values, rendered as a colored chip with a picker (e.g. a Stage/Status column). Mirrors an xlsx "list" data validation. */
  options?: string[];
}

/** Chart-hue CSS vars used to color option chips, so they stay on-theme in both light and dark mode. */
export const OPTION_COLOR_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

export function optionColorVar(options: string[], value: string): string {
  const idx = options.indexOf(value);
  return OPTION_COLOR_VARS[(idx < 0 ? 0 : idx) % OPTION_COLOR_VARS.length];
}

export function optionChipStyle(varName: string): {
  background: string;
  color: string;
  borderColor: string;
} {
  return {
    background: `color-mix(in oklch, var(${varName}) 20%, var(--background))`,
    color: `var(${varName})`,
    borderColor: `color-mix(in oklch, var(${varName}) 45%, var(--border))`,
  };
}

export interface GridCell {
  text: string;
  style?: CellStyle;
}

export type GridData = GridCell[][];

export interface SheetState {
  id: string;
  name: string;
  grid: GridData;
}

export interface CellPos {
  row: number;
  col: number;
}

export interface SelectionRange {
  anchor: CellPos;
  focus: CellPos;
}

export function emptyCell(): GridCell {
  return { text: "" };
}

export function makeGrid(rows: number, cols: number): GridData {
  return Array.from({ length: Math.max(rows, 1) }, () =>
    Array.from({ length: Math.max(cols, 1) }, () => emptyCell()),
  );
}

export const DEFAULT_MIN_ROWS = 100;
export const DEFAULT_MIN_COLS = 26;

export function ensureMinGrid(
  grid: GridData,
  minRows = DEFAULT_MIN_ROWS,
  minCols = DEFAULT_MIN_COLS,
): GridData {
  const currentRows = grid.length;
  const currentCols = grid[0]?.length ?? 0;
  const targetRows = Math.max(currentRows, minRows);
  const targetCols = Math.max(currentCols, minCols);

  if (currentRows >= targetRows && currentCols >= targetCols) {
    return grid;
  }

  return Array.from({ length: targetRows }, (_, r) => {
    const sourceRow = grid[r];
    return Array.from({ length: targetCols }, (_, c) => sourceRow?.[c] ?? emptyCell());
  });
}

let nextSheetId = 1;
export function newSheetId(): string {
  return `sheet-${nextSheetId++}-${Date.now().toString(36)}`;
}

export function emptySheet(name: string): SheetState {
  return { id: newSheetId(), name, grid: makeGrid(DEFAULT_MIN_ROWS, DEFAULT_MIN_COLS) };
}

export function normalizeRange(range: SelectionRange): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} {
  return {
    minRow: Math.min(range.anchor.row, range.focus.row),
    maxRow: Math.max(range.anchor.row, range.focus.row),
    minCol: Math.min(range.anchor.col, range.focus.col),
    maxCol: Math.max(range.anchor.col, range.focus.col),
  };
}

export function isInRange(pos: CellPos, range: SelectionRange): boolean {
  const { minRow, maxRow, minCol, maxCol } = normalizeRange(range);
  return pos.row >= minRow && pos.row <= maxRow && pos.col >= minCol && pos.col <= maxCol;
}

export function lettersToColIndex(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col - 1;
}

/** A1 -> {row: 0, col: 0}. Supports multi-letter columns (AA, AB, ...) and optional $ locks. */
export function parseRef(ref: string): CellPos | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref);
  if (!match) return null;
  return { col: lettersToColIndex(match[1]), row: Number(match[2]) - 1 };
}

export function colIndexToLetters(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function makeRef(row: number, col: number): string {
  return `${colIndexToLetters(col)}${row + 1}`;
}

export function cloneSheets(sheets: SheetState[]): SheetState[] {
  return sheets.map((sheet) => ({
    ...sheet,
    grid: sheet.grid.map((row) =>
      row.map((cell) => ({ ...cell, style: cell.style ? { ...cell.style } : undefined })),
    ),
  }));
}

/** Parses a number out of raw cell text, tolerant of thousands separators the display formatter adds back. */
export function parseNumeric(text: string): number | null {
  const cleaned = text.replace(/[,$%\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

export function formatCellDisplay(cell: GridCell): string {
  const format = cell.style?.numberFormat;
  if (!format || format === "general") return cell.text;
  const num = parseNumeric(cell.text);
  if (num == null) return cell.text;
  switch (format) {
    case "integer":
      return Math.round(num).toLocaleString(undefined, { maximumFractionDigits: 0 });
    case "number":
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "currency":
      return num.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
      });
    case "percent":
      // Percent format displays the stored fraction scaled by 100, matching
      // Excel's convention (a cell storing 0.23 displays as "23%").
      return `${(num * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    case "date": {
      const asDate = new Date(cell.text);
      return Number.isNaN(asDate.getTime()) ? cell.text : asDate.toLocaleDateString();
    }
    default:
      return cell.text;
  }
}
