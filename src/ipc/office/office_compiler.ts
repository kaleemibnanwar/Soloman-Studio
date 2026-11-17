import { resolveColorScheme, recolor, type ColorRole, type ColorScheme } from "./office_theme";
import {
  PORTRAIT_PAGE,
  rule as docxRule,
  p as docxParagraph,
  h1 as docxHeading1,
  titleBlock as docxTitleBlock,
} from "./builders/docx";
import {
  W,
  H,
  MARGIN,
  CONTENT_W,
  titleSlide,
  bulletSlide,
  statSlide,
  closingSlide,
} from "./builders/pptx";
import {
  cell as xlsxCell,
  row as xlsxRow,
  cols as xlsxCols,
  NUM_CURRENCY,
  NUM_PERCENT,
  NUM_NUMBER,
} from "./builders/xlsx";

// ---------------------------------------------------------------------------
// DOCX Types & Compiler
// ---------------------------------------------------------------------------

export type DocxBlock =
  | { type: "heading"; level?: 1 | 2 | 3; text: string }
  | {
      type: "paragraph";
      text: string;
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right" | "justify";
    }
  | { type: "bullet_list" | "bullets" | "list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: (string | number | boolean | null)[][];
      columnWidths?: number[];
    }
  | { type: "callout" | "quote"; text: string; title?: string }
  | { type: "divider" | "rule" }
  | { type: "spacer"; height?: number }
  | { type: "title_block"; title: string; subtitle?: string };

export interface DocxCompileOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
  markdown?: string;
  content?: string | DocxBlock[];
  blocks?: DocxBlock[];
  sections?: unknown[];
  colorScheme?: string;
  colors?: Partial<Record<ColorRole, string>>;
}

/** Parse inline markdown styling (***bold-italic***, **bold**, *italic*, `code`) into office-open run objects. */
export function parseInlineRuns(
  text: string,
  defaultSize = 10.5,
  defaultColor = "1E293B",
): unknown[] {
  if (!text) {
    return [{ text: "", size: defaultSize, ...(defaultColor ? { color: defaultColor } : {}) }];
  }
  const runs: unknown[] = [];
  const regex = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push({
        text: match[2],
        bold: true,
        italic: true,
        size: defaultSize,
        ...(defaultColor ? { color: defaultColor } : {}),
      });
    } else if (match[3]) {
      runs.push({
        text: match[3],
        bold: true,
        size: defaultSize,
        ...(defaultColor ? { color: defaultColor } : {}),
      });
    } else if (match[4]) {
      runs.push({
        text: match[4],
        italic: true,
        size: defaultSize,
        ...(defaultColor ? { color: defaultColor } : {}),
      });
    } else if (match[5]) {
      runs.push({
        text: match[5],
        font: { name: "Consolas" },
        size: defaultSize * 0.9,
        shading: { fill: "F1F5F9" },
        ...(defaultColor ? { color: defaultColor } : {}),
      });
    } else if (match[6]) {
      runs.push({
        text: match[6],
        size: defaultSize,
        ...(defaultColor ? { color: defaultColor } : {}),
      });
    }
  }
  return runs.length > 0
    ? runs
    : [{ text, size: defaultSize, ...(defaultColor ? { color: defaultColor } : {}) }];
}

/** Convert markdown table lines into headers and rows. */
function parseMarkdownTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const parsedRows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") && !trimmed.endsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue; // skip separator row
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length > 0) {
      parsedRows.push(cells);
    }
  }
  if (parsedRows.length === 0) return null;
  return {
    headers: parsedRows[0],
    rows: parsedRows.slice(1),
  };
}

/** Compile markdown text into office-open Section children with professional typography. */
export function compileMarkdownToDocxChildren(markdown: string, palette: ColorScheme): unknown[] {
  const lines = markdown.split(/\r?\n/);
  const children: unknown[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseMarkdownTable(tableLines);
      if (parsed && parsed.headers.length > 0) {
        children.push(compileTableToDocx(parsed.headers, parsed.rows, undefined, palette));
        children.push({ paragraph: { spacing: { after: 120 } } }); // clean spacing after table
      }
      continue;
    }

    // Heading 1 (#)
    if (trimmed.startsWith("# ")) {
      children.push({
        paragraph: {
          heading: "Heading1",
          spacing: { before: 260, after: 100 },
          children: [{ text: trimmed.slice(2), bold: true, size: 17, color: palette.primary }],
        },
      });
      i++;
      continue;
    }
    // Heading 2 (##)
    if (trimmed.startsWith("## ")) {
      children.push({
        paragraph: {
          heading: "Heading2",
          spacing: { before: 200, after: 80 },
          children: [{ text: trimmed.slice(3), bold: true, size: 14, color: palette.primary }],
        },
      });
      i++;
      continue;
    }
    // Heading 3 (###)
    if (trimmed.startsWith("### ")) {
      children.push({
        paragraph: {
          heading: "Heading3",
          spacing: { before: 160, after: 60 },
          children: [{ text: trimmed.slice(4), bold: true, size: 12, color: palette.secondary }],
        },
      });
      i++;
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      children.push({
        paragraph: {
          spacing: { before: 120, after: 180 },
          border: { bottom: { style: "single", color: palette.secondary, size: 6, space: 4 } },
        },
      });
      i++;
      continue;
    }

    // Blockquote / Callout (>)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const quoteText = quoteLines.join(" ");
      children.push({
        paragraph: {
          spacing: { before: 140, after: 160 },
          shading: { fill: palette.surface, color: "auto", type: "clear" },
          border: { left: { style: "single", color: palette.secondary, size: 24, space: 14 } },
          indent: { left: 240, right: 240 },
          children: parseInlineRuns(quoteText, 10, palette.muted),
        },
      });
      continue;
    }

    // Bullet List Item (- , * , + )
    if (/^[-*+]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*+]\s+/, "");
      children.push({
        paragraph: {
          style: "ListParagraph",
          spacing: { after: 60, line: 260, lineRule: "auto" },
          numbering: { reference: "list_1", level: 0, autoStyle: false },
          children: parseInlineRuns(bulletText, 10.5, "1E293B"),
        },
      });
      i++;
      continue;
    }

    // Numbered List Item (1. , 2. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const numText = trimmed.replace(/^\d+\.\s+/, "");
      children.push({
        paragraph: {
          style: "ListParagraph",
          spacing: { after: 60, line: 260, lineRule: "auto" },
          numbering: { reference: "list_1", level: 0, autoStyle: false },
          children: parseInlineRuns(numText, 10.5, "1E293B"),
        },
      });
      i++;
      continue;
    }

    // Regular Body Paragraph
    children.push({
      paragraph: {
        spacing: { after: 140, line: 276, lineRule: "auto" },
        children: parseInlineRuns(trimmed, 10.5, "1E293B"),
      },
    });
    i++;
  }

  return children;
}

