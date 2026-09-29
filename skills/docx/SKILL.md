---
name: docx
description: Professional Word document (.docx) generation and editing using python-docx, docx (Node.js), and raw OpenXML manipulation. Covers executive styling, typography, custom tables, callout boxes, headers/footers, tracked changes, comments, and the render-and-inspect visual validation loop.
---

# DOCX Professional Document Design & Generation

This skill guides the creation of executive-grade, beautifully styled Microsoft Word (`.docx`) documents. Avoid producing plain, unstyled, default Word files. Every document must exhibit deliberate typography, curated color palettes, elegant tables, visual callouts, structured headers/footers, and clean page layouts.

---

## 1. Environment & Libraries

### Available Libraries

- **Python**: `python-docx` (`pip install python-docx`)
- **JavaScript / TypeScript**: `docx` (`npm install docx`)
- **Raw XML Editing**: `zipfile` / `jszip` + `xml.etree.ElementTree` for tracked changes, comments, and low-level OpenXML tags.
- **Conversion & Inspection**:
  - `libreoffice` (CLI headless converter)
  - `pdftoppm` (PDF to PNG renderer)

---

## 2. Design System & Typography

### Curated Color Themes (Hex)

- **Corporate Navy**: Primary `#0F2942`, Secondary `#2563EB`, Accent `#38BDF8`, Dark Text `#1E293B`, Tint `#F8FAFC`, Border `#E2E8F0`
- **Modern Slate / Indigo**: Primary `#1E1B4B`, Secondary `#4F46E5`, Accent `#06B6D4`, Dark Text `#0F172A`, Tint `#F1F5F9`, Border `#CBD5E1`
- **Executive Forest**: Primary `#064E3B`, Secondary `#047857`, Accent `#D97706`, Dark Text `#18181B`, Tint `#FAF8F5`, Border `#E4E4E7`

### Typographic Hierarchy

- **Document Title**: 24–28 pt, Bold, Primary Color
- **Subtitle / Meta**: 10–11 pt, Regular / Italic, Muted Slate `#64748B`
- **Heading 1 (H1)**: 18–20 pt, Bold, Primary Color, `space_before = Pt(14)`, `space_after = Pt(6)`, `keep_with_next = True`
- **Heading 2 (H2)**: 14–16 pt, Semi-Bold, Secondary Color, `space_before = Pt(10)`, `space_after = Pt(4)`, `keep_with_next = True`
- **Heading 3 (H3)**: 12–13 pt, Semi-Bold, Dark Neutral `#334155`, `space_before = Pt(6)`, `space_after = Pt(2)`
- **Body Paragraph**: 10.5–11 pt, Regular, Dark Neutral `#1E293B`, `line_spacing = 1.15`, `space_after = Pt(6)`, `space_before = Pt(0)`
- **Table / Callout Text**: 9.5–10 pt, Regular

---

## 3. Python-docx Implementation Recipes

### A. Document Setup & Page Margins

```python
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
```

### B. Title Block with Accent Line

```python
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
```

### C. Executive Callout Box (1x1 Table with Accent Border)

```python
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
    run_h = p.add_run(f"📌 {title}\n")
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
```

### D. Professional Tables with Shading & Row Integrity

```python
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
```

### E. Dynamic Page Numbers in Footer ("Page X of Y")

```python
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
```

---

## 4. Tracked Changes & Comments via Raw OpenXML

When reviewing or editing existing Word documents with tracked revisions and comments:

1. `.docx` is a ZIP container containing `word/document.xml`, `word/comments.xml`, `[Content_Types].xml`, and `word/_rels/document.xml.rels`.
2. **Tracked Insertions**: `<w:ins w:id="1" w:author="Reviewer" w:date="2026-09-29T10:00:00Z"><w:r><w:t>inserted text</w:t></w:r></w:ins>`
3. **Tracked Deletions**: `<w:del w:id="2" w:author="Reviewer" w:date="2026-09-29T10:00:00Z"><w:r><w:delText>deleted text</w:delText></w:r></w:del>`
4. **Comments**: Insert comment anchor in `document.xml` (`<w:commentRangeStart w:id="0"/>...<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>`) and comment body in `word/comments.xml`.

---

## 5. Render-and-Inspect Loop

Always verify the layout before finishing:

```bash
# 1. Convert DOCX to PDF
libreoffice --headless --convert-to pdf report.docx

# 2. Convert PDF to PNG images (150 DPI)
pdftoppm -png -r 150 report.pdf page_preview

# 3. View images to check:
#    - Are headings sticking to the next paragraph (no orphan headings)?
#    - Are tables split cleanly across page boundaries?
#    - Are cell paddings and line wraps balanced?
```
