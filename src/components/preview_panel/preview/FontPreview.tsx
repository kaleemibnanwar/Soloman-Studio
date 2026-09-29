import { useMemo } from "react";
import { Type } from "lucide-react";
import { getFileMediaUrl } from "@/lib/filePreview";
import { PreviewBar, useFileActions } from "./shared";

interface FontPreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
}

const PANGRAM = "The quick brown fox jumps over the lazy dog";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789";

/**
 * Renders a font specimen by loading the file via `@font-face` from the
 * `octopus-studio-file` protocol. If the font fails to load, the specimen
 * falls back to the system font — the header actions still let the user open it.
 */
export function FontPreview({ appId, filePath, appRootPath }: FontPreviewProps) {
  const url = useMemo(() => getFileMediaUrl(appId, filePath), [appId, filePath]);
  const actions = useFileActions({ appId, filePath, appRootPath });
  const baseName = filePath.split("/").pop() ?? filePath;
  const family = "octopus-font-preview";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {url && (
        <style>{`
          @font-face {
            font-family: "${family}";
            src: url("${url}");
          }
        `}</style>
      )}
      <PreviewBar filePath={filePath} fileTypeLabel="Font" icon={Type} actions={actions} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto max-w-2xl px-6 py-8"
          style={{ fontFamily: `"${family}", sans-serif` }}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Font specimen · {baseName}
          </p>
          <h1 className="mt-3 text-6xl font-normal leading-tight">Aa Bb Cc</h1>
          <p className="mt-4 text-2xl leading-snug">{PANGRAM}</p>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{ALPHABET}</p>
          <div className="mt-8 space-y-1 border-t border-border pt-4">
            {[12, 16, 24, 32, 48].map((size) => (
              <div key={size} className="flex items-baseline gap-3">
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {size}
                </span>
                <span style={{ fontSize: size }} className="leading-tight">
                  {PANGRAM}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
