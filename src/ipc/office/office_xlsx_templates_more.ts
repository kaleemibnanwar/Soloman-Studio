// Enterprise XLSX templates. Hand-authored against the office-open
// WorkbookOptions shape via the shared builders in builders/xlsx.ts. Brand
// colors use the "slate" scheme's hex values (registered in
// office_template_roles.ts XLSX_TEMPLATE_ROLES so `recolor` can swap them).
// Cells follow the [Placeholder] convention, and formulas are real Excel
// formulas so the generated workbook computes live totals.

import {
  NUM_CURRENCY,
  NUM_NUMBER,
  NUM_PERCENT,
  cell,
  cols,
  dataRow,
  headerRow,
  kvRow,
  labelStyle,
  mutedStyle,
  row,
  subHeaderStyle,
  sumFormula,
  titleRows,
  totalStyle,
} from "./builders/xlsx";

export interface XlsxTemplateDef {
  title: string;
  description: string;
  category: string;
  worksheets: unknown[];
}

// --- Finance ---------------------------------------------------------------

const financialForecast: XlsxTemplateDef = {
  title: "Financial Forecast (P&L)",
  description: "Three-year revenue/cost forecast with gross margin and bottom line.",
  category: "Finance",
  worksheets: [
    {
      name: "Forecast",
      columns: cols([32, 16, 16, 16]),
      rows: [
        ...titleRows("Financial Forecast", "[Company Name] — [Year 1] to [Year 3]"),
        headerRow(["Line Item", "Year 1", "Year 2", "Year 3"]),
        dataRow(
          ["Revenue", 500000, 750000, 1000000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        dataRow(
          ["Cost of Goods Sold", 250000, 350000, 450000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Gross Profit", totalStyle),
          cell(250000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B4-B5" }),
          cell(400000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "C4-C5" }),
          cell(550000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "D4-D5" }),
        ]),
        dataRow(
          ["Operating Expenses", 200000, 250000, 300000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Net Income", totalStyle),
          cell(50000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B6-B7" }),
          cell(150000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "C6-C7" }),
          cell(250000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "D6-D7" }),
        ]),
        row([cell("")]),
        row([cell("[Assumptions: pricing, volume, and cost drivers for each line.]", mutedStyle)]),
      ],
    },
  ],
};

