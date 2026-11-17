import { useState } from "react";
import { Code2, FileCode2, FileText, MonitorPlay } from "lucide-react";
import { FileEditor } from "./FileEditor";
import { HtmlPreview } from "./HtmlPreview";
import { MarkdownPreview } from "./preview/MarkdownPreview";
import { SvgPreview } from "./preview/SvgPreview";
import { PreviewBar, useFileActions } from "./preview/shared";

type DualKind = "markdown" | "html" | "svg";

const KIND_META: Record<DualKind, { label: string; icon: typeof FileText }> = {
  markdown: { label: "Markdown", icon: FileText },
  html: { label: "HTML", icon: FileCode2 },
  svg: { label: "SVG", icon: FileCode2 },
};

interface DualModePreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
  kind: DualKind;
}

/**
 * Shell for file kinds that have both a rendered view and an editable source:
 * markdown, HTML, and SVG. Owns the Code/Preview toggle and swaps between the
 * rendered body and the Monaco editor.
 */
export function DualModePreview({ appId, filePath, appRootPath, kind }: DualModePreviewProps) {
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const actions = useFileActions({ appId, filePath, appRootPath });
  const meta = KIND_META[kind];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewBar
        filePath={filePath}
        fileTypeLabel={meta.label}
        icon={meta.icon}
        actions={actions}
        right={
          <div className="mr-1 flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
            <ModeButton
              active={mode === "preview"}
              onClick={() => setMode("preview")}
              icon={MonitorPlay}
              label="Preview"
            />
            <ModeButton
              active={mode === "code"}
              onClick={() => setMode("code")}
              icon={Code2}
              label="Code"
            />
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {mode === "code" ? (
          <FileEditor appId={appId} filePath={filePath} persistCursor />
        ) : kind === "markdown" ? (
          <MarkdownPreview appId={appId} filePath={filePath} />
        ) : kind === "html" ? (
          <HtmlPreview appId={appId} filePath={filePath} />
        ) : (
          <SvgPreview appId={appId} filePath={filePath} />
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Code2;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
