---
name: document-visual-design
description: Universal visual design principles, color theory, typography pairings, layout hierarchies, and inspection workflows for creating top-notch executive documents across DOCX, PPTX, XLSX, and PDF.
---

# Universal Document Visual Design System

Approach every document—whether a slide deck, financial workbook, multi-page report, or one-page memo—as a bespoke product designed for executive eyes. Default, unformatted output (raw standard tables, unstyled Calibri grids, generic bullet lists) looks amateur and AI-generated. High-craft output is code-driven, intentionally structured, typographically disciplined, and visually striking.

---

## 1. Core Visual Principles

1. **Hierarchy Is Non-Negotiable**:
   - The reader's eye should know instantly where to look first, second, and third.
   - Use size, weight, color contrast, and spatial separation—never rely on bolding alone.
   - Every section must start with a distinct header level or title block.

2. **Curated & Restricted Color Palettes**:
   - Limit every document to **3–5 purposeful colors**:
     - **Primary Brand / Anchor**: Deep tone used for main titles, primary table headers, major accents.
     - **Secondary / Supporting**: Harmonious hue used for sub-headers, secondary metrics, borders.
     - **Accent / Highlight**: Used sparingly (< 5% of visual area) for callouts, positive trends, or focus points.
     - **Neutral Dark (Text)**: Off-black / deep slate for crisp readability (`#1E293B`, `#0F172A`, `#18181B`). Never pure `#000000` on white.
     - **Neutral Light (Surface/Card)**: Off-white / light slate tint for card backgrounds, zebra rows, and callouts (`#F8FAFC`, `#F1F5F9`, `#FAF8F5`).

3. **Whitespace as Design Material**:
   - Generous, intentional padding around text cards, table cells, and margins creates elegance.
   - Never cram elements to the absolute edge. Set strict outer margins (at least 0.8"–1.0" for slides, 0.75"–1.0" for Word/PDF, and 2-row/2-col buffers for Excel).

4. **Information Chunking**:
   - Break walls of text into **modular cards, callout containers, metric blocks, or 2/3-column comparison grids**.
   - Bullet points must be concise and actionable, preceded by bold mini-headers (e.g., `**Market Penetration**: Expanded enterprise footprint by 34%`).

5. **Eliminate the "AI Template" Look**:
   - Avoid generic placeholder icons inside decorative circles.
   - Avoid generic 01/02/03 step numbers unless conveying a strict chronological sequence.
   - Avoid default bright blue hyper-saturated charts.

---

## 2. Curated Color Palettes

Choose one distinct theme based on the document's domain:

| Theme Name                        | Primary Anchor              | Secondary Accent            | Highlight / Alert       | Dark Text | Light Surface    |
| :-------------------------------- | :-------------------------- | :-------------------------- | :---------------------- | :-------- | :--------------- |
| **Modern Tech / B2B SaaS**        | `#0F172A` (Slate Navy)      | `#4F46E5` (Indigo)          | `#0EA5E9` (Sky Cyan)    | `#1E293B` | `#F8FAFC`        |
| **Executive Wealth / Consulting** | `#18181B` (Charcoal)        | `#064E3B` (Deep Forest)     | `#D97706` (Amber Ochre) | `#27272A` | `#FAF8F5`        |
| **Clean Healthcare / Bio**        | `#0C4A6E` (Deep Teal)       | `#0284C7` (Cobalt)          | `#10B981` (Emerald)     | `#0F172A` | `#F0FDF4`        |
| **Modern Editorial / Creative**   | `#1C1917` (Deep Ink)        | `#C2410C` (Rust Terracotta) | `#CA8A04` (Warm Gold)   | `#292524` | `#FFFBEB`        |
| **Sleek Dark Mode (Decks)**       | `#090A0F` (Obsidian Canvas) | `#8B5CF6` (Electric Violet) | `#06B6D4` (Neon Cyan)   | `#F8FAFC` | `#1E2235` (Card) |

---

## 3. Typography Pairings & Hierarchy Scale

Select one font pairing and maintain strict scale consistency throughout the entire document:

### Recommended Font Combinations

