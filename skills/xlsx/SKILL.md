---
name: xlsx
description: Executive-grade spreadsheet (.xlsx) design, financial modeling, and data formatting using openpyxl and pandas. Covers color schemes, number formatting, zebra striping, KPI cards, formulas, column auto-width, native charts, and the render-and-inspect visual validation loop.
---

# XLSX Professional Spreadsheet Design & Modeling

This skill guides the creation of executive-ready, publication-grade Excel workbooks (`.xlsx`). Raw, unformatted spreadsheets with default fonts, unaligned numbers, and missing gridlines look sloppy. Every spreadsheet must be structured like a polished financial dashboard with intentional typography, deliberate number formats, clean headers, and automated column sizing.

---

## 1. Golden Rules of Spreadsheet Craftsmanship

1. **Explicit Formatting for Every Number**:
   - Currency: `"$#,##0"` or `"$#,##0.00"`
   - Percentages: `"0.0%"` or `"0.00%"`
   - Quantities / Integers: `"#,##0"`
   - Dates: `"YYYY-MM-DD"`
   - Text is left-aligned; Numbers are right-aligned; Status / Dates are centered.
2. **Explicit Gridlines**:
   - Excel often hides gridlines when cell background fills are applied. Always explicitly enable gridlines:
     `ws.views.sheetView[0].showGridLines = True`
3. **Never Hardcode Calculable Values**:
   - Use uppercase formulas: `=SUM(C5:C12)`, `=AVERAGE(D5:D20)`, `=IFERROR(A1/B1, 0)`.
4. **Auto-Fit Column Widths with Safety Margins**:
   - Never let values render as `###`. Calculate max string length per column and add **+3 to +4 character padding**.
5. **Standardized Row Heights**:
   - Title Row: 32–36 pt
   - KPI / Summary Row: 28–32 pt
   - Table Header: 24–28 pt
   - Data Rows: 20–22 pt

---

## 2. Executive Color Palette Tokens (Hex)

- **Header Fill**: `#0F172A` (Slate Navy) with `#FFFFFF` Bold Text
- **Sub-header / Category Fill**: `#F1F5F9` with `#1E293B` Bold Text
- **Zebra Row Even**: `#FFFFFF`
- **Zebra Row Odd**: `#F8FAFC` (Light Slate Tint)
- **KPI Card Background**: `#F8FAFC` with `#E2E8F0` Border
- **Accent Green (Positive)**: Text `#15803D`, Fill `#DCFCE7`
- **Accent Red (Alert)**: Text `#B91C1C`, Fill `#FEE2E2`

---

## 3. Openpyxl Implementation Guide

```python
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
```

---

## 4. Render-and-Inspect Loop

Always verify the Excel output visually:

```bash
# 1. Convert XLSX to PDF
libreoffice --headless --convert-to pdf executive_report.xlsx

# 2. Render sheet to PNG
pdftoppm -png -r 150 executive_report.pdf sheet_preview

# 3. Inspect sheet_preview-1.png:
#    - Are column widths adequate (no "###" displayed)?
#    - Do formulas evaluate properly?
#    - Are gridlines visible and alignment crisp?
```
