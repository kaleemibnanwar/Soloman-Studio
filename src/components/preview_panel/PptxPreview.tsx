import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Presentation,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";

interface PptxPreviewProps {
  appId: number | null;
  filePath: string;
}

/** office-open colors are usually `{ value: "RRGGBB", transforms?: {...} }` or plain strings. */
type ColorLike = string | { value?: string; color?: unknown; [key: string]: unknown };

interface FillLike {
  type?: string;
  color?: ColorLike;
  [key: string]: unknown;
}

interface OutlineLike {
  color?: ColorLike;
  width?: number;
  [key: string]: unknown;
}

interface ShapeLike {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  geometry?: string;
  fill?: FillLike;
  outline?: OutlineLike;
  textBody?: unknown;
  [key: string]: unknown;
}

interface TableCellLike {
  text?: string;
  fill?: FillLike;
  children?: unknown;
  [key: string]: unknown;
}

interface TableRowLike {
  cells?: TableCellLike[];
  [key: string]: unknown;
}

interface TableLike {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  columnWidths?: number[];
  rows?: TableRowLike[];
  [key: string]: unknown;
}

interface SlideChildLike {
  shape?: ShapeLike;
  table?: TableLike;
  picture?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SlideLike {
  children?: SlideChildLike[];
  background?: { fill?: FillLike };
  notes?: unknown;
  [key: string]: unknown;
}

interface PresentationLike {
  slides?: SlideLike[];
  size?: string;
  [key: string]: unknown;
}

// Standard PowerPoint slide dimensions in EMU (914400 EMU per inch).
const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  "16:9": { w: 12192000, h: 6858000 },
  "4:3": { w: 9144000, h: 6858000 },
};

function extractHexColor(input: unknown): string | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    const clean = input.replace(/^#/, "").trim();
    if (/^[0-9A-Fa-f]{6}$/.test(clean) || /^[0-9A-Fa-f]{8}$/.test(clean)) {
      return `#${clean.slice(-6)}`;
    }
    return undefined;
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (obj.color) return extractHexColor(obj.color);
    if (typeof obj.value === "string") return extractHexColor(obj.value);
    if (typeof obj.fill === "object") return extractHexColor(obj.fill);
  }
  return undefined;
}

function getHexLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    const a = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const a = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  return 1;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getHexLuminance(hex1);
  const lum2 = getHexLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolveSafeContrastColor(
  textColor: string | undefined,
  backgroundColor: string | undefined,
  fallbackLight = "#FFFFFF",
  fallbackDark = "#0F172A",
): string {
  const effectiveBg = backgroundColor ? extractHexColor(backgroundColor) || "#FFFFFF" : "#FFFFFF";
  const bgLuminance = getHexLuminance(effectiveBg);
  const isDarkBg = bgLuminance < 0.45;

  if (!textColor) {
    return isDarkBg ? fallbackLight : fallbackDark;
  }

  const cleanText = extractHexColor(textColor) || textColor;
  if (cleanText.startsWith("#")) {
    const ratio = getContrastRatio(cleanText, effectiveBg);
    if (ratio < 3.2) {
      return isDarkBg ? fallbackLight : fallbackDark;
    }
    return cleanText;
  }

  return isDarkBg ? fallbackLight : fallbackDark;
}

interface ParsedRun {
  text: string;
  size?: number; // in pt
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
}

interface ParsedParagraph {
  runs: ParsedRun[];
  alignment?: "left" | "center" | "right" | "justify";
  bullet?: boolean | string;
  spaceBefore?: number;
  spaceAfter?: number;
}

