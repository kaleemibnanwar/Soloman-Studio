import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileArchive, FileText, Folder } from "lucide-react";
import { ipc } from "@/ipc/types";
import { PreviewBar, PreviewError, PreviewLoading, formatBytes, useFileActions } from "./shared";

interface ArchivePreviewProps {
  appId: number | null;
  filePath: string;
  appRootPath?: string;
}

export function ArchivePreview({ appId, filePath, appRootPath }: ArchivePreviewProps) {
  const actions = useFileActions({ appId, filePath, appRootPath });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["archive-entries", appId, filePath],
    queryFn: () => ipc.app.listArchiveEntries({ appId: appId!, filePath }),
    enabled: appId != null,
    retry: false,
  });

  const total = useMemo(
    () => data?.entries.reduce((sum, e) => sum + (e.isDirectory ? 0 : e.uncompressedSize), 0) ?? 0,
    [data],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewBar
        filePath={filePath}
        fileTypeLabel="Archive"
        icon={FileArchive}
        actions={actions}
        right={
          data && (
            <span className="mr-1 text-xs text-muted-foreground">
              {data.entries.length.toLocaleString()} items · {formatBytes(total)}
            </span>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <PreviewLoading label="Reading archive…" />
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <PreviewError
              message="This archive format can't be listed inline. Open it with your default app to browse it."
              onRetry={() => refetch()}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {data?.entries.map((entry, index) => (
              <li
                key={`${entry.name}-${index}`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40"
              >
                {entry.isDirectory ? (
                  <Folder size={14} className="shrink-0 text-muted-foreground" />
                ) : (
                  <FileText size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{entry.name}</span>
                {!entry.isDirectory && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatBytes(entry.uncompressedSize)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {data?.truncated && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Showing the first 5,000 entries. Open the archive to see everything.
          </p>
        )}
      </div>
    </div>
  );
}