const cashFlowStatement: XlsxTemplateDef = {
  title: "Cash Flow Statement",
  description: "Operating, investing, and financing cash flows by month.",
  category: "Finance",
  worksheets: [
    {
      name: "Cash Flow",
      columns: cols([32, 18, 18, 18]),
      rows: [
        ...titleRows("Cash Flow Statement", "[Company Name] — [Period]"),
        headerRow(["Cash Flow", "Month 1", "Month 2", "Month 3"]),
        row([cell("Operating", subHeaderStyle), cell(""), cell(""), cell("")]),
        dataRow(
          ["Cash received", 120000, 130000, 140000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        dataRow(
          ["Cash paid out", 90000, 95000, 100000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Net operating", { ...labelStyle, font: { bold: true, color: "0B2545", size: 9 } }),
          cell(30000, { numFmt: NUM_CURRENCY, formula: "B5-B6" }),
          cell(35000, { numFmt: NUM_CURRENCY, formula: "C5-C6" }),
          cell(40000, { numFmt: NUM_CURRENCY, formula: "D5-D6" }),
        ]),
        row([cell("Investing", subHeaderStyle), cell(""), cell(""), cell("")]),
        dataRow(
          ["Capital expenditures", 20000, 5000, 10000],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([cell("Financing", subHeaderStyle), cell(""), cell(""), cell("")]),
        dataRow(
          ["Funding raised / (repaid)", 50000, 0, 0],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Net Cash Flow", totalStyle),
          cell(60000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B7-B9+B11" }),
          cell(30000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "C7-C9+C11" }),
          cell(30000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "D7-D9+D11" }),
        ]),
      ],
    },
  ],
};

const startupRunway: XlsxTemplateDef = {
  title: "Startup Runway",
  description: "Monthly burn, cash balance, and months-of-runway projection.",
  category: "Finance",
  worksheets: [
    {
      name: "Runway",
      columns: cols([28, 16, 16, 16, 18]),
      rows: [
        ...titleRows("Runway Analysis", "[Company] — [Start Date] to [End Date]"),
        headerRow(["Metric", "Month 1", "Month 2", "Month 3", "Notes"]),
        dataRow(
          ["Starting cash", 300000, 270000, 240000, ""],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        dataRow(
          ["Revenue", 10000, 12000, 14000, ""],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        dataRow(
          ["Expenses", 40000, 42000, 44000, ""],
          [undefined, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Net burn", { ...labelStyle, color: "B42318" }),
          cell(-30000, { numFmt: NUM_CURRENCY, formula: "B5-B6" }),
          cell(-30000, { numFmt: NUM_CURRENCY, formula: "C5-C6" }),
          cell(-30000, { numFmt: NUM_CURRENCY, formula: "D5-D6" }),
          cell(""),
        ]),
        row([
          cell("Ending cash", totalStyle),
          cell(270000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B4+B7" }),
          cell(240000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "C4+C7" }),
          cell(210000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "D4+D7" }),
          cell(""),
        ]),
        row([cell("")]),
        row([cell("Months of runway remaining: [X]  •  Break-even date: [Date]", mutedStyle)]),
      ],
    },
  ],
};

const pricingCalculator: XlsxTemplateDef = {
  title: "Pricing Calculator",
  description: "Cost-plus and value-based pricing model with margin.",
  category: "Finance",
  worksheets: [
    {
      name: "Pricing",
      columns: cols([30, 18, 18]),
      rows: [
        ...titleRows("Pricing Calculator", "[Product / Service]"),
        kvRow([{ label: "Product", value: "[Name]" }]),
        row([cell("")]),
        headerRow(["Cost Component", "Amount", "Notes"]),
        dataRow(
          ["Variable cost per unit", 25, "[COGS, materials, labor]"],
          [undefined, { numFmt: NUM_CURRENCY }],
        ),
        dataRow(
          ["Fixed cost allocation", 10, "[Overhead per unit]"],
          [undefined, { numFmt: NUM_CURRENCY }],
        ),
        row([
          cell("Total cost per unit", totalStyle),
          cell(35, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B5+B6" }),
          cell("", totalStyle),
        ]),
        row([cell("")]),
        kvRow([{ label: "Target margin", value: "40%" }]),
        row([
          cell("Price per unit (cost ÷ (1 − margin))", totalStyle),
          cell(58.33, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "B7/(1-0.4)" }),
          cell("", totalStyle),
        ]),
        row([cell("")]),
        row([cell("[Adjust margin, volume, or costs to see the price update.]", mutedStyle)]),
      ],
    },
  ],
};

// --- Sales & Marketing -----------------------------------------------------

const salesPipeline: XlsxTemplateDef = {
  title: "Sales Pipeline",
  description: "CRM pipeline with stage, deal size, probability, and weighted value.",
  category: "Sales",
  worksheets: [
    {
      name: "Pipeline",
      columns: cols([28, 14, 16, 14, 16, 12]),
      rows: [
        ...titleRows("Sales Pipeline", "[Team] — [Period]"),
        headerRow(["Deal", "Stage", "Amount", "Probability", "Weighted", "Close Date"]),
        dataRow(
          ["[Account one]", "Proposal", 25000, 0.5, 12500, "[Date]"],
          [
            undefined,
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_CURRENCY, formula: "C5*D5" },
          ],
        ),
        dataRow(
          ["[Account two]", "Negotiation", 40000, 0.7, 28000, "[Date]"],
          [
            undefined,
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_CURRENCY, formula: "C6*D6" },
          ],
        ),
        dataRow(
          ["[Account three]", "Discovery", 12000, 0.2, 2400, "[Date]"],
          [
            undefined,
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_CURRENCY, formula: "C7*D7" },
          ],
        ),
        dataRow(
          ["[Account four]", "Closed Won", 18000, 1, 18000, "[Date]"],
          [
            undefined,
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_CURRENCY, formula: "C8*D8" },
          ],
        ),
        row([
          cell("Total", totalStyle),
          cell(""),
          cell(95000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(3, 5, 8) }),
          cell(""),
          cell(60900, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(5, 5, 8) }),
          cell("", totalStyle),
        ]),
      ],
    },
  ],
};

