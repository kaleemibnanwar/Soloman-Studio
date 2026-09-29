import { Button } from "@/components/ui/button";
import { getFileFamily } from "@/lib/filePreview";
import { getFileIconByPath } from "./fileIcons";
import { PreviewBar, useFileActions } from "./shared";

interface UnsupportedFilePreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
}

const FAMILY_LABEL: Record<string, string> = {
  code: "File",
  document: "Document",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  archive: "Archive",
  font: "Font",
  binary: "File",
};

/**
 * Fallback for files we can't render inline — legacy Office, OpenDocument, and
 * unknown binary. Shows the file family, a clear explanation, and a primary
 * "open with your default app" action instead of dumping binary as mojibake.
 */
export function UnsupportedFilePreview({
  appId,
  filePath,
  appRootPath,
}: UnsupportedFilePreviewProps) {
  const actions = useFileActions({ appId, filePath, appRootPath });
  const family = getFileFamily(filePath);
  const label = FAMILY_LABEL[family] ?? FAMILY_LABEL.binary;
  const Icon = getFileIconByPath(filePath);
  const baseName = filePath.split("/").pop() ?? filePath;

  const isLegacyOffice =
    family === "document" || family === "spreadsheet" || family === "presentation";
  const message = isLegacyOffice
    ? `Octopus can't render this ${label.toLowerCase()} format inline yet. Open it with your default app (or convert it to a modern format like .docx, .xlsx, or .pptx) to preview it here.`
    : "Octopus can't render this file type inline. Open it with your default app to view it.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewBar filePath={filePath} fileTypeLabel={label} icon={Icon} actions={actions} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-muted/40">
          <Icon className="size-8 text-muted-foreground" />
        </div>
        <div className="max-w-sm">
          <p className="font-mono text-xs text-muted-foreground">{baseName}</p>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={actions.openExternally}>
            Open with default app
          </Button>
          {actions.canReveal && (
            <Button size="sm" variant="outline" onClick={actions.revealInFolder}>
              Reveal in folder
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
