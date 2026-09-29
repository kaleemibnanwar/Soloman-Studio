import { useMemo, useState } from "react";
import {
  Loader2,
  BookOpen,
  Copy,
  Check,
  Search,
  Clock,
  FileText,
  ChevronRight,
  ListTree,
} from "lucide-react";
import { useLoadAppFile } from "@/hooks/useLoadAppFile";
import { VanillaMarkdownParser } from "@/components/chat/OctopusStudioMarkdownParser";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  appId: number | null;
  filePath: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(content: string): TocItem[] {
  const lines = content.split(/\r?\n/);
  const toc: TocItem[] = [];
  let headingIndex = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[#*`_~]/g, "").trim();
      const id = `heading-${headingIndex++}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      toc.push({ id, text, level });
    }
  }
  return toc;
}

function computeStats(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const chars = content.length;
  const readTimeMin = Math.max(1, Math.ceil(words / 200));
  return { words, chars, readTimeMin };
}

/** Enhanced Markdown document reader with Outline (TOC), Reading Stats, and Quick Copy. */
export function MarkdownPreview({ appId, filePath }: MarkdownPreviewProps) {
  const { content, loading, error } = useLoadAppFile(appId, filePath);
  const [showToc, setShowToc] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawContent = content ?? "";
  const toc = useMemo(() => extractToc(rawContent), [rawContent]);
  const stats = useMemo(() => computeStats(rawContent), [rawContent]);

  const handleCopy = () => {
    if (!rawContent) return;
    navigator.clipboard.writeText(rawContent).then(() => {
      setCopied(true);
      showSuccess("Copied markdown content");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">{String(error)}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Document Sub-Bar: Stats & Outline Toggle */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-1.5 bg-muted/20 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          {toc.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground",
                showToc && "bg-muted text-foreground",
              )}
              onClick={() => setShowToc((v) => !v)}
            >
              <ListTree size={12} />
              <span>Outline ({toc.length})</span>
            </Button>
          )}

          <span className="flex items-center gap-1 text-[11px]">
            <FileText size={11} />
            {stats.words.toLocaleString()} words
          </span>

          <span className="flex items-center gap-1 text-[11px]">
            <Clock size={11} />~{stats.readTimeMin} min read
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </Button>
              }
            />
            <TooltipContent>{copied ? "Copied" : "Copy markdown"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Area: Optional TOC Sidebar + Markdown Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showToc && toc.length > 0 && (
          <div className="w-56 shrink-0 border-r border-border/60 bg-muted/10 p-3 overflow-y-auto space-y-1">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1">
              Table of Contents
            </div>
            {toc.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  "truncate text-xs py-1 px-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1",
                  item.level === 1 && "font-semibold text-foreground",
                  item.level === 2 && "pl-3",
                  item.level >= 3 && "pl-5 text-[11px]",
                )}
              >
                <ChevronRight size={10} className="shrink-0 text-muted-foreground/60" />
                <span className="truncate">{item.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <article className="prose prose-sm dark:prose-invert mx-auto max-w-3xl px-8 py-6">
            <VanillaMarkdownParser content={rawContent} />
          </article>
        </div>
      </div>
    </div>
  );
}
