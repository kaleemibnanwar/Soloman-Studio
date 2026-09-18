// Hand-authored office-open PPTX templates that extend PPT_TEMPLATES
// (office_pptx_templates.ts, generated from src/document_templates/presentations)
// with a couple more common use cases. Written directly against the
// office-open SlideOptions JSON shape (shape/table children with absolute
// EMU positioning) rather than parsed from a source .pptx. Brand colors use
// the "slate" scheme's hex values and are registered in
// office_template_roles.ts (PPT_TEMPLATE_ROLES) so `recolor` can swap them.

const PRIMARY = "0B2545";
const PRIMARY_TEXT = "FFFFFF";
const SECONDARY = "3E7CB1";
const SURFACE = "F2F4F7";
const MUTED = "5B6570";

// Standard 16:9 widescreen slide: 13.333in x 7.5in, in EMU (914400/in).
const W = 12192000;
const H = 6858000;
const MARGIN = 685800; // 0.75in
const CONTENT_W = W - MARGIN * 2;

function titleSlide(eyebrow: string, title: string, subtitle: string, meta: string) {
  return {
    children: [
      { shape: { x: 0, y: 0, width: W, height: H, geometry: "rect", fill: { type: "solid", color: PRIMARY }, outline: {} } },
      {
        shape: {
          x: MARGIN,
          y: H / 2 - 900000,
          width: CONTENT_W,
          height: 400000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: {
            paragraphs: [{ children: [{ text: eyebrow, bold: true, size: 12, fill: { type: "solid", color: SECONDARY } }] }],
          },
        },
      },
      {
        shape: {
          x: MARGIN,
          y: H / 2 - 500000,
          width: CONTENT_W,
          height: 900000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: title, bold: true, size: 40, fill: { type: "solid", color: PRIMARY_TEXT } }] }] },
        },
      },
      {
        shape: {
          x: MARGIN,
          y: H / 2 + 500000,
          width: CONTENT_W,
          height: 500000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: subtitle, size: 16, fill: { type: "solid", color: "D6E0EA" } }] }] },
        },
      },
      {
        shape: {
          x: MARGIN,
          y: H - 900000,
          width: CONTENT_W,
          height: 300000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: meta, size: 11, fill: { type: "solid", color: "9DB3C4" } }] }] },
        },
      },
    ],
  };
}

function bulletSlide(title: string, items: string[]) {
  return {
    children: [
      { shape: { x: 0, y: 0, width: W, height: 130000, geometry: "rect", fill: { type: "solid", color: PRIMARY } } },
      {
        shape: {
          x: MARGIN,
          y: 500000,
          width: CONTENT_W,
          height: 700000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: title, bold: true, size: 28, fill: { type: "solid", color: PRIMARY } }] }] },
        },
      },
      {
        shape: {
          x: MARGIN,
          y: 1500000,
          width: CONTENT_W,
          height: H - 2000000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: {
            paragraphs: items.map((text) => ({
              properties: { bullet: { type: "char", char: "•" }, indent: -228600, marginIndent: 228600, spaceAfter: 12 },
              children: [{ text, size: 16, fill: { type: "solid", color: "2B2B2B" } }],
            })),
          },
        },
      },
    ],
  };
}

function statSlide(title: string, stats: { value: string; label: string }[]) {
  const boxW = (CONTENT_W - MARGIN * (stats.length - 1)) / stats.length;
  return {
    children: [
      { shape: { x: 0, y: 0, width: W, height: 130000, geometry: "rect", fill: { type: "solid", color: PRIMARY } } },
      {
        shape: {
          x: MARGIN,
          y: 500000,
          width: CONTENT_W,
          height: 700000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: title, bold: true, size: 28, fill: { type: "solid", color: PRIMARY } }] }] },
        },
      },
      ...stats.map((s, i) => ({
        shape: {
          x: MARGIN + i * (boxW + MARGIN),
          y: 2000000,
          width: boxW,
          height: 1900000,
          geometry: "rect",
          fill: { type: "solid", color: SURFACE },
          outline: {},
          textBody: {
            bodyProperties: { anchor: "center" },
            paragraphs: [
              { properties: { alignment: "center" }, children: [{ text: s.value, bold: true, size: 32, fill: { type: "solid", color: PRIMARY } }] },
              { properties: { alignment: "center" }, children: [{ text: s.label, size: 12, fill: { type: "solid", color: MUTED } }] },
            ],
          },
        },
      })),
    ],
  };
}

