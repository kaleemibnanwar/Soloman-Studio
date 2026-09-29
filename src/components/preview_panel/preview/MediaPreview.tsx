import { useMemo, useState } from "react";
import { FileAudio, FileVideo, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { getFileMediaUrl } from "@/lib/filePreview";
import { PreviewBar, useFileActions } from "./shared";

interface MediaPreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
  kind: "image" | "video" | "audio";
}

export function MediaPreview({ appId, filePath, appRootPath, kind }: MediaPreviewProps) {
  const url = useMemo(() => getFileMediaUrl(appId, filePath), [appId, filePath]);
  const actions = useFileActions({ appId, filePath, appRootPath });

  if (!url) {
    return <PreviewFallback actions={actions} filePath={filePath} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewBar
        filePath={filePath}
        fileTypeLabel={kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio"}
        icon={kind === "image" ? undefined : kind === "video" ? FileVideo : FileAudio}
        actions={actions}
      />
      {kind === "image" ? (
        <ImageViewer url={url} filePath={filePath} />
      ) : kind === "video" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/90 p-4">
          <video
            src={url}
            controls
            autoPlay={false}
            className="max-h-full max-w-full rounded shadow-2xl"
          />
        </div>
      ) : (
        <AudioViewer url={url} filePath={filePath} />
      )}
    </div>
  );
}

function ImageViewer({ url, filePath }: { url: string; filePath: string }) {
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-900">
      <img
        src={url}
        alt={filePath.split("/").pop()}
        draggable={false}
        className="select-none transition-transform duration-100"
        style={{
          transform: `scale(${scale})`,
          objectFit: fit ? "contain" : "none",
          maxWidth: fit ? "100%" : undefined,
          maxHeight: fit ? "100%" : undefined,
        }}
      />
      <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-lg border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur">
        <ZoomButton
          label="Zoom in"
          onClick={() => setScale((s) => Math.min(s * 1.25, 8))}
          icon={ZoomIn}
        />
        <ZoomButton
          label="Zoom out"
          onClick={() => setScale((s) => Math.max(s / 1.25, 0.1))}
          icon={ZoomOut}
        />
        <ZoomButton label="Reset" onClick={() => setScale(1)} icon={RotateCcw} />
        <ZoomButton
          label={fit ? "Actual size" : "Fit to window"}
          onClick={() => setFit((f) => !f)}
          icon={Maximize2}
          active={!fit}
        />
      </div>
    </div>
  );
}

function AudioViewer({ url, filePath }: { url: string; filePath: string }) {
  const baseName = filePath.split("/").pop() ?? filePath;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-muted/30 p-6">
        <div className="flex size-16 items-center justify-center rounded-full bg-background shadow-sm">
          <FileAudio className="size-8 text-muted-foreground" />
        </div>
        <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
          {baseName}
        </span>
        <audio src={url} controls className="w-full" />
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  icon: Icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: typeof ZoomIn;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
          : "text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

function PreviewFallback({
  actions,
  filePath,
}: {
  actions: ReturnType<typeof useFileActions>;
  filePath: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <PreviewBar filePath={filePath} actions={actions} />
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        This media file can't be streamed. Use “Open with default app” to view it.
      </div>
    </div>
  );
}
