---
name: pptx
description: Professional PowerPoint presentation (.pptx) generation using python-pptx and PptxGenJS. Covers widescreen 16:9 layouts, executive color palettes, modular card containers, native charts, KPI dashboards, and the render-and-inspect visual validation loop.
---

# PPTX Executive Presentation Design & Generation

This skill guides the creation of high-impact, C-suite ready PowerPoint presentations (`.pptx`). Never produce default 4:3 slides, generic bulleted walls of text, or unstyled template shapes. Build code-driven, 16:9 widescreen decks with modular card structures, intentional typographic contrast, and native data visualizations.

---

## 1. Core Presentation Constraints

1. **Widescreen 16:9 Dimensions**: Always set slide dimensions to **13.333 inches wide by 7.5 inches high** (or 1920x1080 equivalent).
2. **Takeaway Action Headlines**:
   - Slide headers must state the key conclusion, not just a category name.
   - _Weak_: "Quarterly Revenue"
   - _Strong_: "Q3 Revenue Grew 38% YoY Driven by Enterprise Expansion"
3. **Modular Card Architecture**:
   - Organize slide body content into **2, 3, or 4 visual container cards**.
   - Each card features a light background fill (`#F8FAFC`), a subtle border (`#E2E8F0`), a bold sub-header, and concise supporting points.
4. **Scannable Metrics**:
   - Highlight key data points with large numbers (36–48pt bold) and small descriptive sub-labels (10–11pt).
5. **No AI Clichés**:
   - Do not scatter random circle icons or numbered bubbles (01, 02, 03) unless describing a real ordered timeline.

---

## 2. Curated Color Palettes (RGB / Hex)

| Theme                | Background Canvas    | Card Container | Primary Action        | Secondary Accent    | Text Dark |
| :------------------- | :------------------- | :------------- | :-------------------- | :------------------ | :-------- |
| **Modern B2B SaaS**  | `#FFFFFF`            | `#F8FAFC`      | `#0F172A` (Navy)      | `#4F46E5` (Indigo)  | `#1E293B` |
| **Executive Wealth** | `#FAF8F5`            | `#FFFFFF`      | `#18181B` (Charcoal)  | `#064E3B` (Emerald) | `#27272A` |
| **Dark Mode Cyber**  | `#0B0F19` (Obsidian) | `#161F30`      | `#8B5CF6` (Violet)    | `#06B6D4` (Cyan)    | `#F8FAFC` |
| **Clean Tech Teal**  | `#FFFFFF`            | `#F0FDF4`      | `#0C4A6E` (Deep Teal) | `#0284C7` (Cobalt)  | `#0F172A` |

---

## 3. Python-pptx Implementation Guide

### A. Initialization & Widescreen Setup

```python
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
```

### B. Standard Slide Header (Kicker + Action Title)

```python
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
```

### C. 3-Card Structured Grid Layout

```python
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
```

### D. Native Styled Chart Creation

```python
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
```

---

## 4. Render-and-Inspect Loop

Always visually verify the slide deck:

```bash
# 1. Convert PPTX to PDF
libreoffice --headless --convert-to pdf presentation.pptx

# 2. Render each slide to PNG
pdftoppm -png -r 150 presentation.pdf slide_preview

# 3. Inspect slide_preview-1.png, slide_preview-2.png, etc.:
#    - Are card boundaries aligned horizontally and vertically?
#    - Does any text wrap onto unwanted extra lines or collide with chart legends?
#    - Is contrast sharp and executive-ready?
```
