import { useMemo, useState } from "react";
import { FileText, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import { getFileMediaUrl } from "@/lib/filePreview";
import { PreviewBar, useFileActions } from "./shared";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PdfPreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
}

export function PdfPreview({ appId, filePath, appRootPath }: PdfPreviewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const url = useMemo(() => {
    const base = getFileMediaUrl(appId, filePath);
    return reloadKey > 0 ? `${base}?t=${reloadKey}` : base;
  }, [appId, filePath, reloadKey]);
  const actions = useFileActions({ appId, filePath, appRootPath });
  // Chromium's PDF viewer can fail to load a custom-protocol document in some
  // builds; track load errors so we can surface the "open externally" path.
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        isExpanded && "fixed inset-0 z-50",
      )}
    >
      <PreviewBar
        filePath={filePath}
        fileTypeLabel="PDF"
        icon={FileText}
        actions={actions}
        right={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFailed(false);
                      setReloadKey((k) => k + 1);
                    }}
                  >
                    <RotateCcw size={13} />
                  </Button>
                }
              />
              <TooltipContent>Reload</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsExpanded((e) => !e)}
                  >
                    {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </Button>
                }
              />
              <TooltipContent>{isExpanded ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
            </Tooltip>
          </>
        }
      />
      {url && !failed ? (
        <iframe
          key={reloadKey}
          src={url}
          title={filePath}
          className="min-h-0 flex-1 w-full border-0 bg-[#525659]"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <FileText className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              The PDF can't be rendered inline. Open it with your default app to read it.
            </p>
            <Button variant="outline" size="sm" onClick={actions.openExternally}>
              Open in default app
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
