// Hand-authored office-open DOCX templates that extend DOC_TEMPLATES
// (office_templates.ts, generated from src/document_templates/docs) with a
// few more common use cases. Written directly against the office-open
// SectionOptions JSON shape rather than parsed from a source .docx. Brand
// colors use the "slate" scheme's hex values and are registered in
// office_template_roles.ts (DOC_TEMPLATE_ROLES) so `recolor` can swap them.
// Fields follow the [Placeholder] convention used by the generated templates.

const PRIMARY = "0B2545";
const PRIMARY_TEXT = "FFFFFF";
const SURFACE = "F2F4F7";
const MUTED = "5B6570";
const BORDER = "C7CDD3";

const PAGE = {
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
};

function h1(text: string) {
  return {
    paragraph: {
      heading: "Heading1",
      spacing: { after: 100 },
      children: [{ text, bold: true, color: PRIMARY }],
    },
  };
}
function p(text: string, opts: Record<string, unknown> = {}) {
  return {
    paragraph: {
      spacing: { after: 160 },
      children: [{ text, size: 10.5, ...opts }],
    },
  };
}
function bullet(text: string, ref = "list_1") {
  return {
    paragraph: {
      style: "ListParagraph",
      spacing: { after: 60 },
      numbering: { reference: ref, level: 0, autoStyle: false },
      children: [{ text, size: 10.5 }],
    },
  };
}
function rule() {
  return {
    paragraph: {
      spacing: { after: 200 },
      border: { bottom: { style: "single", color: PRIMARY, size: 6, space: 4 } },
    },
  };
}
function headerCell(text: string, width: number) {
  return {
    width: { size: width, type: "twips" },
    shading: { fill: PRIMARY, color: "auto", type: "clear" },
    margins: {
      top: { size: 80, type: "twips" },
      left: { size: 120, type: "twips" },
      bottom: { size: 80, type: "twips" },
      right: { size: 120, type: "twips" },
    },
    children: [{ paragraph: { children: [{ text, bold: true, color: PRIMARY_TEXT, size: 9 }] } }],
  };
}
function dataCell(text: string, width: number, opts: Record<string, unknown> = {}) {
  return {
    width: { size: width, type: "twips" },
    margins: {
      top: { size: 80, type: "twips" },
      left: { size: 120, type: "twips" },
      bottom: { size: 80, type: "twips" },
      right: { size: 120, type: "twips" },
    },
    children: [{ paragraph: { children: [{ text, size: 9, ...opts }] } }],
  };
}
function dataCellLines(lines: string[], width: number, opts: Record<string, unknown> = {}) {
  return {
    width: { size: width, type: "twips" },
    margins: {
      top: { size: 80, type: "twips" },
      left: { size: 120, type: "twips" },
      bottom: { size: 80, type: "twips" },
      right: { size: 120, type: "twips" },
    },
    children: lines.map((text) => ({
      paragraph: { spacing: { after: 20 }, children: [{ text, size: 9, ...opts }] },
    })),
  };
}
function subHeaderCell(text: string, width: number) {
  return {
    width: { size: width, type: "twips" },
    shading: { fill: SURFACE, color: "auto", type: "clear" },
    margins: {
      top: { size: 80, type: "twips" },
      left: { size: 120, type: "twips" },
      bottom: { size: 80, type: "twips" },
      right: { size: 120, type: "twips" },
    },
    children: [
      {
        paragraph: {
          children: [{ text, bold: true, color: PRIMARY, size: 8, characterSpacing: 8 }],
        },
      },
    ],
  };
}
function table(columnWidths: number[], rows: unknown[][]) {
  return {
    table: {
      width: { size: columnWidths.reduce((a, b) => a + b, 0), type: "twips" },
      borders: {
        top: { style: "single", color: BORDER, size: 4 },
        left: { style: "single", color: BORDER, size: 4 },
        bottom: { style: "single", color: BORDER, size: 4 },
        right: { style: "single", color: BORDER, size: 4 },
        insideHorizontal: { style: "single", color: BORDER, size: 4 },
        insideVertical: { style: "single", color: BORDER, size: 4 },
      },
      columnWidths,
      rows: rows.map((cells) => ({ cells })),
    },
  };
}
function spacer(after = 160) {
  return { paragraph: { spacing: { after } } };
}