/** Build an executive-styled DOCX table with column widths and alternating zebra rows. */
export function compileTableToDocx(
  headers: string[],
  rows: (string | number | boolean | null)[][],
  columnWidths?: number[],
  palette: ColorScheme = resolveColorScheme(),
): unknown {
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const totalWidth = 10080; // Printable area in twips on standard letter page (8.5" - 1.5" margins)
  const defaultColWidth = Math.floor(totalWidth / colCount);
  const widths =
    columnWidths && columnWidths.length === colCount
      ? columnWidths
      : Array(colCount).fill(defaultColWidth);

  const headerRowCells = headers.map((h, colIndex) => ({
    width: { size: widths[colIndex] ?? defaultColWidth, type: "twips" },
    shading: { fill: palette.primary, color: "auto", type: "clear" },
    margins: {
      top: { size: 120, type: "twips" },
      bottom: { size: 120, type: "twips" },
      left: { size: 140, type: "twips" },
      right: { size: 140, type: "twips" },
    },
    children: [
      {
        paragraph: {
          spacing: { before: 0, after: 0 },
          children: [{ text: String(h), bold: true, color: palette.primaryText, size: 9.5 }],
        },
      },
    ],
  }));

  const dataRowElements = rows.map((rowCells, rowIndex) => {
    const isEven = rowIndex % 2 === 1;
    const bgFill = isEven ? palette.surface : "FFFFFF";
    return {
      cells: Array.from({ length: colCount }).map((_, colIndex) => {
        const val = rowCells[colIndex] ?? "";
        return {
          width: { size: widths[colIndex] ?? defaultColWidth, type: "twips" },
          shading: { fill: bgFill, color: "auto", type: "clear" },
          margins: {
            top: { size: 80, type: "twips" },
            bottom: { size: 80, type: "twips" },
            left: { size: 140, type: "twips" },
            right: { size: 140, type: "twips" },
          },
          children: [
            {
              paragraph: {
                spacing: { before: 0, after: 0 },
                children: [{ text: String(val), size: 9.5, color: "1E293B" }],
              },
            },
          ],
        };
      }),
    };
  });

  return {
    table: {
      width: { size: totalWidth, type: "twips" },
      borders: {
        top: { style: "single", color: palette.border, size: 4 },
        left: { style: "single", color: palette.border, size: 4 },
        bottom: { style: "single", color: palette.border, size: 4 },
        right: { style: "single", color: palette.border, size: 4 },
        insideHorizontal: { style: "single", color: palette.border, size: 4 },
        insideVertical: { style: "single", color: palette.border, size: 4 },
      },
      columnWidths: widths,
      rows: [{ cells: headerRowCells }, ...dataRowElements],
    },
  };
}

/** Compile high-level DocxBlocks into office-open Section children. */
export function compileBlocksToDocxChildren(blocks: DocxBlock[], palette: ColorScheme): unknown[] {
  const children: unknown[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;

    switch (block.type) {
      case "heading": {
        const level = block.level ?? 1;
        const size = level === 1 ? 17 : level === 2 ? 14 : 12;
        const color = level === 3 ? palette.secondary : palette.primary;
        children.push({
          paragraph: {
            heading: `Heading${level}`,
            spacing: { before: level === 1 ? 240 : 180, after: 80 },
            children: [{ text: block.text, bold: true, size, color }],
          },
        });
        break;
      }
      case "title_block": {
        children.push(...docxTitleBlock(block.title, block.subtitle));
        break;
      }
      case "paragraph": {
        children.push({
          paragraph: {
            spacing: { after: 140, line: 276, lineRule: "auto" },
            ...(block.align ? { alignment: block.align } : {}),
            children: parseInlineRuns(block.text, 10.5, "1E293B"),
          },
        });
        break;
      }
      case "bullet_list":
      case "bullets":
      case "list": {
        for (const item of block.items ?? []) {
          children.push({
            paragraph: {
              style: "ListParagraph",
              spacing: { after: 60, line: 260, lineRule: "auto" },
              numbering: { reference: "list_1", level: 0, autoStyle: false },
              children: parseInlineRuns(String(item), 10.5, "1E293B"),
            },
          });
        }
        break;
      }
      case "numbered_list": {
        for (const item of block.items ?? []) {
          children.push({
            paragraph: {
              style: "ListParagraph",
              spacing: { after: 60, line: 260, lineRule: "auto" },
              numbering: { reference: "list_1", level: 0, autoStyle: false },
              children: parseInlineRuns(String(item), 10.5, "1E293B"),
            },
          });
        }
        break;
      }
      case "table": {
        if (block.headers && block.rows) {
          children.push(compileTableToDocx(block.headers, block.rows, block.columnWidths, palette));
          children.push({ paragraph: { spacing: { after: 120 } } });
        }
        break;
      }
      case "callout":
      case "quote": {
        children.push({
          paragraph: {
            spacing: { before: 140, after: 160 },
            shading: { fill: palette.surface, color: "auto", type: "clear" },
            border: { left: { style: "single", color: palette.secondary, size: 24, space: 14 } },
            indent: { left: 240, right: 240 },
            children: parseInlineRuns(block.text, 10, palette.muted),
          },
        });
        break;
      }
      case "divider":
      case "rule": {
        children.push(docxRule());
        break;
      }
      case "spacer": {
        children.push({ paragraph: { spacing: { after: block.height ?? 200 } } });
        break;
      }
      default: {
        const raw = block as Record<string, unknown>;
        if (typeof raw.text === "string") {
          children.push(docxParagraph(raw.text));
        } else if (raw.paragraph || raw.table) {
          children.push(raw);
        }
      }
    }
  }

  return children;
}

