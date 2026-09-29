---
name: pdf
description: Publication-grade PDF generation and manipulation using ReportLab Platypus, PyPDF, and WeasyPrint. Covers page-budgeting, canvas running headers/footers, dynamic "Page X of Y", custom ParagraphStyle leading, styled tables, callout blocks, vector graphics, and the render-and-inspect visual validation loop.
---

# PDF Publication-Grade Document Design & Generation

This skill guides the creation of publication-quality, pixel-precise PDF documents using Python's `reportlab` Platypus framework and related PDF tooling. Avoid producing unstyled raw text dumps or unconstrained layouts that spill 2–3 awkward lines onto an extra page. Build code-driven, typographically sound PDFs with structured flowables, running headers/footers, and page-budgeting discipline.

---

## 1. Golden Rules of PDF Craftsmanship

1. **Page Budgeting**:
   - Decide the exact target page count upfront (e.g. 1-page executive summary, 2-page investment brief, 5-page audit report).
   - Adjust `fontSize`, `leading`, `Spacer` heights, and table row heights so content fits cleanly into the budgeted pages without orphan trailing paragraphs.
2. **Proportional Leading**:
   - In ReportLab `ParagraphStyle`, setting `fontSize` without updating `leading` causes overlapping text lines.
   - **Always set `leading = fontSize * 1.25` to `fontSize * 1.35`**.
3. **Keep Headings with Next Paragraph**:
   - Always set `keepWithNext=True` on all heading styles to prevent orphan titles stranded at the bottom of pages.
4. **Two-Pass Numbered Canvas ("Page X of Y")**:
   - Use a custom `canvas.Canvas` subclass that records total pages on pass 1 and draws running footers on pass 2.
5. **No Pure Black on White**:
   - Use `#0F172A` (Slate Navy) for headings and `#1E293B` / `#334155` for body text.

---

## 2. Color Palette Constants (Hex & HexColor)

```python
from reportlab.lib.colors import HexColor

COLOR_PRIMARY = HexColor("#0F2942")     # Deep Executive Navy
COLOR_SECONDARY = HexColor("#2563EB")   # Bright Blue Accent
COLOR_TEXT_DARK = HexColor("#1E293B")   # Slate Body Text
COLOR_TEXT_MUTED = HexColor("#64748B")  # Slate Subtitle / Captions
COLOR_BG_CARD = HexColor("#F8FAFC")     # Soft Container Fill
COLOR_BG_ZEBRA = HexColor("#F1F5F9")    # Alternating Table Row
COLOR_BORDER = HexColor("#E2E8F0")      # Subtle Hairline Rule
COLOR_WHITE = HexColor("#FFFFFF")
```

---

## 3. ReportLab Platypus Implementation Guide

### A. Numbered Canvas for "Page X of Y" and Running Headers

```python
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
```

### B. Complete Document Assembly Recipe

```python
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
```

---

## 4. Render-and-Inspect Loop

```bash
# 1. Render all PDF pages into PNG images (150 DPI)
pdftoppm -png -r 150 executive_brief.pdf page_preview

# 2. Inspect page_preview-1.png, page_preview-2.png:
#    - Does the document fit cleanly on the intended page count?
#    - Are headings tied to their paragraphs (no orphaned headings)?
#    - Is leading proportional with no overlapping glyphs?
```