const marketingBudget: XlsxTemplateDef = {
  title: "Marketing Budget",
  description: "Channel-level marketing budget vs. spend with variance.",
  category: "Marketing",
  worksheets: [
    {
      name: "Marketing",
      columns: cols([28, 16, 16, 16]),
      rows: [
        ...titleRows("Marketing Budget", "[Company] — [Period]"),
        headerRow(["Channel", "Budget", "Spend", "Variance"]),
        dataRow(
          ["Paid search", 20000, 18500, 1500],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B5-C5" },
          ],
        ),
        dataRow(
          ["Social ads", 15000, 16200, -1200],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B6-C6" },
          ],
        ),
        dataRow(
          ["Content / SEO", 8000, 7500, 500],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B7-C7" },
          ],
        ),
        dataRow(
          ["Events", 12000, 11000, 1000],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B8-C8" },
          ],
        ),
        row([
          cell("Total", totalStyle),
          cell(55000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(2, 5, 8) }),
          cell(53200, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(3, 5, 8) }),
          cell(1800, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(4, 5, 8) }),
        ]),
      ],
    },
  ],
};

const kpiDashboard: XlsxTemplateDef = {
  title: "KPI Dashboard",
  description: "Monthly KPI tracking vs. targets with status.",
  category: "Analytics",
  worksheets: [
    {
      name: "KPIs",
      columns: cols([30, 16, 16, 16, 20]),
      rows: [
        ...titleRows("KPI Dashboard", "[Company / Team] — [Month]"),
        headerRow(["Metric", "Target", "Actual", "Delta", "Status"]),
        dataRow(
          ["Monthly recurring revenue", 100000, 104000, 4000, "[On track]"],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "C5-B5" },
          ],
        ),
        dataRow(
          ["New customers", 50, 47, -3, "[Behind]"],
          [
            undefined,
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER, formula: "C6-B6" },
          ],
        ),
        dataRow(
          ["Churn rate", 0.03, 0.025, -0.005, "[On track]"],
          [
            undefined,
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_PERCENT },
            { numFmt: NUM_PERCENT, formula: "C7-B7" },
          ],
        ),
        dataRow(
          ["Net promoter score", 40, 44, 4, "[On track]"],
          [
            undefined,
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER, formula: "C8-B8" },
          ],
        ),
      ],
    },
  ],
};

// --- Operations ------------------------------------------------------------

const inventoryTracker: XlsxTemplateDef = {
  title: "Inventory Tracker",
  description: "SKU-level inventory with reorder points and stock status.",
  category: "Operations",
  worksheets: [
    {
      name: "Inventory",
      columns: cols([28, 14, 14, 14, 14, 16]),
      rows: [
        ...titleRows("Inventory Tracker", "[Warehouse / Store] — [Date]"),
        headerRow(["SKU / Item", "On Hand", "Reorder Point", "On Order", "Status", "Unit Cost"]),
        dataRow(
          ["[Item one]", 120, 50, 0, "OK", 12.5],
          [
            undefined,
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            undefined,
            { numFmt: NUM_CURRENCY },
          ],
        ),
        dataRow(
          ["[Item two]", 30, 50, 60, "Reorder", 8.0],
          [
            undefined,
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            undefined,
            { numFmt: NUM_CURRENCY },
          ],
        ),
        dataRow(
          ["[Item three]", 0, 25, 100, "Out of stock", 4.25],
          [
            undefined,
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            { numFmt: NUM_NUMBER },
            undefined,
            { numFmt: NUM_CURRENCY },
          ],
        ),
        row([
          cell("Total value", totalStyle),
          cell("", totalStyle),
          cell("", totalStyle),
          cell("", totalStyle),
          cell("", totalStyle),
          cell(0, { ...totalStyle, numFmt: NUM_CURRENCY, formula: "SUMPRODUCT(B5:B7,F5:F7)" }),
        ]),
      ],
    },
  ],
};

