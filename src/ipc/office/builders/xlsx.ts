/**
 * Shared office-open XLSX builder helpers. Construct the WorkbookOptions JSON
 * shape (worksheets -> rows -> cells with styles + formulas). Brand colors use
 * the "slate" scheme's hex values, registered in office_template_roles.ts so
 * `recolor` can swap them. Cells to fill in follow the `[Placeholder]`
 * convention consumed by `applyPlaceholders`.
 */

export const XLSX_PALETTE = {
  primary: "0B2545",
  primaryText: "FFFFFF",
  surface: "F2F4F7",
  muted: "5B6570",
  border: "C7CDD3",
} as const;

const { primary, primaryText, surface, muted, border } = XLSX_PALETTE;

export const headerStyle = {
  font: { bold: true, color: primaryText, size: 10 },
  fill: { type: "solid", color: primary },
  alignment: { vertical: "center" },
} as const;
export const subHeaderStyle = {
  font: { bold: true, color: primary, size: 10 },
  fill: { type: "solid", color: surface },
  border: { bottom: { style: "thin", color: border } },
} as const;
export const labelStyle = { font: { bold: true, color: muted, size: 9 } } as const;
export const mutedStyle = { font: { color: muted, italic: true, size: 9 } } as const;
export const totalStyle = {
  font: { bold: true, color: primary, size: 10 },
  fill: { type: "solid", color: surface },
  border: { top: { style: "thin", color: border } },
} as const;
export const cellBorderStyle = { border: { bottom: { style: "thin", color: border } } } as const;
export const titleStyle = { font: { bold: true, color: primary, size: 16 } } as const;
export const subtitleStyle = { font: { color: muted, italic: true, size: 10 } } as const;

export const NUM_CURRENCY = "$#,##0.00";
export const NUM_PERCENT = "0.0%";
export const NUM_NUMBER = "#,##0";

export function cell(value: string | number | boolean | null, style?: Record<string, unknown>) {
  return style ? { value, style } : { value };
}

export function row(cells: unknown[], height?: number) {
  return height ? { cells, height } : { cells };
}

export function headerRow(labels: string[]) {
  return row(labels.map((l) => cell(l, headerStyle)));
}

export function dataRow(
  values: (string | number)[],
  styles?: (Record<string, unknown> | undefined)[],
) {
  return row(values.map((v, i) => cell(v, { ...cellBorderStyle, ...styles?.[i] })));
}

/** Column widths in characters. */
export function cols(widths: number[]) {
  return widths.map((width, i) => ({ min: i + 1, max: i + 1, width }));
}

/** A standard report title + subtitle + spacer header block. */
export function titleRows(title: string, subtitle: string) {
  return [row([cell(title, titleStyle)]), row([cell(subtitle, subtitleStyle)]), row([cell("")])];
}

/** A "label ... value" key/value row across the given columns. */
export function kvRow(
  pairs: { label: string; value: string }[],
  labelStyleOverride: Record<string, unknown> = labelStyle,
) {
  const cells: unknown[] = [];
  for (const { label, value } of pairs) {
    cells.push(cell(label, labelStyleOverride), cell(value));
  }
  return row(cells);
}

/** Excel column letter for a 1-based index (1 -> A, 27 -> AA). */
export function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** `SUM(firstCell:lastCell)` over a column range for a given column + row span. */
export function sumFormula(col: number, fromRow: number, toRow: number): string {
  const l = colLetter(col);
  return `SUM(${l}${fromRow}:${l}${toRow})`;
}
