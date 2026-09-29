import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Code2,
  MonitorPlay,
  Maximize2,
  Minimize2,
  Pencil,
  ArrowLeft,
  Loader2,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { CommitMenu } from "./CommitMenu";
import { ReactNode } from "react";

export interface UniversalPreviewToolbarProps {
  // Navigation / Context
  showBackButton?: boolean;
  onBack?: () => void;
  contextText?: ReactNode;

  // Refresh Action
  showRefreshButton?: boolean;
  onRefresh?: () => void;

  // File specific
  selectedFilePath?: string;

  // View Modes
  hasPreviewToggle?: boolean;
  previewMode?: "code" | "preview";
  onPreviewModeChange?: (mode: "code" | "preview") => void;

  // Edit Actions
  showEditButton?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  editDisabledReason?: string;
  isSaving?: boolean;

  // App Commit context
  appId?: number | null;

  // Fullscreen
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function UniversalPreviewToolbar({
  showBackButton,
  onBack,
  contextText,
  showRefreshButton,
  onRefresh,
  selectedFilePath,
  hasPreviewToggle,
  previewMode,
  onPreviewModeChange,
  showEditButton,
  canEdit,
  onEdit,
  editDisabledReason,
  isSaving,
  appId,
  isFullscreen,
  onToggleFullscreen,
}: UniversalPreviewToolbarProps) {
  const { t } = useTranslation();

  const handleModeChange = (values: string[]) => {
    // Single selection means values will be an array of at most one item.
    // If empty (tried to unselect), we can optionally ignore or default.
    // We want to prevent unselecting, so if it's empty, we do nothing.
    const newVal = values[0];
    if (newVal && onPreviewModeChange) {
      onPreviewModeChange(newVal as "code" | "preview");
    }
  };

  return (
    <div className="flex h-11 items-center gap-3 px-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur shadow-sm z-10 transition-colors shrink-0">
      {/* LEFT SECTION: Context & Navigation */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {showBackButton && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onBack}
                  data-testid="staged-diff-back-button"
                  className="flex items-center justify-center size-7 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shrink-0"
                />
              }
            >
              <ArrowLeft size={16} />
            </TooltipTrigger>
            <TooltipContent>{t("preview.backToEditor", "Back to Editor")}</TooltipContent>
          </Tooltip>
        )}

        {showRefreshButton && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex items-center justify-center size-7 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shrink-0"
                />
              }
            >
              <RefreshCw size={14} />
            </TooltipTrigger>
            <TooltipContent>{t("preview.refreshFiles", "Refresh Files")}</TooltipContent>
          </Tooltip>
        )}

        {contextText && (
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate shrink-0 px-1">
            {contextText}
          </div>
        )}

        {selectedFilePath && (
          <>
            {contextText && <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1 shrink-0" />}
            <div className="flex items-center gap-2 text-sm font-medium truncate text-gray-800 dark:text-gray-200">
              <FileText size={14} className="text-gray-500 shrink-0" />
              <span className="truncate">{selectedFilePath.split("/").pop()}</span>
            </div>
          </>
        )}
      </div>

      {/* CENTER SECTION: View Mode Toggle */}
      {hasPreviewToggle && (
        <div className="flex-none flex items-center justify-center">
          <ToggleGroup
            value={previewMode ? [previewMode] : []}
            onValueChange={handleModeChange}
            multiple={false}
            variant="outline"
            size="sm"
            className="bg-gray-200/50 dark:bg-gray-800/50 p-0.5 rounded-lg border-none shadow-none"
          >
            <ToggleGroupItem
              value="code"
              className="h-7 px-3 text-xs font-medium rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-gray-700 data-[state=on]:text-gray-900 dark:data-[state=on]:text-gray-100 data-[state=on]:shadow-sm transition-all"
            >
              <Code2 size={14} className="mr-1.5" />
              Code
            </ToggleGroupItem>
            <ToggleGroupItem
              value="preview"
              className="h-7 px-3 text-xs font-medium rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-gray-700 data-[state=on]:text-gray-900 dark:data-[state=on]:text-gray-100 data-[state=on]:shadow-sm transition-all"
            >
              <MonitorPlay size={14} className="mr-1.5" />
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* RIGHT SECTION: Actions */}
      <div className="flex items-center justify-end gap-1.5 flex-1 shrink-0">
        {showEditButton && (
          <Tooltip>
            <TooltipTrigger
              render={<span className={`inline-flex ${!canEdit ? "cursor-not-allowed" : ""}`} />}
            >
              <button
                type="button"
                onClick={onEdit}
                disabled={!canEdit}
                aria-label={t("preview.editLatestVersion", "Edit Latest Version")}
                data-disabled-reason={editDisabledReason}
                data-testid="edit-latest-version-button"
                className="flex items-center justify-center size-8 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {editDisabledReason ?? t("preview.editLatestVersion", "Edit Latest Version")}
            </TooltipContent>
          </Tooltip>
        )}

        {appId != null && <CommitMenu appId={appId} />}

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex items-center justify-center size-8 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              />
            }
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </TooltipTrigger>
          <TooltipContent>
            {isFullscreen
              ? t("preview.exitFullScreen", "Exit Full Screen")
              : t("preview.enterFullScreen", "Enter Full Screen")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
