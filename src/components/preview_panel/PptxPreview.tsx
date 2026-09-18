import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";

interface PptxPreviewProps {
  appId: number | null;
  filePath: string;
}

/** office-open colors are usually `{ value: "RRGGBB", transforms?: {...} }`, not plain strings. */
type ColorLike = string | { value?: string; [key: string]: unknown };

interface FillLike {
  type?: string;
  color?: ColorLike;
}

interface ShapeLike {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: FillLike;
  textBody?: unknown;
  [key: string]: unknown;
}

interface SlideChildLike {
  shape?: ShapeLike;
  [key: string]: unknown;
}

interface SlideLike {
  children?: SlideChildLike[];
  background?: { fill?: FillLike };
  [key: string]: unknown;
}

interface PresentationLike {
  slides?: SlideLike[];
  size?: string;
  [key: string]: unknown;
}

// Standard PowerPoint slide dimensions in EMU (914400 EMU per inch), matching
// the units shape x/y/width/height come back in from parsePresentation.
const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  "16:9": { w: 12192000, h: 6858000 },
  "4:3": { w: 9144000, h: 6858000 },
};

function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (typeof node === "string") {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, acc);
    return acc;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.text === "string") acc.push(o.text);
    for (const key of ["runs", "paragraphs", "children"]) {
      if (key in o) collectText(o[key], acc);
    }
  }
  return acc;
}

function fillColor(fill: FillLike | undefined): string | undefined {
  if (!fill || fill.type === "none" || !fill.color) return undefined;
  const raw = typeof fill.color === "string" ? fill.color : fill.color.value;
  if (typeof raw !== "string") return undefined;
  const hex = raw.replace(/^#/, "");
  return hex.length === 6 || hex.length === 8 ? `#${hex.slice(-6)}` : undefined;
}

function Slide({ slide, canvas }: { slide: SlideLike; canvas: { w: number; h: number } }) {
  const background = fillColor(slide.background?.fill);
  return (
    <div
      className="relative w-full overflow-hidden rounded border bg-white shadow-sm"
      style={{
        aspectRatio: `${canvas.w} / ${canvas.h}`,
        backgroundColor: background ?? "#ffffff",
        containerType: "size",
      }}
    >
      {(slide.children ?? []).map((child, i) => {
        if (!child.shape) return null;
        const { x = 0, y = 0, width = 0, height = 0 } = child.shape;
        const text = collectText(child.shape.textBody).filter(Boolean).join(" ");
        const box = fillColor(child.shape.fill);
        const heightPct = (height / canvas.h) * 100;
        return (
          <div
            key={i}
            className="absolute overflow-hidden text-neutral-900"
            style={{
              left: `${(x / canvas.w) * 100}%`,
              top: `${(y / canvas.h) * 100}%`,
              width: `${(width / canvas.w) * 100}%`,
              height: `${heightPct}%`,
              backgroundColor: box,
            }}
          >
            {text && (
              // cqh (container query height) ties font size to the rendered
              // slide's actual on-screen height, since raw EMU dimensions
              // don't translate to a sensible pixel size directly.
              <div
                className="flex h-full w-full items-center px-[2%] py-[1%] leading-snug break-words"
                style={{ fontSize: `${Math.max(1.2, Math.min(8, heightPct * 0.3))}cqh` }}
              >
                {text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Read-only slide-canvas preview for .pptx: shapes are laid out by their
 * stored x/y/width/height as percentages of the slide canvas, so it's
 * responsive without needing pixel-exact PowerPoint font/layout fidelity.
 * Editing pptx decks is out of scope - this is a viewer with a thumbnail
 * rail and slide navigation, not a slide editor.
 */
export function PptxPreview({ appId, filePath }: PptxPreviewProps) {
  const [presentation, setPresentation] = useState<PresentationLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (appId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc.office
      .parseFile({ appId, relPath: filePath })
      .then((result) => {
        if (cancelled) return;
        if (!result || result.kind !== "pptx") {
          setError("Couldn't read this file. It may be corrupted or missing.");
          return;
        }
        setPresentation(result.data as PresentationLike);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, filePath]);

  const slides = presentation?.slides ?? [];
  const canvas = useMemo(
    () => CANVAS_SIZES[presentation?.size ?? "16:9"] ?? CANVAS_SIZES["16:9"],
    [presentation?.size],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setActiveIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error ?? "Failed to load file"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="truncate font-mono text-xs text-muted-foreground">{filePath}</span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {slides.length > 0 ? activeIndex + 1 : 0} / {slides.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={activeIndex >= slides.length - 1}
            onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!expanded && (
          <div className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-muted/20 p-2">
            {slides.map((slide, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={cn(
                  "rounded border-2 text-left transition-colors",
                  i === activeIndex ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <Slide slide={slide} canvas={canvas} />
                <div className="mt-1 text-center text-[10px] text-muted-foreground">{i + 1}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          {slides[activeIndex] ? (
            <div className="w-full max-w-4xl">
              <Slide slide={slides[activeIndex]} canvas={canvas} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">This presentation has no slides.</div>
          )}
        </div>
      </div>
    </div>
  );
}
