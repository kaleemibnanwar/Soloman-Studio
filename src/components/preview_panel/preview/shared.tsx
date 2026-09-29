import { useCallback, type ReactNode } from "react";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useTranslation } from "react-i18next";

/** Human-readable byte count for archive entries and file metadata. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

/** Spinner-centered loading state shared by every preview. */
export function PreviewLoading({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-xs">{label ?? "Loading preview…"}</span>
    </div>
  );
}

/** Error state with an optional retry action. */
export function PreviewError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive/70" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? "This file couldn't be previewed."}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export interface FileActions {
  /** Open the file with the OS default application. */
  openExternally: () => void;
  /** Reveal the file in the OS file manager. */
  revealInFolder: () => void;
  /** Copy the absolute (or relative) path to the clipboard. */
  copyPath: () => void;
  canReveal: boolean;
}

/**
 * Shared action handlers for the file preview. "Reveal in folder" and "copy
 * path" need the absolute OS path, which is only known when `appRootPath` is
 * provided; "open externally" resolves via the main process from appId + path.
 */
export function useFileActions({
  appId,
  filePath,
  appRootPath,
}: {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
}): FileActions {
  const absPath = appRootPath
    ? `${appRootPath.replace(/[\\/]+$/, "")}/${filePath.replace(/^[\\/]+/, "")}`
    : "";

  const openExternally = useCallback(() => {
    if (appId == null) return;
    ipc.app.openFileExternally({ appId, filePath }).catch((error) => showError(error));
  }, [appId, filePath]);

  const revealInFolder = useCallback(() => {
    if (!absPath) return;
    ipc.system.showItemInFolder(absPath);
  }, [absPath]);

  const copyPath = useCallback(() => {
    const value = absPath || filePath;
    navigator.clipboard
      .writeText(value)
      .then(() => showSuccess(absPath ? "Copied absolute path" : "Copied path"))
      .catch(() => showError("Failed to copy path"));
  }, [absPath, filePath]);

  return { openExternally, revealInFolder, copyPath, canReveal: !!absPath };
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        <Icon size={14} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Slim header bar for the read-only previews: file name on the left, and the
 * "open externally / reveal / copy path" actions on the right. Mirrors the
 * breadcrumb bar in `FileEditor` so every preview reads as one system.
 */
export function PreviewBar({
  filePath,
  fileTypeLabel,
  icon: Icon,
  actions,
  right,
}: {
  filePath: string;
  /** Short human label for the file kind, e.g. "PDF", "Image", "Video". */
  fileTypeLabel?: string;
  icon?: LucideIcon;
  actions: FileActions;
  /** Extra controls to render before the standard actions (e.g. zoom). */
  right?: ReactNode;
}) {
  const { t } = useTranslation("home");
  const baseName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="truncate font-mono text-xs text-foreground">{baseName}</span>
        {fileTypeLabel && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {fileTypeLabel}
          </span>
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {right}
        <ActionButton
          label={t("preview.openExternally", "Open with default app")}
          icon={ExternalLink}
          onClick={actions.openExternally}
        />
        {actions.canReveal && (
          <ActionButton
            label={t("preview.revealInFolder", "Reveal in folder")}
            icon={FolderOpen}
            onClick={actions.revealInFolder}
          />
        )}
        <ActionButton
          label={t("preview.copyPath", "Copy path")}
          icon={Copy}
          onClick={actions.copyPath}
        />
      </span>
    </div>
  );
}