/** Check whether a sections array is already a valid office-open AST. */
export function isOfficeOpenDocxAst(sections: unknown): boolean {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  for (const s of sections) {
    if (!s || typeof s !== "object") return false;
    const sec = s as Record<string, unknown>;
    if (Array.isArray(sec.children)) {
      for (const child of sec.children) {
        if (child && typeof child === "object") {
          const c = child as Record<string, unknown>;
          if (c.paragraph || c.table) return true;
        }
      }
    }
  }
  return false;
}

/** Compile high-level input into a beautifully styled office-open DOCX document structure. */
export function compileDocxDocument(options: DocxCompileOptions): {
  title?: string;
  sections: unknown[];
} {
  const palette = resolveColorScheme(options.colorScheme, options.colors);
  const children: unknown[] = [];

  // Add top executive title block if title is provided
  if (options.title) {
    children.push({
      paragraph: {
        spacing: { before: 0, after: 60 },
        children: [{ text: options.title, bold: true, size: 24, color: palette.primary }],
      },
    });
    if (options.subtitle) {
      children.push({
        paragraph: {
          spacing: { after: 160 },
          children: [{ text: options.subtitle, italic: true, size: 11.5, color: palette.muted }],
        },
      });
    }
    if (options.author || options.date) {
      const meta = [options.author, options.date].filter(Boolean).join("  •  ");
      children.push({
        paragraph: {
          spacing: { after: 180 },
          children: [{ text: meta, size: 9.5, color: palette.muted }],
        },
      });
    }
    // Decorative colored rule
    children.push({
      paragraph: {
        spacing: { after: 240 },
        border: { bottom: { style: "single", color: palette.secondary, size: 8, space: 4 } },
      },
    });
  }

  // 1. Markdown string
  if (typeof options.markdown === "string" && options.markdown.trim().length > 0) {
    children.push(...compileMarkdownToDocxChildren(options.markdown, palette));
  }
  // 2. String content
  else if (typeof options.content === "string" && options.content.trim().length > 0) {
    children.push(...compileMarkdownToDocxChildren(options.content, palette));
  }
  // 3. Array of blocks in content or blocks
  else if (Array.isArray(options.blocks) && options.blocks.length > 0) {
    children.push(...compileBlocksToDocxChildren(options.blocks, palette));
  } else if (Array.isArray(options.content) && options.content.length > 0) {
    children.push(...compileBlocksToDocxChildren(options.content as DocxBlock[], palette));
  }
  // 4. Custom sections passed directly
  else if (Array.isArray(options.sections) && options.sections.length > 0) {
    if (isOfficeOpenDocxAst(options.sections)) {
      return {
        title: options.title,
        sections: recolor(options.sections, {}, palette) as unknown[],
      };
    }
    // Convert loose sections into children
    for (const sec of options.sections) {
      if (typeof sec === "string") {
        children.push(...compileMarkdownToDocxChildren(sec, palette));
      } else if (sec && typeof sec === "object") {
        const s = sec as Record<string, unknown>;
        if (typeof s.title === "string") {
          children.push(docxHeading1(s.title));
        }
        if (typeof s.markdown === "string") {
          children.push(...compileMarkdownToDocxChildren(s.markdown, palette));
        } else if (typeof s.content === "string") {
          children.push(...compileMarkdownToDocxChildren(s.content, palette));
        } else if (Array.isArray(s.blocks)) {
          children.push(...compileBlocksToDocxChildren(s.blocks as DocxBlock[], palette));
        } else if (Array.isArray(s.children)) {
          children.push(...compileBlocksToDocxChildren(s.children as DocxBlock[], palette));
        }
      }
    }
  }

  // Fallback if empty
  if (children.length === 0) {
    if (!options.title) {
      children.push({
        paragraph: {
          spacing: { after: 60 },
          children: [{ text: "Document Summary", bold: true, size: 24, color: palette.primary }],
        },
      });
      children.push({
        paragraph: {
          spacing: { after: 200 },
          border: { bottom: { style: "single", color: palette.secondary, size: 8, space: 4 } },
        },
      });
    }
    children.push(
      docxParagraph("This document was generated with professional custom styling.", {
        italic: true,
      }),
    );
  }

  return {
    title: options.title,
    sections: [
      {
        ...PORTRAIT_PAGE,
        children,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// PPTX Types & Presentation Compiler
// ---------------------------------------------------------------------------

export type PptxSlideInput =
  | {
      layout?: "title" | "cover";
      title: string;
      subtitle?: string;
      eyebrow?: string;
      meta?: string;
      cover?: boolean;
    }
  | {
      layout?: "bullets" | "bullet" | "list";
      title: string;
      subtitle?: string;
      items?: string[];
      bullets?: string[];
    }
  | {
      layout?: "content" | "paragraph";
      title: string;
      subtitle?: string;
      content?: string | string[];
      text?: string;
      paragraphs?: string[];
    }
  | {
      layout?: "stats" | "metrics" | "numbers";
      title: string;
      subtitle?: string;
      stats: { value: string; label: string; sub?: string }[];
    }
  | {
      layout?: "table" | "grid";
      title: string;
      subtitle?: string;
      headers?: string[];
      rows?: (string | number)[][];
      data?: (string | number)[][];
      columnWidths?: number[];
    }
  | {
      layout?: "split" | "two_column" | "comparison";
      title: string;
      subtitle?: string;
      left: { title?: string; items?: string[]; text?: string };
      right: { title?: string; items?: string[]; text?: string };
    }
  | { layout?: "quote" | "callout"; quote: string; author?: string; title?: string }
  | { layout?: "section" | "divider"; index?: string; title: string; subtitle?: string }
  | {
      layout?: "closing" | "end" | "thank_you";
      title?: string;
      subtitle?: string;
      contact?: string;
      closing?: boolean;
    }
  | Record<string, unknown>;

export interface PptxCompileOptions {
  title?: string;
  slides?: PptxSlideInput[];
  colorScheme?: string;
  colors?: Partial<Record<ColorRole, string>>;
}

function filledRect(x: number, y: number, width: number, height: number, color: string) {
  return {
    shape: {
      x,
      y,
      width,
      height,
      geometry: "rect",
      fill: { type: "solid", color },
      outline: {},
    },
  };
}

function textShape(
  x: number,
  y: number,
  width: number,
  height: number,
  paragraphs: unknown[],
  bodyProperties: Record<string, unknown> = {},
) {
  return {
    shape: {
      x,
      y,
      width,
      height,
      geometry: "rect",
      fill: { type: "none" },
      textBody: { bodyProperties, paragraphs },
    },
  };
}

function run(text: string, opts: Record<string, unknown> = {}) {
  return { text, ...opts };
}

/** Professional slide top header block with accent strip, eyebrow, title, and subtle divider. */
function renderSlideHeader(title: string, eyebrow: string | undefined, palette: ColorScheme) {
  return [
    // Top accent strip
    filledRect(0, 0, W, 80000, palette.secondary),
    // Eyebrow if provided
    ...(eyebrow
      ? [
          textShape(MARGIN, 380000, CONTENT_W, 280000, [
            {
              children: [
                run(eyebrow.toUpperCase(), {
                  bold: true,
                  size: 11,
                  fill: { type: "solid", color: palette.secondary },
                }),
              ],
            },
          ]),
        ]
      : []),
    // Slide Title
    textShape(MARGIN, eyebrow ? 660000 : 480000, CONTENT_W, 600000, [
      {
        children: [
          run(title, {
            bold: true,
            size: 26,
            fill: { type: "solid", color: palette.primary },
          }),
        ],
      },
    ]),
    // Divider rule
    filledRect(MARGIN, 1300000, CONTENT_W, 18000, palette.border),
  ];
}

/** Build a two-column comparison card slide. */
export function twoColumnSlide(
  title: string,
  left: { title?: string; items?: string[]; text?: string },
  right: { title?: string; items?: string[]; text?: string },
  palette: ColorScheme,
) {
  const colW = (CONTENT_W - MARGIN) / 2;
  const buildColParagraphs = (col: { title?: string; items?: string[]; text?: string }) => {
    const paras: unknown[] = [];
    if (col.title) {
      paras.push({
        properties: { spaceAfter: 12 },
        children: [
          run(col.title, { bold: true, size: 18, fill: { type: "solid", color: palette.primary } }),
        ],
      });
    }
    if (col.text) {
      paras.push({
        properties: { spaceAfter: 12 },
        children: [run(col.text, { size: 14, fill: { type: "solid", color: "1E293B" } })],
      });
    }
    for (const it of col.items ?? []) {
      paras.push({
        properties: {
          bullet: { type: "char", char: "•" },
          indent: -228600,
          marginIndent: 228600,
          spaceAfter: 10,
        },
        children: [run(String(it), { size: 14, fill: { type: "solid", color: "1E293B" } })],
      });
    }
    return paras.length > 0 ? paras : [{ children: [run("")] }];
  };

  return {
    children: [
      ...renderSlideHeader(title, "COMPARISON", palette),
      // Left Card
      filledRect(MARGIN, 1500000, colW, H - 2100000, palette.surface),
      textShape(MARGIN + 250000, 1750000, colW - 500000, H - 2600000, buildColParagraphs(left)),
      // Right Card
      filledRect(MARGIN + colW + MARGIN, 1500000, colW, H - 2100000, palette.surface),
      textShape(
        MARGIN + colW + MARGIN + 250000,
        1750000,
        colW - 500000,
        H - 2600000,
        buildColParagraphs(right),
      ),
    ],
  };
}

/** Build an executive quote slide. */
export function quoteSlide(
  quote: string,
  author?: string,
  palette: ColorScheme = resolveColorScheme(),
) {
  return {
    children: [
      filledRect(0, 0, W, H, palette.surface),
      filledRect(0, 0, W, 80000, palette.secondary),
      textShape(
        MARGIN * 1.5,
        H / 2 - 1200000,
        CONTENT_W - MARGIN,
        2200000,
        [
          {
            properties: { alignment: "center" },
            children: [
              run(`“${quote}”`, {
                italic: true,
                size: 26,
                fill: { type: "solid", color: palette.primary },
              }),
            ],
          },
          ...(author
            ? [
                {
                  properties: { alignment: "center", spaceBefore: 28 },
                  children: [
                    run(`— ${author}`, {
                      bold: true,
                      size: 16,
                      fill: { type: "solid", color: palette.secondary },
                    }),
                  ],
                },
              ]
            : []),
        ],
        { anchor: "center" },
      ),
    ],
  };
}

/** Check if a slide object is already an office-open slide with shapes. */
export function isOfficeOpenPptxSlide(slide: unknown): boolean {
  if (!slide || typeof slide !== "object") return false;
  const s = slide as Record<string, unknown>;
  if (Array.isArray(s.children) && s.children.length > 0) {
    for (const child of s.children) {
      if (child && typeof child === "object") {
        const c = child as Record<string, unknown>;
        if (c.shape || c.table) return true;
      }
    }
  }
  return false;
}

/** Compile high-level slide input into an office-open PPTX slide object. */
export function compileSlideToPptx(slide: PptxSlideInput, palette: ColorScheme): unknown {
  if (isOfficeOpenPptxSlide(slide)) {
    return recolor(slide, {}, palette);
  }

  const s = slide as Record<string, unknown>;
  const layout = (s.layout as string) ?? (s.cover ? "title" : s.closing ? "closing" : undefined);
  const title = String(s.title ?? s.heading ?? "");
  const subtitle = String(s.subtitle ?? s.desc ?? "");

  // 1. Cover / Title Slide
  if (layout === "title" || layout === "cover" || s.cover) {
    const eyebrow = String(s.eyebrow ?? s.category ?? "EXECUTIVE BRIEF");
    const meta = String(s.meta ?? s.author ?? s.date ?? "Octopus Studio  •  Confidential");
    return {
      children: [
        // Dark primary hero background
        filledRect(0, 0, W, H, palette.primary),
        // Eyebrow badge pill
        filledRect(MARGIN, 1500000, 2400000, 380000, palette.secondary),
        textShape(
          MARGIN,
          1500000,
          2400000,
          380000,
          [
            {
              properties: { alignment: "center" },
              children: [
                run(eyebrow.toUpperCase(), {
                  bold: true,
                  size: 11,
                  fill: { type: "solid", color: "FFFFFF" },
                }),
              ],
            },
          ],
          { anchor: "center" },
        ),
        // Hero Title
        textShape(MARGIN, 2150000, CONTENT_W, 1600000, [
          {
            children: [
              run(title || "Presentation Title", {
                bold: true,
                size: 38,
                fill: { type: "solid", color: palette.primaryText },
              }),
            ],
          },
        ]),
        // Subtitle
        ...(subtitle
          ? [
              textShape(MARGIN, 3850000, CONTENT_W, 600000, [
                {
                  children: [run(subtitle, { size: 17, fill: { type: "solid", color: "94A3B8" } })],
                },
              ]),
            ]
          : []),
        // Bottom metadata
        textShape(MARGIN, H - 850000, CONTENT_W, 350000, [
          { children: [run(meta, { size: 11.5, fill: { type: "solid", color: "64748B" } })] },
        ]),
      ],
    };
  }

  // 2. Stats / Key Metrics Slide
  if (
    layout === "stats" ||
    layout === "metrics" ||
    layout === "numbers" ||
    Array.isArray(s.stats)
  ) {
    const stats = (s.stats as { value: string; label: string; sub?: string }[]) ?? [];
    const validStats = stats.length > 0 ? stats : [{ value: "100%", label: "Key Metric" }];
    const gap = 350000;
    const boxW = Math.floor((CONTENT_W - gap * (validStats.length - 1)) / validStats.length);
    return {
      children: [
        ...renderSlideHeader(title || "Key Metrics & Impact", "PERFORMANCE", palette),
        ...validStats.map((st, i) => ({
          shape: {
            x: MARGIN + i * (boxW + gap),
            y: 1650000,
            width: boxW,
            height: 2800000,
            geometry: "rect",
            fill: { type: "solid", color: palette.surface },
            outline: { color: palette.border, width: 15000 },
            textBody: {
              bodyProperties: { anchor: "center" },
              paragraphs: [
                {
                  properties: { alignment: "center" },
                  children: [
                    run(st.value, {
                      bold: true,
                      size: 40,
                      fill: { type: "solid", color: palette.primary },
                    }),
                  ],
                },
                {
                  properties: { alignment: "center", spaceBefore: 12 },
                  children: [
                    run(st.label.toUpperCase(), {
                      bold: true,
                      size: 11.5,
                      fill: { type: "solid", color: palette.muted },
                    }),
                  ],
                },
              ],
            },
          },
        })),
      ],
    };
  }

  // 3. Table Slide
  if (
    layout === "table" ||
    layout === "grid" ||
    Array.isArray(s.headers) ||
    Array.isArray(s.data)
  ) {
    const headers = ((s.headers as string[]) ??
      (Array.isArray(s.data) ? (s.data as unknown[][])[0] : [])) as string[];
    const rawRows = ((s.rows as unknown[][]) ??
      (Array.isArray(s.data) ? (s.data as unknown[][]).slice(1) : [])) as (string | number)[][];
    const stringRows = rawRows.map((r) => r.map((c) => String(c ?? "")));
    const colCount = Math.max(headers.length, 1);
    const colWidth = Math.floor(CONTENT_W / colCount);
    const columnWidths = (s.columnWidths as number[]) ?? Array(colCount).fill(colWidth);

    return {
      children: [
        ...renderSlideHeader(title || "Data Overview", "SUMMARY", palette),
        {
          table: {
            x: MARGIN,
            y: 1550000,
            width: CONTENT_W,
            height: H - 2200000,
            columnWidths,
            rows: [
              {
                cells: headers.map((text) => ({
                  text: String(text),
                  fill: { type: "solid", color: palette.primary },
                })),
              },
              ...stringRows.map((cells) => ({ cells: cells.map((text) => ({ text })) })),
            ],
          },
        },
      ],
    };
  }

  // 4. Two Column / Split Slide
  if (
    layout === "split" ||
    layout === "two_column" ||
    layout === "comparison" ||
    (s.left && s.right)
  ) {
    const left = (s.left as { title?: string; items?: string[]; text?: string }) ?? {};
    const right = (s.right as { title?: string; items?: string[]; text?: string }) ?? {};
    return twoColumnSlide(title || "Strategy Comparison", left, right, palette);
  }

  // 5. Quote Slide
  if (layout === "quote" || layout === "callout" || typeof s.quote === "string") {
    const quote = String(s.quote ?? title);
    const author = String(s.author ?? subtitle ?? "");
    return quoteSlide(quote, author, palette);
  }

  // 6. Section Divider Slide
  if (layout === "section" || layout === "divider") {
    const index = String(s.index ?? "01");
    return {
      children: [
        filledRect(0, 0, W, H, palette.surface),
        filledRect(0, 0, W, 80000, palette.secondary),
        textShape(MARGIN, 1600000, CONTENT_W, 1200000, [
          {
            children: [
              run(index, {
                bold: true,
                size: 52,
                fill: { type: "solid", color: palette.secondary },
              }),
            ],
          },
        ]),
        textShape(MARGIN, 3000000, CONTENT_W, 1000000, [
          {
            children: [
              run(title, { bold: true, size: 34, fill: { type: "solid", color: palette.primary } }),
            ],
          },
        ]),
        ...(subtitle
          ? [
              textShape(MARGIN, 4200000, CONTENT_W, 600000, [
                {
                  children: [
                    run(subtitle, { size: 16, fill: { type: "solid", color: palette.muted } }),
                  ],
                },
              ]),
            ]
          : []),
      ],
    };
  }

  // 7. Closing Slide
  if (layout === "closing" || layout === "end" || layout === "thank_you" || s.closing) {
    return {
      children: [
        filledRect(0, 0, W, H, palette.primary),
        textShape(
          MARGIN,
          H / 2 - 600000,
          CONTENT_W,
          800000,
          [
            {
              properties: { alignment: "center" },
              children: [
                run(title || "Thank You", {
                  bold: true,
                  size: 38,
                  fill: { type: "solid", color: palette.primaryText },
                }),
              ],
            },
          ],
          { anchor: "center" },
        ),
        textShape(
          MARGIN,
          H / 2 + 250000,
          CONTENT_W,
          500000,
          [
            {
              properties: { alignment: "center" },
              children: [
                run(subtitle || (s.contact as string) || "Questions & Discussion", {
                  size: 17,
                  fill: { type: "solid", color: "D6E0EA" },
                }),
              ],
            },
          ],
          { anchor: "center" },
        ),
      ],
    };
  }

  // 8. Bullet / List Slide
  const items: string[] = [];
  if (Array.isArray(s.items)) items.push(...s.items.map(String));
  if (Array.isArray(s.bullets)) items.push(...s.bullets.map(String));
  if (Array.isArray(s.paragraphs)) items.push(...s.paragraphs.map(String));
  if (typeof s.content === "string") items.push(s.content);
  if (typeof s.text === "string") items.push(s.text);
  if (items.length === 0 && subtitle) items.push(subtitle);
  if (items.length === 0) items.push("Strategic discussion point");

  return {
    children: [
      ...renderSlideHeader(title || "Overview", "TOPIC", palette),
      textShape(
        MARGIN,
        1550000,
        CONTENT_W,
        H - 2100000,
        items.map((text) => {
          // Check for bold lead-in pattern like "Title: Description" or "**Title**: Description"
          const cleanText = text.replace(/^\*\*|\*\*$/g, "");
          const colonMatch = cleanText.match(/^([^:]+):\s*(.+)$/);
          if (colonMatch) {
            return {
              properties: {
                bullet: { type: "char", char: "•" },
                indent: -228600,
                marginIndent: 228600,
                spaceAfter: 14,
                spaceBefore: 6,
              },
              children: [
                run(`${colonMatch[1]}: `, {
                  bold: true,
                  size: 15.5,
                  fill: { type: "solid", color: palette.primary },
                }),
                run(colonMatch[2], { size: 14.5, fill: { type: "solid", color: "1E293B" } }),
              ],
            };
          }
          return {
            properties: {
              bullet: { type: "char", char: "•" },
              indent: -228600,
              marginIndent: 228600,
              spaceAfter: 14,
              spaceBefore: 6,
            },
            children: [run(cleanText, { size: 15, fill: { type: "solid", color: "1E293B" } })],
          };
        }),
      ),
    ],
  };
}

/** Compile a complete, high-quality presentation deck from slide inputs. */
export function compilePptxPresentation(options: PptxCompileOptions): {
  title?: string;
  size: { width: number; height: number };
  slides: unknown[];
} {
  const palette = resolveColorScheme(options.colorScheme, options.colors);
  const slideInputs = options.slides && options.slides.length > 0 ? options.slides : [];

  let slides: unknown[];

  if (slideInputs.length === 0) {
    slides = [
      titleSlide(
        "STRATEGY",
        options.title ?? "Executive Presentation",
        "Strategic Architecture & System Overview",
        "Octopus Studio",
      ),
      bulletSlide("Key Objectives", [
        "Core Capabilities: High reliability and zero blank documents",
        "Visual Polish: Executive color palettes and balanced typography",
        "Extensibility: Declarative schemas for slides, docs, and spreadsheets",
      ]),
      statSlide("Impact Highlights", [
        { value: "100%", label: "Reliability" },
        { value: "4.5x", label: "Speed Improvement" },
        { value: "Zero", label: "License Cost" },
      ]),
      closingSlide("Thank You", "Questions & Discussion"),
    ];
  } else {
    slides = slideInputs.map((s) => compileSlideToPptx(s, palette));
  }

  return {
    title: options.title,
    size: { width: W, height: H },
    slides,
  };
}

// ---------------------------------------------------------------------------
// XLSX Types & Spreadsheet Compiler
// ---------------------------------------------------------------------------

export interface SheetInput {
  name?: string;
  title?: string;
  subtitle?: string;
  headers?: string[];
  rows?: (string | number | boolean | null)[][];
  data?: (string | number | boolean | null)[][];
  records?: Record<string, unknown>[];
  csv?: string;
  totals?: boolean | number[];
  colWidths?: number[];
}

export interface XlsxCompileOptions {
  title?: string;
  sheets?: SheetInput[];
  worksheets?: SheetInput[];
  csv?: string;
  records?: Record<string, unknown>[];
  data?: (string | number | boolean | null)[][];
  colorScheme?: string;
  colors?: Partial<Record<ColorRole, string>>;
}

/** Parse CSV text into 2D array of string cells. */
export function parseCsvText(csvText: string): string[][] {
  const lines = csvText.trim().split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let inQuote = false;
    let curr = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(curr.trim().replace(/^"|"$/g, ""));
        curr = "";
      } else {
        curr += ch;
      }
    }
    cells.push(curr.trim().replace(/^"|"$/g, ""));
    rows.push(cells);
  }
  return rows;
}

/** Convert a cell value to formatted office-open cell object with typed number formats. */
function formatXlsxCellValue(
  val: string | number | boolean | null,
  palette: ColorScheme,
): { value: string | number | boolean | null; style?: Record<string, unknown> } {
  const baseStyle = {
    font: { size: 10, color: "1E293B" },
    border: { bottom: { style: "thin", color: palette.border } },
    alignment: { vertical: "center" },
  };
  if (val == null) return { value: "", style: baseStyle };

  if (typeof val === "number") {
    return {
      value: val,
      style: {
        ...baseStyle,
        numFmt: NUM_NUMBER,
        alignment: { vertical: "center", horizontal: "right" },
      },
    };
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    // Currency format ($1,234.50 or $1234)
    if (/^\$[\d,]+(\.\d{2})?$/.test(trimmed)) {
      const num = parseFloat(trimmed.replace(/[$,]/g, ""));
      if (!isNaN(num)) {
        return {
          value: num,
          style: {
            ...baseStyle,
            numFmt: NUM_CURRENCY,
            alignment: { vertical: "center", horizontal: "right" },
          },
        };
      }
    }
    // Percentage format (25.5% or 100%)
    if (/^[\d.]+%$/.test(trimmed)) {
      const num = parseFloat(trimmed.replace(/%/g, "")) / 100;
      if (!isNaN(num)) {
        return {
          value: num,
          style: {
            ...baseStyle,
            numFmt: NUM_PERCENT,
            alignment: { vertical: "center", horizontal: "right" },
          },
        };
      }
    }
    // Pure integer or float string ("12345")
    if (/^-?\d+(\.\d+)?$/.test(trimmed) && trimmed.length < 12) {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        return {
          value: num,
          style: {
            ...baseStyle,
            numFmt: NUM_NUMBER,
            alignment: { vertical: "center", horizontal: "right" },
          },
        };
      }
    }
  }

  return { value: val, style: baseStyle };
}

