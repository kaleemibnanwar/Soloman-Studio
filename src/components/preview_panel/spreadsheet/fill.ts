import { isFormula, shiftFormulaRefs } from "./formulaEngine";
import { type CellPos, type GridCell, type GridData, parseNumeric } from "./types";

export interface Bounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/** The fill handle only ever grows the origin box down or right, matching the common spreadsheet convention. */
export function computeFillPreview(origin: Bounds, hover: CellPos): Bounds {
  const rowExt = hover.row - origin.maxRow;
  const colExt = hover.col - origin.maxCol;
  if (rowExt <= 0 && colExt <= 0) return origin;
  if (rowExt >= colExt) return { ...origin, maxRow: Math.max(origin.maxRow, hover.row) };
  return { ...origin, maxCol: Math.max(origin.maxCol, hover.col) };
}

function roundClean(num: number): number {
  return Math.round(num * 1e10) / 1e10;
}

/** Extends a run of source cells by `stepIndex` steps: numeric -> increment/extrapolate, formula -> shift refs, trailing-number text -> increment suffix, else -> copy/tile. */
function generateFillCell(source: GridCell[], stepIndex: number, axis: "row" | "col"): GridCell {
  if (source.length === 1) {
    const cell = source[0];
    if (isFormula(cell.text)) {
      const rowDelta = axis === "row" ? stepIndex : 0;
      const colDelta = axis === "col" ? stepIndex : 0;
      return { ...cell, text: `=${shiftFormulaRefs(cell.text.slice(1), rowDelta, colDelta)}` };
    }
    const num = cell.text.trim() !== "" ? parseNumeric(cell.text) : null;
    if (num != null) return { ...cell, text: String(roundClean(num + stepIndex)) };
    const trailing = /^(.*?)(\d+)$/.exec(cell.text);
    if (trailing) {
      const [, prefix, digits] = trailing;
      const next = Number(digits) + stepIndex;
      return { ...cell, text: `${prefix}${String(next).padStart(digits.length, "0")}` };
    }
    return { ...cell };
  }

  const numericValues = source.map((c) => (c.text.trim() !== "" ? parseNumeric(c.text) : null));
  if (numericValues.every((v) => v != null)) {
    const values = numericValues as number[];
    const step = (values[values.length - 1] - values[0]) / (values.length - 1 || 1);
    const newValue = values[values.length - 1] + step * stepIndex;
    return { ...source[source.length - 1], text: String(roundClean(newValue)) };
  }

  const template = source[(stepIndex - 1) % source.length];
  return { ...template };
}

export function commitFill(
  origin: Bounds,
  target: Bounds,
  grid: GridData,
): { row: number; col: number; cell: GridCell }[] {
  const patches: { row: number; col: number; cell: GridCell }[] = [];
  if (target.maxRow > origin.maxRow) {
    for (let c = origin.minCol; c <= origin.maxCol; c++) {
      const source: GridCell[] = [];
      for (let r = origin.minRow; r <= origin.maxRow; r++) source.push(grid[r][c]);
      for (let r = origin.maxRow + 1; r <= target.maxRow; r++) {
        patches.push({ row: r, col: c, cell: generateFillCell(source, r - origin.maxRow, "row") });
      }
    }
  } else if (target.maxCol > origin.maxCol) {
    for (let r = origin.minRow; r <= origin.maxRow; r++) {
      const source: GridCell[] = [];
      for (let c = origin.minCol; c <= origin.maxCol; c++) source.push(grid[r][c]);
      for (let c = origin.maxCol + 1; c <= target.maxCol; c++) {
        patches.push({ row: r, col: c, cell: generateFillCell(source, c - origin.maxCol, "col") });
      }
    }
  }
  return patches;
}
