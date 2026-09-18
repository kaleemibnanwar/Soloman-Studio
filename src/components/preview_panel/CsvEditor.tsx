import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ipc } from "@/ipc/types";
import { SpreadsheetGrid } from "./spreadsheet/SpreadsheetGrid";
import { type SheetState, makeGrid } from "./spreadsheet/types";
import { evaluateWorkbook, formulaValueToDisplayString } from "./spreadsheet/formulaEngine";

interface CsvEditorProps {
  appId: number | null;
  filePath: string;
}

/** Minimal RFC 4180 parser: handles quoted fields, escaped quotes, and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
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
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Swallowed; the following \n (if any) ends the row.
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function stringifyCsv(rows: string[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((cell) =>
            /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
          )
          .join(","),
      )
      .join("\n") + "\n"
  );
}

function toSheet(rows: string[][]): SheetState {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0) || 1;
  const grid =
    rows.length > 0
      ? rows.map((row) =>
          Array.from({ length: width }, (_, c) => ({ text: row[c] ?? "" })),
        )
      : makeGrid(1, 1);
  return { id: "csv", name: "Sheet1", grid };
}

/** Spreadsheet-grade CSV editor: keyboard navigation, range selection, copy/paste, undo/redo, find & replace. */
export function CsvEditor({ appId, filePath }: CsvEditorProps) {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc.app
      .readAppFile({ appId, filePath })
      .then((content) => {
        if (cancelled) return;
        setSheet(toSheet(parseCsv(content)));
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

  if (error || !sheet) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error ?? "Failed to load file"}
      </div>
    );
  }

  return (
    <SpreadsheetGrid
      fileLabel={filePath}
      initialSheets={[sheet]}
      allowMultipleSheets={false}
      allowFormatting={false}
      onSave={async (sheets) => {
        if (appId == null) return;
        // CSV has no formula format, so save the computed value (matching what's on screen), not the raw "=SUM(...)" text.
        const computed = evaluateWorkbook(sheets).get(sheets[0].id) ?? sheets[0].grid.map((row) => row.map((cell) => cell.text));
        const rows = computed.map((row) => row.map(formulaValueToDisplayString));
        await ipc.app.editAppFile({ appId, filePath, content: stringifyCsv(rows) });
      }}
    />
  );
}
