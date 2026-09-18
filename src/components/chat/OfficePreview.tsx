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
    if (typeof o.value === "string") acc.push(o.value);
    for (const key of [
      "children",
      "paragraph",
      "heading",
      "textBox",
      "rows",
      "cells",
      "sections",
      "slides",
      "worksheets",
    ]) {
      if (key in o) collectText(o[key], acc);
    }
  }
  return acc;
}

/**
 * A lightweight, non-visual preview of a generated office artifact: docx/pptx
 * render as extracted text, xlsx renders as a grid. (A pixel-faithful renderer
 * is a later enhancement.)
 */
export function OfficePreview({ data }: { data: unknown }) {
  const root = data as { sections?: unknown; slides?: unknown; worksheets?: unknown };
  const worksheets = root?.worksheets as
    | Array<{ name?: string; rows?: Array<{ cells?: unknown[] }> }>
    | undefined;

  if (worksheets) {
    return (
      <div className="space-y-4">
        {worksheets.map((sheet, i) => (
          <div key={i}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {sheet?.name || `Sheet ${i + 1}`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {(sheet?.rows ?? []).map((row, r) => (
                    <tr key={r}>
                      {(row?.cells ?? []).map((cell, c) => (
                        <td
                          key={c}
                          className="border border-border px-2 py-1 text-muted-foreground"
                        >
                          {collectText(cell).join(" ")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const text = collectText(data).filter(Boolean);
  return (
    <div className="space-y-1">
      {text.map((line, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          {line}
        </p>
      ))}
      {text.length === 0 && (
        <p className="text-xs text-muted-foreground">(empty document)</p>
      )}
    </div>
  );
}