/** Check if a worksheet is already in raw office-open format. */
export function isOfficeOpenWorksheet(sheet: unknown): boolean {
  if (!sheet || typeof sheet !== "object") return false;
  const s = sheet as Record<string, unknown>;
  return (
    Array.isArray(s.rows) &&
    s.rows.length > 0 &&
    Array.isArray((s.rows[0] as Record<string, unknown>)?.cells)
  );
}

/** Compile a single sheet input into an executive-grade office-open Worksheet. */
export function compileSheetToXlsx(
  sheet: SheetInput,
  sheetIndex: number,
  palette: ColorScheme,
): unknown {
  if (isOfficeOpenWorksheet(sheet)) {
    return recolor(sheet, {}, palette);
  }

  const name = sheet.name || `Sheet${sheetIndex + 1}`;
  let headers: string[] = sheet.headers ?? [];
  let rows: (string | number | boolean | null)[][] = sheet.rows ?? [];

  // 1. From CSV
  if (typeof sheet.csv === "string" && sheet.csv.trim().length > 0) {
    const csvData = parseCsvText(sheet.csv);
    if (csvData.length > 0) {
      headers = csvData[0];
      rows = csvData.slice(1);
    }
  }
  // 2. From Records
  else if (Array.isArray(sheet.records) && sheet.records.length > 0) {
    headers = Object.keys(sheet.records[0]);
    rows = sheet.records.map((r) =>
      headers.map((h) => (r[h] as string | number | boolean | null) ?? ""),
    );
  }
  // 3. From 2D Data Array
  else if (Array.isArray(sheet.data) && sheet.data.length > 0) {
    headers = sheet.data[0].map(String);
    rows = sheet.data.slice(1);
  }

  if (headers.length === 0 && rows.length > 0) {
    headers = rows[0].map((_, i) => `Col ${i + 1}`);
    rows = rows.slice(1);
  }

  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);

  // Auto-calculate column widths with generous padding
  const maxLenPerCol = Array(colCount).fill(12);
  for (let c = 0; c < colCount; c++) {
    const headerLen = String(headers[c] ?? "").length;
    if (headerLen > maxLenPerCol[c]) maxLenPerCol[c] = headerLen;
  }
  for (const r of rows) {
    for (let c = 0; c < colCount; c++) {
      const cellLen = String(r[c] ?? "").length;
      if (cellLen > maxLenPerCol[c]) maxLenPerCol[c] = cellLen;
    }
  }
  const calculatedWidths = maxLenPerCol.map((l) => Math.min(Math.max(l + 5, 14), 45));
  const widths =
    sheet.colWidths && sheet.colWidths.length === colCount ? sheet.colWidths : calculatedWidths;

  const worksheetRows: unknown[] = [];

  // Title / Subtitle block
  let startRowIdx = 1;
  if (sheet.title) {
    worksheetRows.push(
      xlsxRow([xlsxCell(sheet.title, { font: { bold: true, color: palette.primary, size: 15 } })]),
    );
    startRowIdx++;
    if (sheet.subtitle) {
      worksheetRows.push(
        xlsxRow([
          xlsxCell(sheet.subtitle, { font: { color: palette.muted, italic: true, size: 10 } }),
        ]),
      );
      startRowIdx++;
    }
    worksheetRows.push(xlsxRow([xlsxCell("")]));
    startRowIdx++;
  }

  // Header Row
  const customHeaderStyle = {
    font: { bold: true, color: palette.primaryText, size: 10.5 },
    fill: { type: "solid", color: palette.primary },
    alignment: { vertical: "center" },
  };
  worksheetRows.push(xlsxRow(headers.map((h) => xlsxCell(h, customHeaderStyle))));
  const dataStartRow = startRowIdx + 1;

  // Data Rows
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx];
    const isEven = rIdx % 2 === 1;
    const rowBg = isEven ? palette.surface : undefined;
    const cells = Array.from({ length: colCount }).map((_, c) => {
      const cellData = formatXlsxCellValue(r[c] ?? null, palette);
      const style = rowBg
        ? { ...cellData.style, fill: { type: "solid", color: rowBg } }
        : cellData.style;
      return xlsxCell(cellData.value, style);
    });
    worksheetRows.push(xlsxRow(cells));
  }
  const dataEndRow = dataStartRow + rows.length - 1;

  // Total Row
  if (sheet.totals && rows.length > 0) {
    const customTotalStyle = {
      font: { bold: true, color: palette.primary, size: 10.5 },
      fill: { type: "solid", color: palette.surface },
      border: {
        top: { style: "thin", color: palette.border },
        bottom: { style: "double", color: palette.border },
      },
      alignment: { vertical: "center" },
    };
    const totalCells: unknown[] = [];
    for (let c = 0; c < colCount; c++) {
      if (c === 0) {
        totalCells.push(xlsxCell("Total", customTotalStyle));
      } else {
        const isNumeric = rows.some((r) => {
          const v = r[c];
          return (
            typeof v === "number" || (typeof v === "string" && /^\$?[\d,.]+%?$/.test(v.trim()))
          );
        });
        if (isNumeric) {
          const colLetterStr = String.fromCharCode(65 + c);
          totalCells.push({
            formula: `SUM(${colLetterStr}${dataStartRow}:${colLetterStr}${dataEndRow})`,
            style: {
              ...customTotalStyle,
              numFmt: NUM_NUMBER,
              alignment: { vertical: "center", horizontal: "right" },
            },
          });
        } else {
          totalCells.push(xlsxCell("", customTotalStyle));
        }
      }
    }
    worksheetRows.push(xlsxRow(totalCells));
  }

  return {
    name,
    cols: xlsxCols(widths),
    rows: worksheetRows,
  };
}

