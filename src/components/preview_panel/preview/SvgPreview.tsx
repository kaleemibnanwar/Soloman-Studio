import { useMemo } from "react";
import { getFileMediaUrl } from "@/lib/filePreview";

interface SvgPreviewProps {
  appId: number | null;
  filePath: string;
}

/**
 * Rendered SVG body (no header) — the dual-mode shell adds the toolbar.
 * Rendered as an `<img>` so any scripts in the SVG never execute.
 */
export function SvgPreview({ appId, filePath }: SvgPreviewProps) {
  const url = useMemo(() => getFileMediaUrl(appId, filePath), [appId, filePath]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gray-100 p-6 dark:bg-gray-900">
      {url ? (
        <img
          src={url}
          alt={filePath.split("/").pop()}
          className="max-h-full max-w-full drop-shadow-md"
        />
      ) : (
        <span className="text-sm text-muted-foreground">SVG preview unavailable.</span>
      )}
    </div>
  );
}
