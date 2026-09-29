import { FileEditor } from "./FileEditor";
import { CsvEditor } from "./CsvEditor";
import { XlsxEditor } from "./XlsxEditor";
import { DocxEditor } from "./DocxEditor";
import { PptxPreview } from "./PptxPreview";
import { DualModePreview } from "./DualModePreview";
import { MediaPreview } from "./preview/MediaPreview";
import { PdfPreview } from "./preview/PdfPreview";
import { ArchivePreview } from "./preview/ArchivePreview";
import { FontPreview } from "./preview/FontPreview";
import { UnsupportedFilePreview } from "./preview/UnsupportedFilePreview";
import { getFilePreviewKind } from "@/lib/filePreview";

interface FilePreviewProps {
  appId: number | null;
  filePath: string;
  initialLine?: number | null;
  appRootPath?: string;
}

/**
 * Single dispatcher for the right-side file preview. Routes every file through
 * `getFilePreviewKind` to the matching viewer, so the extension-to-viewer
 * mapping lives in one place (lib/filePreview) instead of a chain of inline
 * `.endsWith` checks duplicated across panels.
 */
export function FilePreview({
  appId,
  filePath,
  initialLine = null,
  appRootPath,
}: FilePreviewProps) {
  const kind = getFilePreviewKind(filePath);

  switch (kind) {
    case "code":
      return (
        <FileEditor appId={appId} filePath={filePath} initialLine={initialLine} persistCursor />
      );
    case "markdown":
    case "html":
    case "svg":
      return (
        <DualModePreview appId={appId} filePath={filePath} appRootPath={appRootPath} kind={kind} />
      );
    case "image":
    case "video":
    case "audio":
      return (
        <MediaPreview appId={appId} filePath={filePath} appRootPath={appRootPath} kind={kind} />
      );
    case "pdf":
      return <PdfPreview appId={appId} filePath={filePath} appRootPath={appRootPath} />;
    case "csv":
      return <CsvEditor appId={appId} filePath={filePath} />;
    case "xlsx":
      return <XlsxEditor appId={appId} filePath={filePath} />;
    case "docx":
      return <DocxEditor appId={appId} filePath={filePath} />;
    case "pptx":
      return <PptxPreview appId={appId} filePath={filePath} />;
    case "archive":
      return <ArchivePreview appId={appId} filePath={filePath} appRootPath={appRootPath} />;
    case "font":
      return <FontPreview appId={appId} filePath={filePath} appRootPath={appRootPath} />;
    case "unsupported":
      return <UnsupportedFilePreview appId={appId} filePath={filePath} appRootPath={appRootPath} />;
  }
}