/** Compile full XLSX workbook from high-level options. */
export function compileXlsxWorkbook(options: XlsxCompileOptions): {
  worksheets: unknown[];
} {
  const palette = resolveColorScheme(options.colorScheme, options.colors);
  const sheetList = options.sheets ?? options.worksheets ?? [];

  if (sheetList.length > 0) {
    return {
      worksheets: sheetList.map((s, idx) => compileSheetToXlsx(s, idx, palette)),
    };
  }

  // Direct CSV at root
  if (typeof options.csv === "string" && options.csv.trim().length > 0) {
    return {
      worksheets: [
        compileSheetToXlsx(
          { name: options.title || "Data", csv: options.csv, title: options.title },
          0,
          palette,
        ),
      ],
    };
  }

  // Direct Records at root
  if (Array.isArray(options.records) && options.records.length > 0) {
    return {
      worksheets: [
        compileSheetToXlsx(
          { name: options.title || "Sheet1", records: options.records, title: options.title },
          0,
          palette,
        ),
      ],
    };
  }

  // Direct 2D Data array at root
  if (Array.isArray(options.data) && options.data.length > 0) {
    return {
      worksheets: [
        compileSheetToXlsx(
          { name: options.title || "Sheet1", data: options.data, title: options.title },
          0,
          palette,
        ),
      ],
    };
  }

  // Default starter worksheet
  return {
    worksheets: [
      compileSheetToXlsx(
        {
          name: "Summary",
          title: options.title || "Financial Summary",
          headers: ["Item", "Category", "Quantity", "Unit Price", "Total"],
          rows: [
            ["Item A", "Operations", 10, "$25.00", "$250.00"],
            ["Item B", "Services", 5, "$100.00", "$500.00"],
            ["Item C", "Supplies", 2, "$50.00", "$100.00"],
          ],
          totals: true,
        },
        0,
        palette,
      ),
    ],
  };
}
