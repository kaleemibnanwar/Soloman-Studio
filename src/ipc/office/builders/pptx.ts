/**
 * Shared office-open PPTX slide builders. Construct the SlideOptions JSON
 * shape (absolutely-positioned shapes/tables in EMU) so a deck reads as a
 * compact sequence of `titleSlide(...)`, `bulletSlide(...)`, etc. calls. Brand
 * colors use the "slate" scheme's hex values, registered in
 * office_template_roles.ts so `recolor` can swap them. Text uses the
 * `[Placeholder]` convention consumed by `applyPlaceholders`.
 */

export const PPTX_PALETTE = {
  primary: "0B2545",
  primaryText: "FFFFFF",
  secondary: "3E7CB1",
  surface: "F2F4F7",
  muted: "5B6570",
  border: "C7CDD3",
} as const;

const { primary, primaryText, secondary, surface, muted } = PPTX_PALETTE;

/** Standard 16:9 slide, in EMU (914400/in). */
export const W = 12192000;
export const H = 6858000;
export const MARGIN = 685800; // 0.75in
export const CONTENT_W = W - MARGIN * 2;

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

function topBar() {
  return filledRect(0, 0, W, 130000, primary);
}

function slideTitle(title: string) {
  return textShape(MARGIN, 500000, CONTENT_W, 700000, [
    { children: [run(title, { bold: true, size: 28, fill: { type: "solid", color: primary } })] },
  ]);
}

/** Branded cover slide. */
export function titleSlide(eyebrow: string, title: string, subtitle: string, meta: string) {
  return {
    children: [
      filledRect(0, 0, W, H, primary),
      textShape(MARGIN, H / 2 - 900000, CONTENT_W, 400000, [
        {
          children: [
            run(eyebrow, { bold: true, size: 12, fill: { type: "solid", color: secondary } }),
          ],
        },
      ]),
      textShape(MARGIN, H / 2 - 500000, CONTENT_W, 900000, [
        {
          children: [
            run(title, { bold: true, size: 40, fill: { type: "solid", color: primaryText } }),
          ],
        },
      ]),
      textShape(MARGIN, H / 2 + 500000, CONTENT_W, 500000, [
        { children: [run(subtitle, { size: 16, fill: { type: "solid", color: "D6E0EA" } })] },
      ]),
      textShape(MARGIN, H - 900000, CONTENT_W, 300000, [
        { children: [run(meta, { size: 11, fill: { type: "solid", color: "9DB3C4" } })] },
      ]),
    ],
  };
}

/** Content slide with a title and bullet points. */
export function bulletSlide(title: string, items: string[]) {
  return {
    children: [
      topBar(),
      slideTitle(title),
      textShape(
        MARGIN,
        1500000,
        CONTENT_W,
        H - 2000000,
        items.map((text) => ({
          properties: {
            bullet: { type: "char", char: "•" },
            indent: -228600,
            marginIndent: 228600,
            spaceAfter: 12,
          },
          children: [run(text, { size: 16, fill: { type: "solid", color: "2B2B2B" } })],
        })),
      ),
    ],
  };
}

/** Content slide with big stat cards. */
export function statSlide(title: string, stats: { value: string; label: string }[]) {
  const boxW = (CONTENT_W - MARGIN * (stats.length - 1)) / stats.length;
  return {
    children: [
      topBar(),
      slideTitle(title),
      ...stats.map((s, i) => ({
        shape: {
          x: MARGIN + i * (boxW + MARGIN),
          y: 2000000,
          width: boxW,
          height: 1900000,
          geometry: "rect",
          fill: { type: "solid", color: surface },
          outline: {},
          textBody: {
            bodyProperties: { anchor: "center" },
            paragraphs: [
              {
                properties: { alignment: "center" },
                children: [
                  run(s.value, { bold: true, size: 32, fill: { type: "solid", color: primary } }),
                ],
              },
              {
                properties: { alignment: "center" },
                children: [run(s.label, { size: 12, fill: { type: "solid", color: muted } })],
              },
            ],
          },
        },
      })),
    ],
  };
}

/** Content slide with a table. */
export function tableSlide(
  title: string,
  columnWidths: number[],
  header: string[],
  rows: string[][],
) {
  return {
    children: [
      topBar(),
      slideTitle(title),
      {
        table: {
          x: MARGIN,
          y: 1600000,
          width: CONTENT_W,
          height: H - 2200000,
          columnWidths,
          rows: [
            { cells: header.map((text) => ({ text, fill: { type: "solid", color: primary } })) },
            ...rows.map((cells) => ({ cells: cells.map((text) => ({ text })) })),
          ],
        },
      },
    ],
  };
}

/** Branded closing slide. */
export function closingSlide(title: string, subtitle: string) {
  return {
    children: [
      filledRect(0, 0, W, H, primary),
      textShape(
        MARGIN,
        H / 2 - 500000,
        CONTENT_W,
        800000,
        [
          {
            properties: { alignment: "center" },
            children: [
              run(title, { bold: true, size: 36, fill: { type: "solid", color: primaryText } }),
            ],
          },
        ],
        { anchor: "center" },
      ),
      textShape(
        MARGIN,
        H / 2 + 300000,
        CONTENT_W,
        500000,
        [
          {
            properties: { alignment: "center" },
            children: [run(subtitle, { size: 16, fill: { type: "solid", color: "D6E0EA" } })],
          },
        ],
        { anchor: "center" },
      ),
    ],
  };
}

/** Section divider slide (big number/letter + title). */
export function sectionSlide(index: string, title: string, subtitle: string) {
  return {
    children: [
      filledRect(0, 0, W, H, surface),
      textShape(MARGIN, 1600000, CONTENT_W, 1200000, [
        {
          children: [
            run(index, { bold: true, size: 48, fill: { type: "solid", color: secondary } }),
          ],
        },
      ]),
      textShape(MARGIN, 3000000, CONTENT_W, 1000000, [
        {
          children: [run(title, { bold: true, size: 32, fill: { type: "solid", color: primary } })],
        },
      ]),
      textShape(MARGIN, 4100000, CONTENT_W, 600000, [
        { children: [run(subtitle, { size: 16, fill: { type: "solid", color: muted } })] },
      ]),
    ],
  };
}