- **Modern Clean (Standard cross-platform)**: Aptos / Aptos Display, Calibri / Calibri Light, Arial / Arial Bold, Segoe UI / Segoe UI Semibold.
- **Editorial / Executive**: Georgia (Headings) + Calibri or Helvetica (Body), Garamond (Headings) + Arial (Body).
- **Technical / Data-Dense**: Trebuchet MS (Headings) + Segoe UI / Arial (Data/Body), Consolas / Courier New (Code snippets).

### Type Scale Reference

- **Title / Hero Banner**: 24pt – 36pt (Bold / Heavy)
- **Heading 1 (H1)**: 18pt – 22pt (Bold, Primary Color)
- **Heading 2 (H2)**: 14pt – 16pt (Semi-bold / Bold, Secondary Color)
- **Heading 3 (H3) / Card Header**: 12pt – 13pt (Semi-bold, Dark Neutral)
- **Body Text**: 10pt – 11.5pt (Regular, Line spacing: 1.15x – 1.25x, `#1E293B`)
- **Captions / Eyebrows / Metadata**: 8.5pt – 9.5pt (Uppercase, tracked, Muted Slate `#64748B`)
- **Metric / KPI Big Numbers**: 28pt – 48pt (Bold / Extra Bold, Primary or Highlight Color)

---

## 4. Key Structural Layout Components

### A. Title & Header Blocks

- Include a crisp top accent line or colored banner (3–6pt solid color).
- Include document metadata: Date, Author / Team, Version, Classification (Confidential / Internal).

### B. KPI / Stat Callout Cards

- Render metrics as structured cards: a subtle light background (`#F8FAFC`), a 1pt soft border (`#E2E8F0`), a large bold metric (32pt), and a clear descriptive label below (10pt uppercase).

### C. Tables with Executive Polish

- **Header Row**: Solid dark primary fill (`#0F172A` or `#1E3A8A`) with white bold text, centered vertical alignment, and generous padding.
- **Data Rows**: Alternating zebra striping (`#FFFFFF` and `#F8FAFC`).
- **Borders**: Clean horizontal hairlines (`#E2E8F0`); remove vertical interior gridlines for a clean modern finish.
- **Alignment**: Text left-aligned; Numbers & Currencies strictly right-aligned; Status / Dates centered.
- **Totals Row**: Bold text, light tinted background, top hairline border, and double bottom accounting line.

### D. Callout & Note Containers

- Box with a 3pt solid left accent border (in Secondary or Accent color), 5–10% opacity tint background, and 10pt inner padding.

---

## 5. The Render-and-Inspect Verification Loop

Never finalize a generated document without inspecting its visual rendering. Automated code can produce awkward page breaks, overlapping text, or cut-off table columns.

### Verification Workflow

```bash
# 1. Convert source file to PDF via headless LibreOffice
libreoffice --headless --convert-to pdf document.docx  # or .pptx, .xlsx

# 2. Render PDF pages into high-resolution PNG images
pdftoppm -png -r 150 document.pdf page_render

# 3. Inspect generated images (e.g. page_render-1.png, page_render-2.png)
# Verify visual layout against the QA checklist below.
```

### Visual Inspection QA Checklist

1. **Page Breaks & Overflow**:
   - Is an H1 or H2 heading isolated at the very bottom of a page without its body text (orphan)?
   - Did a table split awkwardly across pages leaving a 1-row orphan?
   - Did the document spill onto an extra trailing page with only 2–3 lines of text?
2. **Text & Container Alignment**:
   - Are text blocks clipped or overlapping adjacent shapes or margins?
   - Is text properly wrapped inside cards and table cells?
3. **Data & Numerical Integrity**:
   - Are spreadsheet columns wide enough to prevent `###` overflow errors?
   - Are formulas rendering actual computed numbers instead of `#VALUE!` or `#REF!`?
4. **Color & Contrast**:
   - Is body text sharp and legible against backgrounds (minimum 4.5:1 contrast ratio)?
   - Do chart series colors clearly differentiate from each other?

---

## 6. Output File Strategy & Artifact Hygiene

- Always place generated files in clear, accessible paths (e.g., `./output/`, `./exports/`, or working directory).
- Clean up intermediate temporary files (`.tmp.pdf`, temporary images) after verification unless debugging.
- Output clean, standard file formats that open flawlessly in Microsoft Office, Google Workspace, Apple iWork, and PDF viewers.
