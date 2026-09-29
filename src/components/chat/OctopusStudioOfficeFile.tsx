import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { OfficePreview } from "./OfficePreview";

/**
 * Renders a generated office artifact (.docx/.pptx/.xlsx) inside the chat by
 * fetching its parsed content via `office:parseFile`.
 */
export function OctopusStudioOfficeFile({ node }: { node: { properties: { path?: string } } }) {
  const appId = useAtomValue(selectedAppIdAtom);
  const [preview, setPreview] = useState<{ kind: string; data: unknown } | null>(null);
  const path = node?.properties?.path;

  useEffect(() => {
    if (!appId || !path) return;
    let cancelled = false;
    ipc.office
      .parseFile({ appId, relPath: path })
      .then((r) => {
        if (!cancelled && r) setPreview(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appId, path]);

  return (
    <div className="space-y-2 rounded-md border bg-(--background-lightest) p-3">
      <p className="text-xs font-semibold text-muted-foreground">{path}</p>
      {preview ? (
        <OfficePreview data={preview.data} />
      ) : (
        <p className="text-xs text-muted-foreground">Loading preview…</p>
      )}
    </div>
  );
}