const employeeDirectory: XlsxTemplateDef = {
  title: "Employee Directory",
  description: "Team roster with role, department, location, and contact.",
  category: "HR",
  worksheets: [
    {
      name: "Directory",
      columns: cols([20, 16, 16, 16, 18, 22]),
      rows: [
        ...titleRows("Employee Directory", "[Company Name]"),
        headerRow(["Name", "Title", "Department", "Location", "Email", "Manager"]),
        dataRow(["[Name]", "[Title]", "[Dept]", "[City]", "[Email]", "[Manager]"]),
        dataRow(["[Name]", "[Title]", "[Dept]", "[City]", "[Email]", "[Manager]"]),
        dataRow(["[Name]", "[Title]", "[Dept]", "[City]", "[Email]", "[Manager]"]),
        dataRow(["[Name]", "[Title]", "[Dept]", "[City]", "[Email]", "[Manager]"]),
      ],
    },
  ],
};

const projectBudget: XlsxTemplateDef = {
  title: "Project Budget",
  description: "Project cost breakdown by category with budget vs. actual.",
  category: "Project Management",
  worksheets: [
    {
      name: "Budget",
      columns: cols([28, 16, 16, 16]),
      rows: [
        ...titleRows("Project Budget", "[Project Name]"),
        headerRow(["Category", "Budget", "Actual", "Variance"]),
        dataRow(
          ["Personnel", 60000, 58000, 2000],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B5-C5" },
          ],
        ),
        dataRow(
          ["Software / tools", 8000, 9200, -1200],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B6-C6" },
          ],
        ),
        dataRow(
          ["Travel & expenses", 5000, 4200, 800],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B7-C7" },
          ],
        ),
        dataRow(
          ["Contingency", 10000, 6000, 4000],
          [
            undefined,
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY },
            { numFmt: NUM_CURRENCY, formula: "B8-C8" },
          ],
        ),
        row([
          cell("Total", totalStyle),
          cell(83000, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(2, 5, 8) }),
          cell(77400, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(3, 5, 8) }),
          cell(5600, { ...totalStyle, numFmt: NUM_CURRENCY, formula: sumFormula(4, 5, 8) }),
        ]),
      ],
    },
  ],
};

const riskRegister: XlsxTemplateDef = {
  title: "Risk Register",
  description: "Project/enterprise risk log with likelihood, impact, and mitigation.",
  category: "Project Management",
  worksheets: [
    {
      name: "Risks",
      columns: cols([30, 14, 14, 16, 30]),
      rows: [
        ...titleRows("Risk Register", "[Project / Program]"),
        headerRow(["Risk", "Likelihood", "Impact", "Score", "Mitigation"]),
        dataRow(["[Risk description]", "High", "High", 9, "[Mitigation / owner]"]),
        dataRow(["[Risk description]", "Medium", "High", 6, "[Mitigation / owner]"]),
        dataRow(["[Risk description]", "Low", "Medium", 2, "[Mitigation / owner]"]),
        row([cell("Scoring: High=3, Medium=2, Low=1. Score = Likelihood × Impact.", mutedStyle)]),
      ],
    },
  ],
};

export const XLSX_TEMPLATES_MORE: Record<string, XlsxTemplateDef> = {
  financial_forecast: financialForecast,
  cash_flow_statement: cashFlowStatement,
  startup_runway: startupRunway,
  pricing_calculator: pricingCalculator,
  sales_pipeline: salesPipeline,
  marketing_budget: marketingBudget,
  kpi_dashboard: kpiDashboard,
  inventory_tracker: inventoryTracker,
  employee_directory: employeeDirectory,
  project_budget: projectBudget,
  risk_register: riskRegister,
};
