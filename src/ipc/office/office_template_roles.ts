// Per-template hex -> semantic color role maps, consumed by `recolor` in
// office_theme.ts. Keys are the exact uppercase hex values each template's
// generated JSON uses for its brand colors (found by inspecting
// office_templates.ts / office_pptx_templates.ts / office_xlsx_templates.ts);
// values are the role that hex plays in that design. Structural inks
// (pure black/white/mid grays used for body text) are deliberately left
// unmapped so recoloring only touches a template's actual brand colors.
import type { TemplateColorRoles } from "./office_theme";

export const DOC_TEMPLATE_ROLES: Record<string, TemplateColorRoles> = {
  business_proposal_template: {
    "1F4E5F": "primary",
    EAF1F3: "surface",
    "666666": "muted",
    "555555": "muted",
    "444444": "muted",
    "888888": "muted",
    "999999": "border",
    FFFFFF: "primaryText",
  },
  professional_report_template: {
    "0B2545": "primary",
    F2F4F7: "surface",
    CBD5E1: "primaryText",
    "999999": "border",
    "555555": "muted",
    FFFFFF: "primaryText",
  },
  report_design1_minimalist: {
    "1A1A1A": "primary",
    "8A8A8A": "muted",
    DDDDDD: "border",
    CCCCCC: "border",
  },
  report_design3_corporate: {
    "5B1A18": "primary",
    "9C7A3C": "secondary",
    F7F3EC: "surface",
    "555555": "muted",
    "666666": "muted",
    FFFFFF: "primaryText",
  },
  research_proposal_template: {
    "2C2C2C": "primary",
    "1A1A1A": "primary",
    E8E6E1: "surface",
    "777777": "muted",
    "555555": "muted",
    "444444": "muted",
    "999999": "border",
  },
  // Hand-authored templates in office_docx_templates_extra.ts, built directly
  // on the "slate" scheme's hex values.
  invoice_template: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  resume_template: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  meeting_minutes_template: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
};

export const PPT_TEMPLATE_ROLES: Record<string, TemplateColorRoles> = {
  presentation_idea: {
    "2A3A36": "primary",
    "84B59F": "secondary",
    "69A297": "secondary",
    "50808E": "secondary",
    C9D9D2: "surface",
    F0F5F3: "surface",
    E5EFEC: "surface",
  },
  presentation_pitch: {
    F96167: "primary",
    "233066": "primary",
    "2F3C7E": "secondary",
    F9E795: "secondary",
    FFF7F0: "surface",
    CBD3F0: "surface",
    "9AA6D6": "surface",
  },
  presentation_academic: {
    "36454F": "primary",
    "8C9BA5": "secondary",
    F2F2F2: "surface",
    E5E5E5: "surface",
  },
  // Hand-authored templates in office_pptx_templates_extra.ts, built directly
  // on the "slate" scheme's hex values.
  presentation_update: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    "3E7CB1": "secondary",
    F2F4F7: "surface",
    "5B6570": "muted",
  },
  presentation_training: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    "3E7CB1": "secondary",
    F2F4F7: "surface",
    "5B6570": "muted",
  },
};

// Populated to match the initial ("slate") hex values baked into the
// hand-authored xlsx templates in office_xlsx_templates.ts.
export const XLSX_TEMPLATE_ROLES: Record<string, TemplateColorRoles> = {
  budget_tracker: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  invoice_workbook_template: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  project_tracker: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  expense_report: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
  timesheet_template: {
    "0B2545": "primary",
    FFFFFF: "primaryText",
    F2F4F7: "surface",
    "5B6570": "muted",
    C7CDD3: "border",
  },
};

// The enterprise templates in office_*_templates_more.ts are all authored
// against the "slate" palette, so they share a single role map per format.
const SLATE_ROLES: TemplateColorRoles = {
  "0B2545": "primary",
  FFFFFF: "primaryText",
  F2F4F7: "surface",
  "5B6570": "muted",
  C7CDD3: "border",
};

const NEW_DOC_TEMPLATES = [
  "nda_template",
  "statement_of_work",
  "offer_letter",
  "press_release",
  "project_charter",
  "business_case",
  "executive_summary",
  "quarterly_business_review",
  "swot_analysis",
  "product_roadmap",
  "memo_template",
  "meeting_agenda",
  "policy_template",
];
for (const name of NEW_DOC_TEMPLATES) DOC_TEMPLATE_ROLES[name] = SLATE_ROLES;

const NEW_PPT_TEMPLATES = [
  "pitch_deck",
  "sales_proposal",
  "investor_update",
  "product_roadmap",
  "strategy_deck",
  "quarterly_review",
  "financial_review",
  "all_hands",
  "onboarding_deck",
  "project_kickoff",
  "retrospective",
  "marketing_plan",
];
for (const name of NEW_PPT_TEMPLATES) {
  PPT_TEMPLATE_ROLES[name] = { ...SLATE_ROLES, "3E7CB1": "secondary" };
}

const NEW_XLSX_TEMPLATES = [
  "financial_forecast",
  "cash_flow_statement",
  "startup_runway",
  "pricing_calculator",
  "sales_pipeline",
  "marketing_budget",
  "kpi_dashboard",
  "inventory_tracker",
  "employee_directory",
  "project_budget",
  "risk_register",
];
for (const name of NEW_XLSX_TEMPLATES) XLSX_TEMPLATE_ROLES[name] = SLATE_ROLES;