function parseParagraphsFromTextBody(textBody: unknown): ParsedParagraph[] {
  if (!textBody) return [];
  if (typeof textBody === "string") {
    return [{ runs: [{ text: textBody }] }];
  }

  const result: ParsedParagraph[] = [];
  const tb = textBody as Record<string, unknown>;
  const rawParas = Array.isArray(tb.paragraphs)
    ? tb.paragraphs
    : Array.isArray(textBody)
      ? textBody
      : [tb];

  for (const p of rawParas) {
    if (!p) continue;
    if (typeof p === "string") {
      result.push({ runs: [{ text: p }] });
      continue;
    }

    const pObj = p as Record<string, unknown>;
    const pProps = (pObj.properties as Record<string, unknown>) ?? {};
    const defRPr = (pProps.defaultRunProperties as Record<string, unknown>) ?? {};

    const rawAlign = String(pProps.alignment ?? "").toLowerCase();
    const alignment: "left" | "center" | "right" | "justify" =
      rawAlign === "center" || rawAlign === "ctr"
        ? "center"
        : rawAlign === "right" || rawAlign === "r"
          ? "right"
          : rawAlign === "justify" || rawAlign === "just"
            ? "justify"
            : "left";

    const runs: ParsedRun[] = [];
    const rawRuns = Array.isArray(pObj.runs)
      ? pObj.runs
      : Array.isArray(pObj.children)
        ? pObj.children
        : [];

    for (const r of rawRuns) {
      if (!r) continue;
      if (typeof r === "string") {
        runs.push({ text: r });
        continue;
      }
      const rObj = r as Record<string, unknown>;
      const text = String(rObj.text ?? rObj.value ?? "");
      if (!text) continue;

      const rProps = (rObj.properties as Record<string, unknown>) ?? {};
      const sizeVal = rProps.size ?? rProps.fontSize ?? defRPr.size ?? defRPr.fontSize;
      const size =
        typeof sizeVal === "number" ? (sizeVal > 100 ? sizeVal / 100 : sizeVal) : undefined;
      const bold = Boolean(rProps.bold ?? defRPr.bold);
      const italic = Boolean(rProps.italic ?? defRPr.italic);
      const underline = Boolean(rProps.underline ?? defRPr.underline);
      const color = extractHexColor(rProps.color ?? rProps.fill ?? defRPr.color ?? defRPr.fill);

      runs.push({ text, size, bold, italic, underline, color });
    }

    if (runs.length === 0 && typeof pObj.text === "string" && pObj.text) {
      runs.push({ text: pObj.text });
    }

    result.push({
      runs,
      alignment,
      bullet: Boolean(pProps.bullet || pProps.bulletCharacter),
    });
  }

  return result;
}