const invoiceTemplate = {
  title: "Invoice_Template",
  sections: [
    {
      properties: PAGE,
      children: [
        {
          paragraph: {
            spacing: { after: 40 },
            children: [{ text: "INVOICE", bold: true, color: PRIMARY, size: 24 }],
          },
        },
        p("[Your Company Name]  •  [Address]  •  [Email / Phone]", { color: MUTED, size: 9 }),
        rule(),
        table(
          [5040, 5040],
          [
            [subHeaderCell("BILL TO", 5040), subHeaderCell("INVOICE DETAILS", 5040)],
            [
              dataCellLines(["[Client Name]", "[Client Address]", "[Client Email]"], 5040),
              dataCellLines(
                ["Invoice #: [INV-0001]", "Date: [Issue Date]", "Due: [Due Date]"],
                5040,
              ),
            ],
          ],
        ),
        spacer(200),
        h1("Items"),
        table(
          [5760, 1440, 1440, 1440],
          [
            [
              headerCell("Description", 5760),
              headerCell("Qty", 1440),
              headerCell("Rate", 1440),
              headerCell("Amount", 1440),
            ],
            [
              dataCell("[Service / item one]", 5760),
              dataCell("1", 1440),
              dataCell("[$ rate]", 1440),
              dataCell("[$ amount]", 1440),
            ],
            [
              dataCell("[Service / item two]", 5760),
              dataCell("1", 1440),
              dataCell("[$ rate]", 1440),
              dataCell("[$ amount]", 1440),
            ],
            [
              { ...dataCell("", 5760), shading: { fill: SURFACE, color: "auto", type: "clear" } },
              { ...dataCell("", 1440), shading: { fill: SURFACE, color: "auto", type: "clear" } },
              {
                ...dataCell("Total", 1440, { bold: true }),
                shading: { fill: SURFACE, color: "auto", type: "clear" },
              },
              {
                ...dataCell("[$ total]", 1440, { bold: true }),
                shading: { fill: SURFACE, color: "auto", type: "clear" },
              },
            ],
          ],
        ),
        spacer(200),
        h1("Payment"),
        p(
          "[Payment instructions, bank / wallet details, and terms (e.g. Net 30). Thank you for your business.]",
        ),
      ],
      headers: {
        default: [
          {
            paragraph: {
              alignment: "right",
              children: [{ text: "[Your Company Name]", color: MUTED, size: 8 }],
            },
          },
        ],
        partNames: { default: "header1.xml" },
      },
      footers: {
        default: [
          {
            paragraph: {
              alignment: "center",
              children: [{ text: "[Email]  •  [Phone]  •  [Website]", color: MUTED, size: 8 }],
            },
          },
        ],
        partNames: { default: "footer1.xml" },
      },
    },
  ],
};

const resumeTemplate = {
  title: "Resume_Template",
  sections: [
    {
      properties: PAGE,
      children: [
        {
          paragraph: {
            spacing: { after: 20 },
            children: [{ text: "[Full Name]", bold: true, color: PRIMARY, size: 24 }],
          },
        },
        p(
          "[Professional Title]  •  [Email]  •  [Phone]  •  [Location]  •  [Portfolio / LinkedIn URL]",
          { color: MUTED, size: 9 },
        ),
        rule(),
        h1("Summary"),
        p(
          "[2-3 sentence summary of experience, strengths, and the kind of role you're targeting.]",
        ),
        h1("Experience"),
        p("[Job Title] — [Company Name]", { bold: true, color: PRIMARY, size: 11 }),
        p("[Start Date] – [End Date]  •  [Location]", { color: MUTED, size: 9 }),
        bullet("[Accomplishment one, quantified with a metric where possible.]"),
        bullet("[Accomplishment two.]"),
        bullet("[Accomplishment three.]"),
        spacer(120),
        p("[Job Title] — [Company Name]", { bold: true, color: PRIMARY, size: 11 }),
        p("[Start Date] – [End Date]  •  [Location]", { color: MUTED, size: 9 }),
        bullet("[Accomplishment one.]"),
        bullet("[Accomplishment two.]"),
        spacer(160),
        h1("Education"),
        p("[Degree, Institution] — [Graduation Year]"),
        h1("Skills"),
        p("[Skill one] • [Skill two] • [Skill three] • [Skill four] • [Skill five]"),
      ],
    },
  ],
};

const meetingMinutesTemplate = {
  title: "Meeting_Minutes_Template",
  sections: [
    {
      properties: PAGE,
      children: [
        {
          paragraph: {
            spacing: { after: 40 },
            children: [{ text: "Meeting Minutes", bold: true, color: PRIMARY, size: 22 }],
          },
        },
        p("[Meeting Title]", { color: MUTED, italic: true, size: 11 }),
        rule(),
        table(
          [5040, 5040],
          [
            [dataCell("Date: [Date]", 5040), dataCell("Time: [Time]", 5040)],
            [dataCell("Location: [Location / Link]", 5040), dataCell("Facilitator: [Name]", 5040)],
          ],
        ),
        spacer(160),
        h1("Attendees"),
        p("[Name one], [Name two], [Name three], [Name four]"),
        h1("Agenda"),
        bullet("[Agenda item one]"),
        bullet("[Agenda item two]"),
        bullet("[Agenda item three]"),
        spacer(120),
        h1("Discussion"),
        p("[Summary of key discussion points, decisions made, and rationale.]"),
        h1("Action Items"),
        table(
          [4320, 2880, 2880],
          [
            [headerCell("Action", 4320), headerCell("Owner", 2880), headerCell("Due Date", 2880)],
            [
              dataCell("[Action item one]", 4320),
              dataCell("[Owner]", 2880),
              dataCell("[Date]", 2880),
            ],
            [
              dataCell("[Action item two]", 4320),
              dataCell("[Owner]", 2880),
              dataCell("[Date]", 2880),
            ],
          ],
        ),
        spacer(160),
        h1("Next Meeting"),
        p("[Date / time of next meeting, if scheduled.]"),
      ],
    },
  ],
};

export const DOC_TEMPLATES_EXTRA: Record<string, { title: string; sections: unknown }> = {
  invoice_template: invoiceTemplate,
  resume_template: resumeTemplate,
  meeting_minutes_template: meetingMinutesTemplate,
};
