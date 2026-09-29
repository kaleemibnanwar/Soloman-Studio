export interface DefaultSkillDefinition {
  name: string;
  description: string;
  instructions: string;
}

export const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  {
    name: "document-visual-design",
    description:
      "Universal visual design principles, color theory, typography pairings, layout hierarchies, and inspection workflows for creating top-notch executive documents across DOCX, PPTX, XLSX, and PDF.",
    instructions: `# Universal Document Visual Design System

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
     - **Neutral Dark (Text)**: Off-black / deep slate for crisp readability (\`#1E293B\`, \`#0F172A\`, \`#18181B\`). Never pure \`#000000\` on white.
     - **Neutral Light (Surface/Card)**: Off-white / light slate tint for card backgrounds, zebra rows, and callouts (\`#F8FAFC\`, \`#F1F5F9\`, \`#FAF8F5\`).

3. **Whitespace as Design Material**:
   - Generous, intentional padding around text cards, table cells, and margins creates elegance.
   - Never cram elements to the absolute edge. Set strict outer margins (at least 0.8"–1.0" for slides, 0.75"–1.0" for Word/PDF, and 2-row/2-col buffers for Excel).

4. **Information Chunking**:
   - Break walls of text into **modular cards, callout containers, metric blocks, or 2/3-column comparison grids**.
   - Bullet points must be concise and actionable, preceded by bold mini-headers (e.g., \`**Market Penetration**: Expanded enterprise footprint by 34%\`).

5. **Eliminate the "AI Template" Look**:
   - Avoid generic placeholder icons inside decorative circles.
   - Avoid generic 01/02/03 step numbers unless conveying a strict chronological sequence.
   - Avoid default bright blue hyper-saturated charts.

---

## 2. Curated Color Palettes

Choose one distinct theme based on the document's domain:

| Theme Name | Primary Anchor | Secondary Accent | Highlight / Alert | Dark Text | Light Surface |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Modern Tech / B2B SaaS** | \`#0F172A\` (Slate Navy) | \`#4F46E5\` (Indigo) | \`#0EA5E9\` (Sky Cyan) | \`#1E293B\` | \`#F8FAFC\` |
| **Executive Wealth / Consulting**| \`#18181B\` (Charcoal) | \`#064E3B\` (Deep Forest)| \`#D97706\` (Amber Ochre) | \`#27272A\` | \`#FAF8F5\` |
| **Clean Healthcare / Bio** | \`#0C4A6E\` (Deep Teal) | \`#0284C7\` (Cobalt) | \`#10B981\` (Emerald) | \`#0F172A\` | \`#F0FDF4\` |
| **Modern Editorial / Creative** | \`#1C1917\` (Deep Ink) | \`#C2410C\` (Rust Terracotta)| \`#CA8A04\` (Warm Gold) | \`#292524\` | \`#FFFBEB\` |
| **Sleek Dark Mode (Decks)** | \`#090A0F\` (Obsidian Canvas)| \`#8B5CF6\` (Electric Violet)| \`#06B6D4\` (Neon Cyan) | \`#F8FAFC\` | \`#1E2235\` (Card) |

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
- **Body Text**: 10pt – 11.5pt (Regular, Line spacing: 1.15x – 1.25x, \`#1E293B\`)
- **Captions / Eyebrows / Metadata**: 8.5pt – 9.5pt (Uppercase, tracked, Muted Slate \`#64748B\`)
- **Metric / KPI Big Numbers**: 28pt – 48pt (Bold / Extra Bold, Primary or Highlight Color)

---

## 4. Key Structural Layout Components

### A. Title & Header Blocks
- Include a crisp top accent line or colored banner (3–6pt solid color).
- Include document metadata: Date, Author / Team, Version, Classification (Confidential / Internal).

### B. KPI / Stat Callout Cards
- Render metrics as structured cards: a subtle light background (\`#F8FAFC\`), a 1pt soft border (\`#E2E8F0\`), a large bold metric (32pt), and a clear descriptive label below (10pt uppercase).

### C. Tables with Executive Polish
- **Header Row**: Solid dark primary fill (\`#0F172A\` or \`#1E3A8A\`) with white bold text, centered vertical alignment, and generous padding.
- **Data Rows**: Alternating zebra striping (\`#FFFFFF\` and \`#F8FAFC\`).
- **Borders**: Clean horizontal hairlines (\`#E2E8F0\`); remove vertical interior gridlines for a clean modern finish.
- **Alignment**: Text left-aligned; Numbers & Currencies strictly right-aligned; Status / Dates centered.
- **Totals Row**: Bold text, light tinted background, top hairline border, and double bottom accounting line.

### D. Callout & Note Containers
- Box with a 3pt solid left accent border (in Secondary or Accent color), 5–10% opacity tint background, and 10pt inner padding.

---

## 5. The Render-and-Inspect Verification Loop

Never finalize a generated document without inspecting its visual rendering. Automated code can produce awkward page breaks, overlapping text, or cut-off table columns.

### Verification Workflow
\`\`\`bash
# 1. Convert source file to PDF via headless LibreOffice
libreoffice --headless --convert-to pdf document.docx  # or .pptx, .xlsx

# 2. Render PDF pages into high-resolution PNG images
pdftoppm -png -r 150 document.pdf page_render

# 3. Inspect generated images (e.g. page_render-1.png, page_render-2.png)
# Verify visual layout against the QA checklist below.
\`\`\`

### Visual Inspection QA Checklist
1. **Page Breaks & Overflow**:
   - Is an H1 or H2 heading isolated at the very bottom of a page without its body text (orphan)?
   - Did a table split awkwardly across pages leaving a 1-row orphan?
   - Did the document spill onto an extra trailing page with only 2–3 lines of text?
2. **Text & Container Alignment**:
   - Are text blocks clipped or overlapping adjacent shapes or margins?
   - Is text properly wrapped inside cards and table cells?
3. **Data & Numerical Integrity**:
   - Are spreadsheet columns wide enough to prevent \`###\` overflow errors?
   - Are formulas rendering actual computed numbers instead of \`#VALUE!\` or \`#REF!\`?
4. **Color & Contrast**:
   - Is body text sharp and legible against backgrounds (minimum 4.5:1 contrast ratio)?
   - Do chart series colors clearly differentiate from each other?

---

## 6. Output File Strategy & Artifact Hygiene

- Always place generated files in clear, accessible paths (e.g., \`./output/\`, \`./exports/\`, or working directory).
- Clean up intermediate temporary files (\`.tmp.pdf\`, temporary images) after verification unless debugging.
- Output clean, standard file formats that open flawlessly in Microsoft Office, Google Workspace, Apple iWork, and PDF viewers.`,
  },
  {
    name: "docx",
    description:
      "Professional Word document (.docx) generation and editing using python-docx, docx (Node.js), and raw OpenXML manipulation. Covers executive styling, typography, custom tables, callout boxes, headers/footers, tracked changes, comments, and the render-and-inspect visual validation loop.",
    instructions: `# DOCX Professional Document Design & Generation

This skill guides the creation of executive-grade, beautifully styled Microsoft Word (\`.docx\`) documents. Avoid producing plain, unstyled, default Word files. Every document must exhibit deliberate typography, curated color palettes, elegant tables, visual callouts, structured headers/footers, and clean page layouts.

---

## 1. Environment & Libraries

### Available Libraries
- **Python**: \`python-docx\` (\`pip install python-docx\`)
- **JavaScript / TypeScript**: \`docx\` (\`npm install docx\`)
- **Raw XML Editing**: \`zipfile\` / \`jszip\` + \`xml.etree.ElementTree\` for tracked changes, comments, and low-level OpenXML tags.
- **Conversion & Inspection**:
  - \`libreoffice\` (CLI headless converter)
  - \`pdftoppm\` (PDF to PNG renderer)

---

## 2. Design System & Typography

### Curated Color Themes (Hex)
- **Corporate Navy**: Primary \`#0F2942\`, Secondary \`#2563EB\`, Accent \`#38BDF8\`, Dark Text \`#1E293B\`, Tint \`#F8FAFC\`, Border \`#E2E8F0\`
- **Modern Slate / Indigo**: Primary \`#1E1B4B\`, Secondary \`#4F46E5\`, Accent \`#06B6D4\`, Dark Text \`#0F172A\`, Tint \`#F1F5F9\`, Border \`#CBD5E1\`
- **Executive Forest**: Primary \`#064E3B\`, Secondary \`#047857\`, Accent \`#D97706\`, Dark Text \`#18181B\`, Tint \`#FAF8F5\`, Border \`#E4E4E7\`

### Typographic Hierarchy
- **Document Title**: 24–28 pt, Bold, Primary Color
- **Subtitle / Meta**: 10–11 pt, Regular / Italic, Muted Slate \`#64748B\`
- **Heading 1 (H1)**: 18–20 pt, Bold, Primary Color, \`space_before = Pt(14)\`, \`space_after = Pt(6)\`, \`keep_with_next = True\`
- **Heading 2 (H2)**: 14–16 pt, Semi-Bold, Secondary Color, \`space_before = Pt(10)\`, \`space_after = Pt(4)\`, \`keep_with_next = True\`
- **Heading 3 (H3)**: 12–13 pt, Semi-Bold, Dark Neutral \`#334155\`, \`space_before = Pt(6)\`, \`space_after = Pt(2)\`
- **Body Paragraph**: 10.5–11 pt, Regular, Dark Neutral \`#1E293B\`, \`line_spacing = 1.15\`, \`space_after = Pt(6)\`, \`space_before = Pt(0)\`
- **Table / Callout Text**: 9.5–10 pt, Regular

---

## 3. Python-docx Implementation Recipes

### A. Document Setup & Page Margins
\`\`\`python
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

doc = docx.Document()

# Standard Executive Margins (1 inch)
for section in doc.sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.different_first_page_header_footer = True
\`\`\`

### B. Title Block with Accent Line
\`\`\`python
def add_title_block(doc, title_text, subtitle_text, metadata_dict):
    # Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(2)
    run_title = p_title.add_run(title_text)
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(26)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x0F, 0x29, 0x42) # Primary Navy

    # Subtitle
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(8)
    run_sub = p_sub.add_run(subtitle_text)
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(12)
    run_sub.font.color.rgb = RGBColor(0x64, 0x74, 0x8B) # Muted Slate

    # Thin horizontal accent divider
    p_rule = doc.add_paragraph()
    p_rule.paragraph_format.space_after = Pt(12)
    p_rule_xml = parse_xml(r'<w:pBdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                           r'<w:bottom w:val="single" w:sz="18" w:space="1" w:color="2563EB"/>'
                           r'</w:pBdr>')
    p_rule._p.get_or_add_pPr().append(p_rule_xml)

    # Metadata bar
    p_meta = doc.add_paragraph()
    p_meta.paragraph_format.space_after = Pt(16)
    meta_parts = [f"{k}: {v}" for k, v in metadata_dict.items()]
    run_meta = p_meta.add_run("   |   ".join(meta_parts))
    run_meta.font.size = Pt(9.5)
    run_meta.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
\`\`\`

### C. Executive Callout Box (1x1 Table with Accent Border)
\`\`\`python
def add_callout_box(doc, title, body_text, accent_color="2563EB", bg_color="F8FAFC"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    cell = table.cell(0, 0)
    cell.width = Inches(6.5)

    # XML for background color and left border accent only
    shading_xml = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_color}"/>')
    borders_xml = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'  <w:top w:val="none"/>'
        f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="{accent_color}"/>'
        f'  <w:bottom w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'</w:tcBorders>'
    )
    margins_xml = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'  <w:top w:w="160" w:type="dxa"/>'
        f'  <w:left w:w="240" w:type="dxa"/>'
        f'  <w:bottom w:w="160" w:type="dxa"/>'
        f'  <w:right w:w="240" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    cell._tc.get_or_add_tcPr().append(shading_xml)
    cell._tc.get_or_add_tcPr().append(borders_xml)
    cell._tc.get_or_add_tcPr().append(margins_xml)

    # Content
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    run_h = p.add_run(f"📌 {title}\\n")
    run_h.font.bold = True
    run_h.font.size = Pt(10.5)
    run_h.font.color.rgb = RGBColor(0x0F, 0x29, 0x42)

    run_b = p.add_run(body_text)
    run_b.font.size = Pt(10)
    run_b.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    # Empty spacer after table
    p_sp = doc.add_paragraph()
    p_sp.paragraph_format.space_before = Pt(0)
    p_sp.paragraph_format.space_after = Pt(6)
\`\`\`

### D. Professional Tables with Shading & Row Integrity
\`\`\`python
def style_table(table, col_widths, header_bg="0F2942", zebra_bg="F8FAFC", border_color="E2E8F0"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Prevent row splitting across pages and repeat header on every page
    for i, row in enumerate(table.rows):
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        if i == 0:
            trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

        # Set column widths and cell styling
        for j, cell in enumerate(row.cells):
            cell.width = col_widths[j]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            # Cell padding
            tcPr = cell._tc.get_or_add_tcPr()
            tcMar = parse_xml(
                f'<w:tcMar {nsdecls("w")}>'
                f'  <w:top w:w="120" w:type="dxa"/>'
                f'  <w:left w:w="140" w:type="dxa"/>'
                f'  <w:bottom w:w="120" w:type="dxa"/>'
                f'  <w:right w:w="140" w:type="dxa"/>'
                f'</w:tcMar>'
            )
            tcPr.append(tcMar)

            # Shading
            if i == 0:
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{header_bg}"/>')
                tcPr.append(shd)
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(0)
                    for r in p.runs:
                        r.font.bold = True
                        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                        r.font.size = Pt(9.5)
            else:
                if i % 2 == 0:
                    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{zebra_bg}"/>')
                    tcPr.append(shd)
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(0)
                    for r in p.runs:
                        r.font.size = Pt(9.5)
                        r.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
\`\`\`

### E. Dynamic Page Numbers in Footer ("Page X of Y")
\`\`\`python
def add_footer_page_numbers(section, doc_title="Executive Report"):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(8)

    # Left part: Document title
    r_left = p.add_run(f"{doc_title}   |   ")
    r_left.font.size = Pt(8.5)
    r_left.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    # Page X
    r_page = p.add_run("Page ")
    r_page.font.size = Pt(8.5)
    r_page.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    fldSimple1 = parse_xml(r'<w:fldSimple %s w:instr="PAGE"/>' % nsdecls('w'))
    p._p.append(fldSimple1)

    r_of = p.add_run(" of ")
    r_of.font.size = Pt(8.5)
    r_of.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    fldSimple2 = parse_xml(r'<w:fldSimple %s w:instr="NUMPAGES"/>' % nsdecls('w'))
    p._p.append(fldSimple2)
\`\`\`

---

## 4. Tracked Changes & Comments via Raw OpenXML

When reviewing or editing existing Word documents with tracked revisions and comments:
1. \`.docx\` is a ZIP container containing \`word/document.xml\`, \`word/comments.xml\`, \`[Content_Types].xml\`, and \`word/_rels/document.xml.rels\`.
2. **Tracked Insertions**: \`<w:ins w:id="1" w:author="Reviewer" w:date="2026-09-29T10:00:00Z"><w:r><w:t>inserted text</w:t></w:r></w:ins>\`
3. **Tracked Deletions**: \`<w:del w:id="2" w:author="Reviewer" w:date="2026-09-29T10:00:00Z"><w:r><w:delText>deleted text</w:delText></w:r></w:del>\`
4. **Comments**: Insert comment anchor in \`document.xml\` (\`<w:commentRangeStart w:id="0"/>...<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>\`) and comment body in \`word/comments.xml\`.

---

## 5. Render-and-Inspect Loop

Always verify the layout before finishing:
\`\`\`bash
# 1. Convert DOCX to PDF
libreoffice --headless --convert-to pdf report.docx

# 2. Convert PDF to PNG images (150 DPI)
pdftoppm -png -r 150 report.pdf page_preview

# 3. View images to check:
#    - Are headings sticking to the next paragraph (no orphan headings)?
#    - Are tables split cleanly across page boundaries?
#    - Are cell paddings and line wraps balanced?
\`\`\``,
  },
  {
    name: "pptx",
    description:
      "Professional PowerPoint presentation (.pptx) generation using python-pptx and PptxGenJS. Covers widescreen 16:9 layouts, executive color palettes, modular card containers, native charts, KPI dashboards, and the render-and-inspect visual validation loop.",
    instructions: `# PPTX Executive Presentation Design & Generation

This skill guides the creation of high-impact, C-suite ready PowerPoint presentations (\`.pptx\`). Never produce default 4:3 slides, generic bulleted walls of text, or unstyled template shapes. Build code-driven, 16:9 widescreen decks with modular card structures, intentional typographic contrast, and native data visualizations.

---

## 1. Core Presentation Constraints

1. **Widescreen 16:9 Dimensions**: Always set slide dimensions to **13.333 inches wide by 7.5 inches high** (or 1920x1080 equivalent).
2. **Takeaway Action Headlines**:
   - Slide headers must state the key conclusion, not just a category name.
   - *Weak*: "Quarterly Revenue"
   - *Strong*: "Q3 Revenue Grew 38% YoY Driven by Enterprise Expansion"
3. **Modular Card Architecture**:
   - Organize slide body content into **2, 3, or 4 visual container cards**.
   - Each card features a light background fill (\`#F8FAFC\`), a subtle border (\`#E2E8F0\`), a bold sub-header, and concise supporting points.
4. **Scannable Metrics**:
   - Highlight key data points with large numbers (36–48pt bold) and small descriptive sub-labels (10–11pt).
5. **No AI Clichés**:
   - Do not scatter random circle icons or numbered bubbles (01, 02, 03) unless describing a real ordered timeline.

---

## 2. Curated Color Palettes (RGB / Hex)

| Theme | Background Canvas | Card Container | Primary Action | Secondary Accent | Text Dark |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Modern B2B SaaS** | \`#FFFFFF\` | \`#F8FAFC\` | \`#0F172A\` (Navy) | \`#4F46E5\` (Indigo) | \`#1E293B\` |
| **Executive Wealth** | \`#FAF8F5\` | \`#FFFFFF\` | \`#18181B\` (Charcoal)| \`#064E3B\` (Emerald)| \`#27272A\` |
| **Dark Mode Cyber** | \`#0B0F19\` (Obsidian)| \`#161F30\` | \`#8B5CF6\` (Violet)| \`#06B6D4\` (Cyan) | \`#F8FAFC\` |
| **Clean Tech Teal** | \`#FFFFFF\` | \`#F0FDF4\` | \`#0C4A6E\` (Deep Teal)| \`#0284C7\` (Cobalt) | \`#0F172A\` |

---

## 3. Python-pptx Implementation Guide

### A. Initialization & Widescreen Setup
\`\`\`python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank_layout = prs.slide_layouts[6] # Blank slide layout
\`\`\`

### B. Standard Slide Header (Kicker + Action Title)
\`\`\`python
def add_slide_header(slide, kicker_text, title_text, dark_mode=False):
    # Kicker / Category Eyebrow
    kicker_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.35))
    tf_k = kicker_box.text_frame
    tf_k.word_wrap = True
    tf_k.margin_left = tf_k.margin_top = tf_k.margin_right = tf_k.margin_bottom = 0
    p_k = tf_k.paragraphs[0]
    p_k.text = kicker_text.upper()
    p_k.font.size = Pt(10)
    p_k.font.bold = True
    p_k.font.color.rgb = RGBColor(0x8B, 0x5C, 0xF6) if dark_mode else RGBColor(0x4F, 0x46, 0xE5)

    # Main Action Headline
    title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.85), Inches(11.7), Inches(0.75))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = tf_t.margin_top = tf_t.margin_right = tf_t.margin_bottom = 0
    p_t = tf_t.paragraphs[0]
    p_t.text = title_text
    p_t.font.size = Pt(22)
    p_t.font.bold = True
    p_t.font.color.rgb = RGBColor(0xF8, 0xFA, 0xFC) if dark_mode else RGBColor(0x0F, 0x17, 0x2A)
\`\`\`

### C. 3-Card Structured Grid Layout
\`\`\`python
def add_three_card_layout(slide, cards_data, start_top=1.8, card_height=5.0):
    """
    cards_data = [
        {"tag": "MARKET SIZE", "metric": "$42B", "title": "TAM Expansion", "points": ["Point 1", "Point 2"]},
        ...
    ]
    """
    left_margin = 0.8
    total_width = 11.733
    gap = 0.35
    card_width = (total_width - (gap * 2)) / 3

    for i, data in enumerate(cards_data):
        card_left = left_margin + i * (card_width + gap)

        # Background Card Shape
        shape = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(card_left), Inches(start_top),
            Inches(card_width), Inches(card_height)
        )
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(0xF8, 0xFA, 0xFC)
        shape.line.color.rgb = RGBColor(0xE2, 0xE8, 0xF0)
        shape.line.width = Pt(1)

        # Card Content Box
        tb = slide.shapes.add_textbox(
            Inches(card_left + 0.25), Inches(start_top + 0.25),
            Inches(card_width - 0.5), Inches(card_height - 0.5)
        )
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        # Tag
        p0 = tf.paragraphs[0]
        p0.text = data.get("tag", "").upper()
        p0.font.size = Pt(9.5)
        p0.font.bold = True
        p0.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)
        p0.space_after = Pt(4)

        # Metric Big Number (if present)
        if "metric" in data:
            p_m = tf.add_paragraph()
            p_m.text = data["metric"]
            p_m.font.size = Pt(32)
            p_m.font.bold = True
            p_m.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
            p_m.space_after = Pt(6)

        # Card Title
        p_title = tf.add_paragraph()
        p_title.text = data.get("title", "")
        p_title.font.size = Pt(14)
        p_title.font.bold = True
        p_title.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
        p_title.space_after = Pt(8)

        # Bullet points
        for pt in data.get("points", []):
            p_pt = tf.add_paragraph()
            p_pt.text = f"•  {pt}"
            p_pt.font.size = Pt(11)
            p_pt.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
            p_pt.space_after = Pt(4)
\`\`\`

### D. Native Styled Chart Creation
\`\`\`python
def add_native_bar_chart(slide, x=6.8, y=1.8, cx=5.7, cy=4.8):
    chart_data = CategoryChartData()
    chart_data.categories = ['Q1', 'Q2', 'Q3', 'Q4']
    chart_data.add_series('Enterprise', (14.2, 18.5, 24.1, 31.8))
    chart_data.add_series('Self-Serve', (8.1, 9.4, 11.2, 13.0))

    chart_shape = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Inches(x), Inches(y), Inches(cx), Inches(cy), chart_data
    )
    chart = chart_shape.chart
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.TOP
    chart.legend.include_in_layout = False

    # Customize series colors
    series1 = chart.series[0]
    series1.format.fill.solid()
    series1.format.fill.fore_color.rgb = RGBColor(0x0F, 0x17, 0x2A) # Navy

    series2 = chart.series[1]
    series2.format.fill.solid()
    series2.format.fill.fore_color.rgb = RGBColor(0x4F, 0x46, 0xE5) # Indigo
\`\`\`

---

## 4. Render-and-Inspect Loop

Always visually verify the slide deck:
\`\`\`bash
# 1. Convert PPTX to PDF
libreoffice --headless --convert-to pdf presentation.pptx

# 2. Render each slide to PNG
pdftoppm -png -r 150 presentation.pdf slide_preview

# 3. Inspect slide_preview-1.png, slide_preview-2.png, etc.:
#    - Are card boundaries aligned horizontally and vertically?
#    - Does any text wrap onto unwanted extra lines or collide with chart legends?
#    - Is contrast sharp and executive-ready?
\`\`\``,
  },
  {
    name: "xlsx",
    description:
      "Executive-grade spreadsheet (.xlsx) design, financial modeling, and data formatting using openpyxl and pandas. Covers color schemes, number formatting, zebra striping, KPI cards, formulas, column auto-width, native charts, and the render-and-inspect visual validation loop.",
    instructions: `# XLSX Professional Spreadsheet Design & Modeling

This skill guides the creation of executive-ready, publication-grade Excel workbooks (\`.xlsx\`). Raw, unformatted spreadsheets with default fonts, unaligned numbers, and missing gridlines look sloppy. Every spreadsheet must be structured like a polished financial dashboard with intentional typography, deliberate number formats, clean headers, and automated column sizing.

---

## 1. Golden Rules of Spreadsheet Craftsmanship

1. **Explicit Formatting for Every Number**:
   - Currency: \`"$#,##0"\` or \`"$#,##0.00"\`
   - Percentages: \`"0.0%"\` or \`"0.00%"\`
   - Quantities / Integers: \`"#,##0"\`
   - Dates: \`"YYYY-MM-DD"\`
   - Text is left-aligned; Numbers are right-aligned; Status / Dates are centered.
2. **Explicit Gridlines**:
   - Excel often hides gridlines when cell background fills are applied. Always explicitly enable gridlines:
     \`ws.views.sheetView[0].showGridLines = True\`
3. **Never Hardcode Calculable Values**:
   - Use uppercase formulas: \`=SUM(C5:C12)\`, \`=AVERAGE(D5:D20)\`, \`=IFERROR(A1/B1, 0)\`.
4. **Auto-Fit Column Widths with Safety Margins**:
   - Never let values render as \`###\`. Calculate max string length per column and add **+3 to +4 character padding**.
5. **Standardized Row Heights**:
   - Title Row: 32–36 pt
   - KPI / Summary Row: 28–32 pt
   - Table Header: 24–28 pt
   - Data Rows: 20–22 pt

---

## 2. Executive Color Palette Tokens (Hex)

- **Header Fill**: \`#0F172A\` (Slate Navy) with \`#FFFFFF\` Bold Text
- **Sub-header / Category Fill**: \`#F1F5F9\` with \`#1E293B\` Bold Text
- **Zebra Row Even**: \`#FFFFFF\`
- **Zebra Row Odd**: \`#F8FAFC\` (Light Slate Tint)
- **KPI Card Background**: \`#F8FAFC\` with \`#E2E8F0\` Border
- **Accent Green (Positive)**: Text \`#15803D\`, Fill \`#DCFCE7\`
- **Accent Red (Alert)**: Text \`#B91C1C\`, Fill \`#FEE2E2\`

---

## 3. Openpyxl Implementation Guide

\`\`\`python
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Financial Overview"

# Ensure gridlines remain visible
ws.views.sheetView[0].showGridLines = True

# Standard Fonts & Fills
FONT_TITLE = Font(name="Segoe UI", size=16, bold=True, color="0F172A")
FONT_SUBTITLE = Font(name="Segoe UI", size=10, italic=True, color="64748B")
FONT_HEADER = Font(name="Segoe UI", size=10.5, bold=True, color="FFFFFF")
FONT_BOLD = Font(name="Segoe UI", size=10, bold=True, color="1E293B")
FONT_BODY = Font(name="Segoe UI", size=10, color="1E293B")
FONT_KPI_LABEL = Font(name="Segoe UI", size=9, bold=True, color="64748B")
FONT_KPI_VAL = Font(name="Segoe UI", size=18, bold=True, color="0F172A")

FILL_HEADER = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
FILL_ZEBRA = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
FILL_TOTAL = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
FILL_KPI = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

BORDER_THIN = Border(
    left=Side(style='thin', color='E2E8F0'),
    right=Side(style='thin', color='E2E8F0'),
    top=Side(style='thin', color='E2E8F0'),
    bottom=Side(style='thin', color='E2E8F0')
)

BORDER_TOTAL = Border(
    top=Side(style='thin', color='0F172A'),
    bottom=Side(style='double', color='0F172A')
)

# 1. Title Block
ws['A2'] = "Quarterly Business Performance"
ws['A2'].font = FONT_TITLE
ws['A3'] = "All figures in USD ($) — Confidential"
ws['A3'].font = FONT_SUBTITLE
ws.row_dimensions[2].height = 24
ws.row_dimensions[3].height = 16

# 2. KPI Summary Cards (B5:C6, E5:F6)
def create_kpi_card(ws, top_left_cell, label, val_text, is_currency=False):
    col = top_left_cell[0]
    row = int(top_left_cell[1:])
    
    # Label row
    cell_lbl = ws[f"{col}{row}"]
    cell_lbl.value = label.upper()
    cell_lbl.font = FONT_KPI_LABEL
    cell_lbl.fill = FILL_KPI
    cell_lbl.alignment = Alignment(horizontal="center", vertical="center")
    
    # Value row
    cell_val = ws[f"{col}{row+1}"]
    cell_val.value = val_text
    cell_val.font = FONT_KPI_VAL
    cell_val.fill = FILL_KPI
    cell_val.alignment = Alignment(horizontal="center", vertical="center")
    if is_currency:
        cell_val.number_format = "$#,##0"

create_kpi_card(ws, "B5", "Total Revenue", 2450000, is_currency=True)
create_kpi_card(ws, "D5", "Gross Margin", 0.784)
ws['D6'].number_format = "0.0%"
create_kpi_card(ws, "F5", "Active Clients", 342)
ws['F6'].number_format = "#,##0"

ws.row_dimensions[5].height = 18
ws.row_dimensions[6].height = 28

# 3. Data Table Headers (Row 9)
headers = ["Department", "Region", "Q1 Budget", "Q1 Actual", "Variance ($)", "Variance (%)"]
start_row = 9

for col_idx, header in enumerate(headers, start=2): # Start column B
    cell = ws.cell(row=start_row, column=col_idx, value=header)
    cell.font = FONT_HEADER
    cell.fill = FILL_HEADER
    cell.alignment = Alignment(horizontal="center" if "Region" in header else ("right" if "Q1" in header or "Variance" in header else "left"), vertical="center")
ws.row_dimensions[start_row].height = 26

# 4. Data Rows
data = [
    ["Engineering", "North America", 450000, 432000],
    ["Marketing", "North America", 280000, 295000],
    ["Sales", "EMEA", 320000, 310000],
    ["Customer Support", "Global", 150000, 142000],
    ["Product & Design", "North America", 210000, 205000],
]

for r_offset, row_data in enumerate(data, start=1):
    curr_row = start_row + r_offset
    ws.row_dimensions[curr_row].height = 20
    is_odd = (r_offset % 2 == 1)
    
    ws.cell(row=curr_row, column=2, value=row_data[0]).font = FONT_BODY # Dept
    ws.cell(row=curr_row, column=3, value=row_data[1]).font = FONT_BODY # Region
    ws.cell(row=curr_row, column=3).alignment = Alignment(horizontal="center")
    
    # Numbers
    c_budget = ws.cell(row=curr_row, column=4, value=row_data[2])
    c_budget.font = FONT_BODY
    c_budget.number_format = "$#,##0"
    
    c_actual = ws.cell(row=curr_row, column=5, value=row_data[3])
    c_actual.font = FONT_BODY
    c_actual.number_format = "$#,##0"
    
    # Formulas
    c_var = ws.cell(row=curr_row, column=6, value=f"=E{curr_row}-D{curr_row}")
    c_var.font = FONT_BODY
    c_var.number_format = "$#,##0"
    
    c_var_pct = ws.cell(row=curr_row, column=7, value=f"=IFERROR(F{curr_row}/D{curr_row}, 0)")
    c_var_pct.font = FONT_BODY
    c_var_pct.number_format = "0.0%"

    for c_idx in range(2, 8):
        cell = ws.cell(row=curr_row, column=c_idx)
        cell.border = BORDER_THIN
        if is_odd:
            cell.fill = FILL_ZEBRA

# 5. Total Summary Row
total_row = start_row + len(data) + 1
ws.row_dimensions[total_row].height = 24
ws.cell(row=total_row, column=2, value="Total").font = FONT_BOLD

for c_idx in range(2, 8):
    cell = ws.cell(row=total_row, column=c_idx)
    cell.border = BORDER_TOTAL
    cell.fill = FILL_TOTAL

# Budget & Actual totals
ws.cell(row=total_row, column=4, value=f"=SUM(D10:D{total_row-1})").number_format = "$#,##0"
ws.cell(row=total_row, column=4).font = FONT_BOLD
ws.cell(row=total_row, column=5, value=f"=SUM(E10:E{total_row-1})").number_format = "$#,##0"
ws.cell(row=total_row, column=5).font = FONT_BOLD
ws.cell(row=total_row, column=6, value=f"=E{total_row}-D{total_row}").number_format = "$#,##0"
ws.cell(row=total_row, column=6).font = FONT_BOLD
ws.cell(row=total_row, column=7, value=f"=IFERROR(F{total_row}/D{total_row}, 0)").number_format = "0.0%"
ws.cell(row=total_row, column=7).font = FONT_BOLD

# 6. Auto-Fit Column Widths with Safety Padding
for col in ws.columns:
    max_len = 0
    col_letter = get_column_letter(col[0].column)
    for cell in col:
        if cell.value:
            val_str = str(cell.value)
            # Handle formula lengths reasonably
            if val_str.startswith('='):
                val_str = "  $999,999,999  "
            max_len = max(max_len, len(val_str))
    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

# Set margin buffer for Column A
ws.column_dimensions['A'].width = 4

wb.save("executive_report.xlsx")
\`\`\`

---

## 4. Render-and-Inspect Loop

Always verify the Excel output visually:
\`\`\`bash
# 1. Convert XLSX to PDF
libreoffice --headless --convert-to pdf executive_report.xlsx

# 2. Render sheet to PNG
pdftoppm -png -r 150 executive_report.pdf sheet_preview

# 3. Inspect sheet_preview-1.png:
#    - Are column widths adequate (no "###" displayed)?
#    - Do formulas evaluate properly?
#    - Are gridlines visible and alignment crisp?
\`\`\``,
  },
  {
    name: "pdf",
    description:
      'Publication-grade PDF generation and manipulation using ReportLab Platypus, PyPDF, and WeasyPrint. Covers page-budgeting, canvas running headers/footers, dynamic "Page X of Y", custom ParagraphStyle leading, styled tables, callout blocks, vector graphics, and the render-and-inspect visual validation loop.',
    instructions: `# PDF Publication-Grade Document Design & Generation

This skill guides the creation of publication-quality, pixel-precise PDF documents using Python's \`reportlab\` Platypus framework and related PDF tooling. Avoid producing unstyled raw text dumps or unconstrained layouts that spill 2–3 awkward lines onto an extra page. Build code-driven, typographically sound PDFs with structured flowables, running headers/footers, and page-budgeting discipline.

---

## 1. Golden Rules of PDF Craftsmanship

1. **Page Budgeting**:
   - Decide the exact target page count upfront (e.g. 1-page executive summary, 2-page investment brief, 5-page audit report).
   - Adjust \`fontSize\`, \`leading\`, \`Spacer\` heights, and table row heights so content fits cleanly into the budgeted pages without orphan trailing paragraphs.
2. **Proportional Leading**:
   - In ReportLab \`ParagraphStyle\`, setting \`fontSize\` without updating \`leading\` causes overlapping text lines.
   - **Always set \`leading = fontSize * 1.25\` to \`fontSize * 1.35\`**.
3. **Keep Headings with Next Paragraph**:
   - Always set \`keepWithNext=True\` on all heading styles to prevent orphan titles stranded at the bottom of pages.
4. **Two-Pass Numbered Canvas ("Page X of Y")**:
   - Use a custom \`canvas.Canvas\` subclass that records total pages on pass 1 and draws running footers on pass 2.
5. **No Pure Black on White**:
   - Use \`#0F172A\` (Slate Navy) for headings and \`#1E293B\` / \`#334155\` for body text.

---

## 2. Color Palette Constants (Hex & HexColor)

\`\`\`python
from reportlab.lib.colors import HexColor

COLOR_PRIMARY = HexColor("#0F2942")     # Deep Executive Navy
COLOR_SECONDARY = HexColor("#2563EB")   # Bright Blue Accent
COLOR_TEXT_DARK = HexColor("#1E293B")   # Slate Body Text
COLOR_TEXT_MUTED = HexColor("#64748B")  # Slate Subtitle / Captions
COLOR_BG_CARD = HexColor("#F8FAFC")     # Soft Container Fill
COLOR_BG_ZEBRA = HexColor("#F1F5F9")    # Alternating Table Row
COLOR_BORDER = HexColor("#E2E8F0")      # Subtle Hairline Rule
COLOR_WHITE = HexColor("#FFFFFF")
\`\`\`

---

## 3. ReportLab Platypus Implementation Guide

### A. Numbered Canvas for "Page X of Y" and Running Headers
\`\`\`python
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8.5)
        self.setFillColor(HexColor("#64748B"))

        # Skip header on first page (Cover / Title)
        if self._pageNumber > 1:
            # Top Running Header
            self.drawString(54, 750, "Executive Performance Brief   |   Q3 Review")
            self.setStrokeColor(HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)

        # Bottom Running Footer (All pages)
        self.setStrokeColor(HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)

        self.drawString(54, 32, "Confidential — For Internal Use Only")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 32, page_str)
        self.restoreState()
\`\`\`

### B. Complete Document Assembly Recipe
\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY

def generate_executive_pdf(filename="executive_brief.pdf"):
    # Margins: 0.75 in = 54 pt
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54, rightMargin=54,
        topMargin=54, bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom Typography Hierarchy
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=COLOR_PRIMARY,
        spaceAfter=4
    )

    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=14,
        textColor=COLOR_TEXT_MUTED,
        spaceAfter=12
    )

    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=COLOR_PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=COLOR_SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=COLOR_TEXT_DARK,
        spaceAfter=8
    )

    story = []

    # 1. Title Block
    story.append(Paragraph("Strategic Growth & Financial Audit", style_title))
    story.append(Paragraph("Prepared for Executive Leadership   |   September 2026", style_subtitle))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_SECONDARY, spaceBefore=0, spaceAfter=14))

    # 2. Executive Callout Card (1x1 Table)
    callout_data = [[
        Paragraph("<b>Key Takeaway:</b> Operational margins improved by <b>420 bps</b> in Q3, outperforming annual guidance across all European product lines while reducing customer acquisition costs by 18%.", style_body)
    ]]
    callout_table = Table(callout_data, colWidths=[504])
    callout_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_BG_CARD),
        ('LINELEFT', (0,0), (0,-1), 3.0, COLOR_SECONDARY), # Accent Left Bar
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
    ]))
    story.append(callout_table)
    story.append(Spacer(1, 14))

    # 3. Section 1
    story.append(Paragraph("1. Financial Summary by Division", style_h1))
    story.append(Paragraph("The table below details quarterly budget allocation versus actual expenditures across primary operating units.", style_body))

    # 4. Styled Table
    table_data = [
        [Paragraph("<b>Operating Unit</b>", style_body), Paragraph("<b>Q3 Target</b>", style_body), Paragraph("<b>Q3 Actual</b>", style_body), Paragraph("<b>Variance</b>", style_body)],
        ["Cloud Infrastructure", "$1,200,000", "$1,140,000", "+5.0%"],
        ["Product Engineering", "$2,400,000", "$2,480,000", "-3.3%"],
        ["Enterprise Sales", "$1,800,000", "$1,620,000", "+10.0%"],
        ["Global Marketing", "$950,000", "$910,000", "+4.2%"],
        [Paragraph("<b>Total / Weighted Avg</b>", style_body), "$6,350,000", "$6,150,000", "+3.1%"]
    ]

    t = Table(table_data, colWidths=[180, 108, 108, 108])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('TEXTCOLOR', (0,0), (-1,0), COLOR_WHITE),
        ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [COLOR_WHITE, COLOR_BG_ZEBRA]),
        ('BACKGROUND', (0,-1), (-1,-1), COLOR_BG_CARD),
        ('LINEABOVE', (0,-1), (-1,-1), 1.0, COLOR_PRIMARY),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, COLOR_PRIMARY),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
    ]))
    story.append(t)

    # Build PDF with dynamic header/footer canvas
    doc.build(story, canvasmaker=NumberedCanvas)

if __name__ == "__main__":
    generate_executive_pdf()
\`\`\`

---

## 4. Render-and-Inspect Loop

\`\`\`bash
# 1. Render all PDF pages into PNG images (150 DPI)
pdftoppm -png -r 150 executive_brief.pdf page_preview

# 2. Inspect page_preview-1.png, page_preview-2.png:
#    - Does the document fit cleanly on the intended page count?
#    - Are headings tied to their paragraphs (no orphaned headings)?
#    - Is leading proportional with no overlapping glyphs?
\`\`\``,
  },
];