function tableSlide(title: string, columnWidths: number[], header: string[], rows: string[][]) {
  return {
    children: [
      { shape: { x: 0, y: 0, width: W, height: 130000, geometry: "rect", fill: { type: "solid", color: PRIMARY } } },
      {
        shape: {
          x: MARGIN,
          y: 500000,
          width: CONTENT_W,
          height: 700000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: { paragraphs: [{ children: [{ text: title, bold: true, size: 28, fill: { type: "solid", color: PRIMARY } }] }] },
        },
      },
      {
        table: {
          x: MARGIN,
          y: 1600000,
          width: CONTENT_W,
          height: H - 2200000,
          columnWidths,
          rows: [
            { cells: header.map((text) => ({ text, fill: { type: "solid", color: PRIMARY } })) },
            ...rows.map((cells) => ({ cells: cells.map((text) => ({ text })) })),
          ],
        },
      },
    ],
  };
}

function closingSlide(title: string, subtitle: string) {
  return {
    children: [
      { shape: { x: 0, y: 0, width: W, height: H, geometry: "rect", fill: { type: "solid", color: PRIMARY }, outline: {} } },
      {
        shape: {
          x: MARGIN,
          y: H / 2 - 500000,
          width: CONTENT_W,
          height: 800000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: {
            bodyProperties: { anchor: "center" },
            paragraphs: [{ properties: { alignment: "center" }, children: [{ text: title, bold: true, size: 36, fill: { type: "solid", color: PRIMARY_TEXT } }] }],
          },
        },
      },
      {
        shape: {
          x: MARGIN,
          y: H / 2 + 300000,
          width: CONTENT_W,
          height: 500000,
          geometry: "rect",
          fill: { type: "none" },
          textBody: {
            bodyProperties: { anchor: "center" },
            paragraphs: [{ properties: { alignment: "center" }, children: [{ text: subtitle, size: 16, fill: { type: "solid", color: "D6E0EA" } }] }] ,
          },
        },
      },
    ],
  };
}

const presentationUpdate = {
  title: "Business Update Presentation",
  size: "16:9",
  masters: undefined,
  slides: [
    titleSlide(
      "STATUS UPDATE",
      "[Project / Team Name]",
      "[One-line summary of what this update covers]",
      "[Presenter Name]  •  [Date]",
    ),
    statSlide("Highlights", [
      { value: "[92%]", label: "[Metric one]" },
      { value: "[$1.2M]", label: "[Metric two]" },
      { value: "[+18%]", label: "[Metric three]" },
    ]),
    tableSlide(
      "Progress by Workstream",
      [4200000, 3200000, 3420000],
      ["Workstream", "Status", "Owner"],
      [
        ["[Workstream one]", "[On track]", "[Owner]"],
        ["[Workstream two]", "[At risk]", "[Owner]"],
        ["[Workstream three]", "[On track]", "[Owner]"],
      ],
    ),
    bulletSlide("Risks & Blockers", [
      "[First risk or blocker and its potential impact.]",
      "[Second risk or blocker.]",
      "[Mitigation plan or ask for help.]",
    ]),
    bulletSlide("Next Steps", [
      "[First next step, with owner and target date.]",
      "[Second next step.]",
      "[Third next step.]",
    ]),
    closingSlide("Questions?", "[Contact / follow-up details]"),
  ],
};

const presentationTraining = {
  title: "Training Workshop Presentation",
  size: "16:9",
  masters: undefined,
  slides: [
    titleSlide(
      "TRAINING",
      "[Workshop / Course Title]",
      "[One-line description of what attendees will learn]",
      "[Facilitator Name]  •  [Date]",
    ),
    bulletSlide("Learning Objectives", [
      "[By the end of this session, attendees will be able to ...]",
      "[Second learning objective.]",
      "[Third learning objective.]",
    ]),
    bulletSlide("Agenda", [
      "[00:00 — Introduction]",
      "[00:15 — Topic one]",
      "[00:45 — Hands-on exercise]",
      "[01:15 — Q&A and wrap-up]",
    ]),
    statSlide("Section 1: [Topic Name]", [
      { value: "01", label: "[Key concept one]" },
      { value: "02", label: "[Key concept two]" },
      { value: "03", label: "[Key concept three]" },
    ]),
    bulletSlide("Key Takeaways", [
      "[First key takeaway from this section.]",
      "[Second key takeaway.]",
      "[Third key takeaway.]",
    ]),
    closingSlide("Thank You", "Questions?  •  [Contact / resources link]"),
  ],
};

export const PPT_TEMPLATES_EXTRA: Record<
  string,
  { title: string; size: unknown; masters: unknown; slides: unknown[] }
> = {
  presentation_update: presentationUpdate,
  presentation_training: presentationTraining,
};
