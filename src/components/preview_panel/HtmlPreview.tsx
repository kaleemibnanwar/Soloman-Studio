import { useLoadAppFile } from "@/hooks/useLoadAppFile";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HtmlPreviewProps {
  appId: number | null;
  filePath: string;
}

export function HtmlPreview({ appId, filePath }: HtmlPreviewProps) {
  const { content, loading, error } = useLoadAppFile(appId, filePath);
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-destructive">
        {String(error)}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white overflow-hidden">
      <iframe
        srcDoc={content || ""}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin"
        title={filePath}
      />
    </div>
  );
}