function ShapeItem({
  shape,
  canvas,
  baseH,
  slideBackground,
}: {
  shape: ShapeLike;
  canvas: { w: number; h: number };
  baseH: number;
  slideBackground?: string;
}) {
  const leftPx = ((shape.x ?? 0) / canvas.w) * 960;
  const topPx = ((shape.y ?? 0) / canvas.h) * baseH;
  const widthPx = ((shape.width ?? 0) / canvas.w) * 960;
  const heightPx = ((shape.height ?? 0) / canvas.h) * baseH;

  const bgHex = extractHexColor(shape.fill?.color);
  const borderHex = extractHexColor(shape.outline?.color);
  const isRounded = shape.geometry === "roundRect" || shape.geometry === "roundRectangle";

  const effectiveBg = bgHex || slideBackground;
  const paragraphs = parseParagraphsFromTextBody(shape.textBody);

  return (
    <div
      style={{
        position: "absolute",
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        backgroundColor: bgHex,
        borderColor: borderHex,
        borderWidth: borderHex ? "1px" : undefined,
        borderStyle: borderHex ? "solid" : undefined,
        borderRadius: isRounded ? "10px" : undefined,
      }}
      className="overflow-hidden p-3 flex flex-col justify-center box-border"
    >
      {paragraphs.map((p, pIdx) => (
        <div
          key={pIdx}
          style={{ textAlign: p.alignment ?? "left" }}
          className={cn("leading-snug my-1", p.bullet && "list-disc pl-4")}
        >
          {p.runs.map((r, rIdx) => {
            const finalColor = resolveSafeContrastColor(r.color, effectiveBg);
            return (
              <span
                key={rIdx}
                style={{
                  fontSize: r.size ? `${Math.max(10, Math.round(r.size * 1.1))}px` : "16px",
                  fontWeight: r.bold ? 700 : 400,
                  fontStyle: r.italic ? "italic" : "normal",
                  textDecoration: r.underline ? "underline" : "none",
                  color: finalColor,
                  lineHeight: "1.3",
                }}
              >
                {r.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TableItem({
  table,
  canvas,
  baseH,
  slideBackground,
}: {
  table: TableLike;
  canvas: { w: number; h: number };
  baseH: number;
  slideBackground?: string;
}) {
  const leftPx = ((table.x ?? 0) / canvas.w) * 960;
  const topPx = ((table.y ?? 0) / canvas.h) * baseH;
  const widthPx = ((table.width ?? 0) / canvas.w) * 960;
  const heightPx = ((table.height ?? 0) / canvas.h) * baseH;

  return (
    <div
      style={{
        position: "absolute",
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
      }}
      className="overflow-hidden box-border"
    >
      <table className="w-full h-full border-collapse table-fixed text-sm">
        <tbody>
          {(table.rows ?? []).map((row, rIdx) => (
            <tr key={rIdx}>
              {(row.cells ?? []).map((cell, cIdx) => {
                const cellBg =
                  extractHexColor(cell.fill?.color) || (rIdx === 0 ? "#0F172A" : undefined);
                const textColor =
                  rIdx === 0
                    ? "#FFFFFF"
                    : resolveSafeContrastColor(undefined, cellBg || slideBackground);
                return (
                  <td
                    key={cIdx}
                    style={{ backgroundColor: cellBg, color: textColor }}
                    className="border border-border/40 p-2 align-middle truncate font-medium"
                  >
                    {cell.text ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Slide({ slide, canvas }: { slide: SlideLike; canvas: { w: number; h: number } }) {
  const bgHex = extractHexColor(slide.background?.fill?.color) || "#FFFFFF";
  const baseW = 960;
  const baseH = Math.round(960 * (canvas.h / canvas.w));

  return (
    <div
      style={{
        width: `${baseW}px`,
        height: `${baseH}px`,
        backgroundColor: bgHex,
      }}
      className="relative rounded-lg border border-border/60 shadow-md overflow-hidden shrink-0"
    >
      {(slide.children ?? []).map((child, i) => {
        if (child.shape) {
          return (
            <ShapeItem
              key={i}
              shape={child.shape}
              canvas={canvas}
              baseH={baseH}
              slideBackground={bgHex}
            />
          );
        }
        if (child.table) {
          return (
            <TableItem
              key={i}
              table={child.table}
              canvas={canvas}
              baseH={baseH}
              slideBackground={bgHex}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ThumbnailCard({
  slide,
  index,
  isActive,
  canvas,
  onClick,
}: {
  slide: SlideLike;
  index: number;
  isActive: boolean;
  canvas: { w: number; h: number };
  onClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.16);
  const baseW = 960;
  const baseH = Math.round(960 * (canvas.h / canvas.w));

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setScale(entry.contentRect.width / baseW);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [baseW]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-md border-2 p-1 text-left transition-all duration-150 w-full",
        isActive
          ? "border-primary shadow-sm ring-2 ring-primary/20 bg-background"
          : "border-border/40 hover:border-border bg-background/50 hover:bg-background",
      )}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: `${baseH * scale}px`,
        }}
        className="relative overflow-hidden rounded bg-background"
      >
        <div
          style={{
            width: `${baseW}px`,
            height: `${baseH}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="pointer-events-none absolute top-0 left-0"
        >
          <Slide slide={slide} canvas={canvas} />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-medium px-1">
        <span>Slide {index + 1}</span>
        {isActive && <span className="text-primary font-semibold">Active</span>}
      </div>
    </button>
  );
}

export function PptxPreview({ appId, filePath }: PptxPreviewProps) {
  const [presentation, setPresentation] = useState<PresentationLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [isPresenterMode, setIsPresenterMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [zoom, setZoom] = useState(100);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize({ width, height });
        }
      }
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation for presentation & deck browsing (Google Slides style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!presentation?.slides?.length) return;
      const count = presentation.slides.length;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (isPresenterMode && e.key === " ")) {
        e.preventDefault();
        setActiveIndex((i) => Math.min(count - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(count - 1);
      } else if (e.key === "Escape") {
        if (isPresenterMode) setIsPresenterMode(false);
        if (expanded) setExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentation, isPresenterMode, expanded]);

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

  const baseW = 960;
  const baseH = Math.round(960 * (canvas.h / canvas.w));

  const padding = isPresenterMode ? 48 : 32;
  const availW = Math.max(viewportSize.width - padding * 2, 80);
  const availH = Math.max(
    viewportSize.height - padding * 2 - (showNotes && !isPresenterMode ? 140 : 0),
    80,
  );

  const fitScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(availW / baseW, availH / baseH)
      : 0.8;
  const currentScale = Math.max(0.1, fitScale * (zoom / 100));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error ?? "Failed to load file"}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Presentation Top Control Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 bg-muted/20 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Presentation size={14} className="text-violet-500" />
          <span className="truncate font-mono text-xs text-muted-foreground">{filePath}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 mr-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setZoom((z) => Math.max(30, z - 15))}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>
            <span className="w-10 text-center font-mono text-[11px] text-muted-foreground">
              {zoom}%
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setZoom((z) => Math.min(250, z + 15))}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setZoom(100)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                }
              />
              <TooltipContent>Reset Zoom (100%)</TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-1 h-4 w-px bg-border/60" />

          {/* Slide navigation buttons */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground font-medium px-1">
            {activeIndex + 1} / {slides.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={activeIndex >= slides.length - 1}
            onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-1 h-4 w-px bg-border/60" />

          {/* Speaker Notes Toggle */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={showNotes ? "secondary" : "ghost"}
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowNotes((v) => !v)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Notes</span>
                </Button>
              }
            />
            <TooltipContent>Toggle Speaker Notes</TooltipContent>
          </Tooltip>

          {/* Presenter Mode (Slideshow) */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs bg-primary/10 text-primary hover:bg-primary/20"
                  onClick={() => setIsPresenterMode(true)}
                >
                  <Play className="h-3 w-3" />
                  <span>Present</span>
                </Button>
              }
            />
            <TooltipContent>Start Slideshow (Presenter Mode)</TooltipContent>
          </Tooltip>

          {/* Toggle Thumbnails */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              }
            />
            <TooltipContent>{expanded ? "Show Thumbnails" : "Hide Thumbnails"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Slide Deck Container */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Slide Thumbnails Sidebar */}
        {!expanded && !isPresenterMode && (
          <div className="flex w-44 shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border/60 bg-muted/10 p-2.5">
            {slides.map((slide, i) => (
              <ThumbnailCard
                key={i}
                slide={slide}
                index={i}
                isActive={i === activeIndex}
                canvas={canvas}
                onClick={() => setActiveIndex(i)}
              />
            ))}
          </div>
        )}

        {/* Center Canvas */}
        <div
          ref={viewportRef}
          className={cn(
            "flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8",
            isPresenterMode ? "fixed inset-0 z-50 bg-black/95 p-12" : "bg-muted/5",
          )}
        >
          {slides[activeIndex] ? (
            <div className="flex flex-col items-center gap-4">
              {/* Proportional Scaled Slide */}
              <div
                style={{
                  width: `${baseW * currentScale}px`,
                  height: `${baseH * currentScale}px`,
                }}
                className="relative shrink-0 transition-[width,height] duration-75 shadow-lg rounded-lg overflow-hidden"
              >
                <div
                  style={{
                    width: `${baseW}px`,
                    height: `${baseH}px`,
                    transform: `scale(${currentScale})`,
                    transformOrigin: "top left",
                  }}
                  className="absolute top-0 left-0"
                >
                  <Slide slide={slides[activeIndex]} canvas={canvas} />
                </div>
              </div>

              {/* Speaker Notes Drawer (Google Slides style) */}
              {showNotes && !isPresenterMode && (
                <div
                  style={{ width: `${Math.min(Math.max(baseW * currentScale, 320), 800)}px` }}
                  className="rounded-lg border border-border/70 bg-background/90 p-3.5 shadow-sm text-xs text-foreground/90 transition-all duration-75"
                >
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <MessageSquare size={12} />
                    <span>Speaker Notes — Slide {activeIndex + 1}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    {String(
                      (typeof slides[activeIndex]?.notes === "object" &&
                      slides[activeIndex]?.notes !== null
                        ? (slides[activeIndex].notes as { text?: string }).text
                        : slides[activeIndex]?.notes) ||
                        "No presenter notes recorded for this slide.",
                    )}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">This presentation has no slides.</div>
          )}

          {/* Presenter Mode Controls Bar */}
          {isPresenterMode && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/80 backdrop-blur border border-white/20 px-4 py-2 rounded-full text-white text-xs shadow-2xl">
              <span>
                {activeIndex + 1} / {slides.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                disabled={activeIndex >= slides.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))}
              >
                <ChevronRight size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-white/80 hover:text-white"
                onClick={() => setIsPresenterMode(false)}
              >
                Exit (Esc)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
