/**
 * Shared office-open DOCX builder helpers. These small functions construct the
 * SectionOptions / ParagraphOptions / TableOptions JSON shape so templates read
 * as a compact description of a document rather than a wall of nested objects.
 * Brand colors use the "slate" scheme's hex values (registered in
 * office_template_roles.ts) so `recolor` can swap them for any other scheme.
 *
 * All text fields follow the `[Placeholder]` convention consumed by
 * `applyPlaceholders` in tools.ts.
 */

export const DOCX_PALETTE = {
  primary: "0B2545",
  primaryText: "FFFFFF",
  surface: "F2F4F7",
  muted: "5B6570",
  border: "C7CDD3",
} as const;

const { primary, primaryText, surface, muted, border } = DOCX_PALETTE;

export const PORTRAIT_PAGE = {
  pageSize: { width: 12240, height: 15840, orientation: "portrait" },
  pageMargin: {
    top: 900,
    right: 1080,
    bottom: 900,
    left: 1080,
    header: 708,
    footer: 708,
    gutter: 0,
  },
  grid: { linePitch: 360 },
} as const;

/** Branded heading (Heading1) with a colored rule feel. */
export function h1(text: string) {
  return {
    paragraph: {
      heading: "Heading1",
      spacing: { after: 100 },
      children: [{ text, bold: true, color: primary }],
    },
  };
}

/** Body paragraph. `opts` are applied to the run (e.g. { bold: true, size: 11 }). */
export function p(text: string, opts: Record<string, unknown> = {}) {
  return { paragraph: { spacing: { after: 160 }, children: [{ text, size: 10.5, ...opts }] } };
}

/** Bulleted list item. */
export function bullet(text: string, ref = "list_1") {
  return {
    paragraph: {
      style: "ListParagraph",
      spacing: { after: 60 },
      numbering: { reference: ref, level: 0, autoStyle: false },
      children: [{ text, size: 10.5 }],
    },
  };
}

/** Horizontal rule (bottom border on an empty paragraph). */
export function rule() {
  return {
    paragraph: {
      spacing: { after: 200 },
      border: { bottom: { style: "single", color: primary, size: 6, space: 4 } },
    },
  };
}

/** Vertical whitespace. */
export function spacer(after = 160) {
  return { paragraph: { spacing: { after } } };
}

const CELL_MARGINS = {
  top: { size: 80, type: "twips" },
  left: { size: 120, type: "twips" },
  bottom: { size: 80, type: "twips" },
  right: { size: 120, type: "twips" },
} as const;

export function headerCell(text: string, width: number) {
  return {
    width: { size: width, type: "twips" },
    shading: { fill: primary, color: "auto", type: "clear" },
    margins: CELL_MARGINS,
    children: [{ paragraph: { children: [{ text, bold: true, color: primaryText, size: 9 }] } }],
  };
}

export function subHeaderCell(text: string, width: number) {
  return {
    width: { size: width, type: "twips" },
    shading: { fill: surface, color: "auto", type: "clear" },
    margins: CELL_MARGINS,
    children: [
      {
        paragraph: {
          children: [{ text, bold: true, color: primary, size: 8, characterSpacing: 8 }],
        },
      },
    ],
  };
}

export function dataCell(text: string, width: number, opts: Record<string, unknown> = {}) {
  return {
    width: { size: width, type: "twips" },
    margins: CELL_MARGINS,
    children: [{ paragraph: { children: [{ text, size: 9, ...opts }] } }],
  };
}

/** Multi-line cell: each string becomes its own paragraph. */
export function dataCellLines(lines: string[], width: number, opts: Record<string, unknown> = {}) {
  return {
    width: { size: width, type: "twips" },
    margins: CELL_MARGINS,
    children: lines.map((text) => ({
      paragraph: { spacing: { after: 20 }, children: [{ text, size: 9, ...opts }] },
    })),
  };
}

/** A full-width bordered table. `columnWidths` are in twips. */
export function table(columnWidths: number[], rows: unknown[][]) {
  return {
    table: {
      width: { size: columnWidths.reduce((a, b) => a + b, 0), type: "twips" },
      borders: {
        top: { style: "single", color: border, size: 4 },
        left: { style: "single", color: border, size: 4 },
        bottom: { style: "single", color: border, size: 4 },
        right: { style: "single", color: border, size: 4 },
        insideHorizontal: { style: "single", color: border, size: 4 },
        insideVertical: { style: "single", color: border, size: 4 },
      },
      columnWidths,
      rows: rows.map((cells) => ({ cells })),
    },
  };
}

/** A small brand footer with company + contact info. */
export function brandFooter(companyPlaceholder: string, contactPlaceholder: string) {
  return {
    default: [
      {
        paragraph: {
          alignment: "center",
          children: [
            { text: `${companyPlaceholder}  •  ${contactPlaceholder}`, color: muted, size: 8 },
          ],
        },
      },
    ],
    partNames: { default: "footer1.xml" },
  };
}

/** A small brand header with right-aligned company name. */
export function brandHeader(companyPlaceholder: string) {
  return {
    default: [
      {
        paragraph: {
          alignment: "right",
          children: [{ text: companyPlaceholder, color: muted, size: 8 }],
        },
      },
    ],
    partNames: { default: "header1.xml" },
  };
}

/** A document title block (large brand title + optional muted subtitle). */
export function titleBlock(title: string, subtitle?: string) {
  const children: unknown[] = [
    {
      paragraph: {
        spacing: { after: 40 },
        children: [{ text: title, bold: true, color: primary, size: 24 }],
      },
    },
  ];
  if (subtitle) children.push(p(subtitle, { color: muted, italic: true, size: 11 }));
  children.push(rule());
  return children;
}
