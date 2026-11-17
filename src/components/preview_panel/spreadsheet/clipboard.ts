import { type GridCell, type GridData, emptyCell } from "./types";

/** Excel/Sheets/Numbers all put tab-separated values on the clipboard for a cell range copy. */
export function gridToTsv(cells: GridData): string {
  return cells
    .map((row) =>
      row
        .map((cell) => {
          const text = cell.text;
          return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join("\t"),
    )
    .join("\n");
}

/** Inverse of gridToTsv, tolerant of quoted fields (so pasting from Excel/Sheets round-trips). */
export function tsvToGrid(text: string): GridData {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: GridCell[][] = [];
  let row: GridCell[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push({ text: field });
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === "\t") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.length > 0 ? rows : [[emptyCell()]];
}
