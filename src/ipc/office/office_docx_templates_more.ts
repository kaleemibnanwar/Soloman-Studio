// Enterprise DOCX templates. Hand-authored against the office-open
// SectionOptions shape via the shared builders in builders/docx.ts. Brand
// colors use the "slate" scheme's hex values (registered in
// office_template_roles.ts DOC_TEMPLATE_ROLES so `recolor` can swap them), and
// text fields follow the [Placeholder] convention consumed by applyPlaceholders.
//
// Each template carries `description` + `category` so `read_office_template`
// can present a browsable, grouped catalog instead of a flat name list.

import {
  PORTRAIT_PAGE,
  brandFooter,
  brandHeader,
  bullet,
  dataCell,
  dataCellLines,
  h1,
  headerCell,
  p,
  spacer,
  subHeaderCell,
  table,
  titleBlock,
} from "./builders/docx";

export interface DocxTemplateDef {
  title: string;
  description: string;
  category: string;
  sections: unknown;
}

function section(children: unknown[]) {
  return {
    properties: PORTRAIT_PAGE,
    headers: brandHeader("[Company Name]"),
    footers: brandFooter("[Company Name]", "[Email]  •  [Phone]"),
    children,
  };
}

// --- Legal -----------------------------------------------------------------

const ndaTemplate: DocxTemplateDef = {
  title: "Non-Disclosure Agreement",
  description: "Mutual NDA with confidentiality, term, and return-of-materials clauses.",
  category: "Legal",
  sections: [
    section([
      ...titleBlock("NON-DISCLOSURE AGREEMENT", "Mutual Confidentiality"),
      p(
        'This Non-Disclosure Agreement (the "Agreement") is entered into as of [Effective Date] by and between:',
      ),
      p("(1) [Disclosing Party Name], with an address at [Disclosing Party Address]; and"),
      p("(2) [Receiving Party Name], with an address at [Receiving Party Address]."),
      h1("1. Purpose"),
      p(
        "[Describe the purpose for which confidential information is being shared, e.g. evaluating a potential partnership.]",
      ),
      h1("2. Confidential Information"),
      p(
        '"Confidential Information" means any non-public information disclosed by either party, whether orally, in writing, or in electronic form, including but not limited to [business plans, financial data, source code, customer lists, and trade secrets].',
      ),
      h1("3. Obligations"),
      bullet(
        "The Receiving Party shall hold Confidential Information in strict confidence and use it solely for the Purpose.",
      ),
      bullet(
        "The Receiving Party shall not disclose Confidential Information to any third party without prior written consent.",
      ),
      bullet(
        "The Receiving Party shall use at least the same degree of care as it uses for its own confidential information, and no less than reasonable care.",
      ),
      h1("4. Exclusions"),
      p(
        "Confidential Information does not include information that (a) is or becomes publicly available through no fault of the Receiving Party; (b) was already lawfully in the Receiving Party's possession; (c) is independently developed; or (d) is received from a third party without restriction.",
      ),
      h1("5. Term"),
      p(
        "This Agreement shall remain in effect for [Number] years from the Effective Date. The confidentiality obligations survive termination for [Survival Period].",
      ),
      h1("6. Return of Materials"),
      p(
        "Upon termination or request, the Receiving Party shall return or destroy all Confidential Information and certify such return or destruction in writing.",
      ),
      h1("7. Governing Law"),
      p("This Agreement is governed by the laws of [Jurisdiction / State / Country]."),
      spacer(160),
      p("IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.", {
        italic: true,
      }),
      spacer(240),
      table(
        [5040, 5040],
        [
          [subHeaderCell("DISCLOSING PARTY", 5040), subHeaderCell("RECEIVING PARTY", 5040)],
          [
            dataCellLines(
              [
                "Signature: __________________",
                "Name: [Signatory Name]",
                "Title: [Title]",
                "Date: [Date]",
              ],
              5040,
            ),
            dataCellLines(
              [
                "Signature: __________________",
                "Name: [Signatory Name]",
                "Title: [Title]",
                "Date: [Date]",
              ],
              5040,
            ),
          ],
        ],
      ),
    ]),
  ],
};

const statementOfWork: DocxTemplateDef = {
  title: "Statement of Work",
  description: "Project SOW with scope, deliverables, schedule, and pricing.",
  category: "Legal",
  sections: [
    section([
      ...titleBlock("STATEMENT OF WORK", "[Engagement / Project Name]"),
      table(
        [5040, 5040],
        [
          [dataCell("Client: [Client Name]", 5040), dataCell("Vendor: [Vendor Name]", 5040)],
          [dataCell("Project #: [Project Number]", 5040), dataCell("Effective Date: [Date]", 5040)],
        ],
      ),
      h1("1. Overview"),
      p("[One-paragraph summary of the engagement and its business objective.]"),
      h1("2. Scope of Work"),
      bullet("[Deliverable or workstream one, with acceptance criteria.]"),
      bullet("[Deliverable or workstream two.]"),
      bullet("[Deliverable or workstream three.]"),
      h1("3. Out of Scope"),
      p("[Explicitly list what is not included to set expectations.]"),
      h1("4. Timeline & Milestones"),
      table(
        [4320, 2880, 2880],
        [
          [
            headerCell("Milestone", 4320),
            headerCell("Date", 2880),
            headerCell("Deliverable", 2880),
          ],
          [
            dataCell("[Milestone one]", 4320),
            dataCell("[Date]", 2880),
            dataCell("[Deliverable]", 2880),
          ],
          [
            dataCell("[Milestone two]", 4320),
            dataCell("[Date]", 2880),
            dataCell("[Deliverable]", 2880),
          ],
          [
            dataCell("[Milestone three]", 4320),
            dataCell("[Date]", 2880),
            dataCell("[Deliverable]", 2880),
          ],
        ],
      ),
      h1("5. Pricing & Payment"),
      p("Total fees: [$ Total]. Payment terms: [e.g. 50% upfront, 50% on completion / Net 30]."),
      h1("6. Assumptions & Dependencies"),
      bullet("[Assumption or dependency one, e.g. client provides timely access and feedback.]"),
      bullet("[Assumption or dependency two.]"),
      h1("7. Sign-off"),
      p(
        "This Statement of Work is governed by the Master Services Agreement between the parties. Approval below constitutes authorization to proceed.",
      ),
    ]),
  ],
};

const offerLetter: DocxTemplateDef = {
  title: "Offer Letter",
  description: "Employment offer with compensation, benefits, and at-will terms.",
  category: "HR",
  sections: [
    section([
      ...titleBlock("OFFER OF EMPLOYMENT", "[Company Name]"),
      p("Date: [Offer Date]"),
      p("Dear [Candidate Name],"),
      p(
        "We are pleased to offer you the position of [Job Title] with [Company Name], reporting to [Manager Name]. Your anticipated start date is [Start Date].",
      ),
      h1("Compensation"),
      bullet("Base salary: [$ Amount] per [year / period], payable [frequency]."),
      bullet("Bonus / commission: [Bonus or variable compensation details]."),
      bullet("Equity: [Number of shares / options and vesting schedule, if any]."),
      h1("Benefits"),
      p("[Health, dental, vision, 401(k) match, PTO, remote-work policy, and any other benefits.]"),
      h1("Employment Terms"),
      p(
        "This offer is for [full-time / part-time / contract] employment. Employment is at-will and may be terminated by either party at any time, with or without cause.",
      ),
      h1("Acceptance"),
      p(
        "To accept this offer, please sign and return this letter by [Response Deadline]. We are excited to welcome you to the team!",
      ),
      spacer(240),
      p("Sincerely,"),
      p("[Hiring Manager Name]"),
      p("[Title], [Company Name]"),
    ]),
  ],
};

const pressRelease: DocxTemplateDef = {
  title: "Press Release",
  description: "Announcement with headline, dateline, body, quote, and boilerplate.",
  category: "Marketing",
  sections: [
    section([
      ...titleBlock("FOR IMMEDIATE RELEASE", "[Company Name] Announces [Announcement Subject]"),
      p(
        "[CITY, State] — [Date] — " +
          "[Opening paragraph summarizing the announcement, who, what, when, where, and why.]",
      ),
      p("[Second paragraph with supporting details, context, and key facts or figures.]"),
      p("[Third paragraph with a quote from an executive, partner, or customer.]"),
      p('“"[Quote text — the most memorable, human statement about why this matters.]"'),
      p("— [Name], [Title], [Company Name]", { italic: true }),
      h1("About [Company Name]"),
      p("[One-paragraph boilerplate describing the company, its mission, and a key fact or two.]"),
      h1("Media Contact"),
      p("[Contact Name]  •  [Title]  •  [Email]  •  [Phone]"),
    ]),
  ],
};

// --- Business documents ----------------------------------------------------

const projectCharter: DocxTemplateDef = {
  title: "Project Charter",
  description: "Authorizes a project with objectives, scope, stakeholders, and risks.",
  category: "Project Management",
  sections: [
    section([
      ...titleBlock("PROJECT CHARTER", "[Project Name]"),
      table(
        [5040, 5040],
        [
          [dataCell("Sponsor: [Sponsor Name]", 5040), dataCell("Project Manager: [PM Name]", 5040)],
          [dataCell("Start Date: [Date]", 5040), dataCell("Target End: [Date]", 5040)],
        ],
      ),
      h1("1. Purpose & Objectives"),
      p("[Why this project exists and the business problem or opportunity it addresses.]"),
      bullet("[SMART objective one — specific, measurable, achievable, relevant, time-bound.]"),
      bullet("[SMART objective two.]"),
      h1("2. Scope"),
      p("In scope: [What the project will deliver.]"),
      p("Out of scope: [What the project explicitly will not include.]"),
      h1("3. Stakeholders"),
      table(
        [3600, 3600, 3600],
        [
          [
            headerCell("Stakeholder", 3600),
            headerCell("Role", 3600),
            headerCell("Interest / Impact", 3600),
          ],
          [
            dataCell("[Stakeholder]", 3600),
            dataCell("[Sponsor / PM / Customer]", 3600),
            dataCell("[Interest]", 3600),
          ],
          [dataCell("[Stakeholder]", 3600), dataCell("[Role]", 3600), dataCell("[Interest]", 3600)],
        ],
      ),
      h1("4. Milestones"),
      bullet("[Milestone one] — [Date]"),
      bullet("[Milestone two] — [Date]"),
      bullet("[Milestone three] — [Date]"),
      h1("5. Budget"),
      p("Approved budget: [$ Amount]. Source: [Budget owner / funding source]."),
      h1("6. Risks & Constraints"),
      bullet("[Key risk one, likelihood, and mitigation]."),
      bullet("[Constraint or dependency]."),
      h1("7. Approval"),
      p("This charter authorizes the Project Manager to proceed with planning and execution."),
    ]),
  ],
};

const businessCase: DocxTemplateDef = {
  title: "Business Case",
  description: "Justifies an investment with options, costs, benefits, and recommendation.",
  category: "Business",
  sections: [
    section([
      ...titleBlock("BUSINESS CASE", "[Initiative / Investment Name]"),
      p("Prepared by [Author]  •  [Date]  •  Version [1.0]"),
      h1("1. Executive Summary"),
      p("[One-paragraph summary of the recommendation, expected return, and rationale.]"),
      h1("2. Problem / Opportunity"),
      p("[Describe the problem or opportunity in business terms and quantify it where possible.]"),
      h1("3. Options Considered"),
      table(
        [3600, 3600, 3600],
        [
          [
            headerCell("Option", 3600),
            headerCell("Description", 3600),
            headerCell("Est. Cost / Benefit", 3600),
          ],
          [
            dataCell("A. Do nothing", 3600),
            dataCell("[Baseline: status quo]", 3600),
            dataCell("[Cost / benefit]", 3600),
          ],
          [
            dataCell("B. [Option B]", 3600),
            dataCell("[Description]", 3600),
            dataCell("[Cost / benefit]", 3600),
          ],
          [
            dataCell("C. [Option C]", 3600),
            dataCell("[Description]", 3600),
            dataCell("[Cost / benefit]", 3600),
          ],
        ],
      ),
      h1("4. Financial Analysis"),
      bullet("Upfront investment: [$ Amount]."),
      bullet("Projected annual benefit / savings: [$ Amount]."),
      bullet("Payback period: [X] months/years. ROI: [X%]."),
      h1("5. Risks"),
      bullet("[Risk one and mitigation]."),
      bullet("[Risk two and mitigation]."),
      h1("6. Recommendation"),
      p(
        "We recommend proceeding with [Option X] because [key reason]. The next step is [immediate action].",
      ),
    ]),
  ],
};

const executiveSummary: DocxTemplateDef = {
  title: "Executive Summary",
  description: "One-page leadership summary of a project, initiative, or result.",
  category: "Business",
  sections: [
    section([
      ...titleBlock("EXECUTIVE SUMMARY", "[Subject / Initiative]"),
      p("Prepared for [Audience / Executive]  •  [Date]"),
      h1("The Bottom Line"),
      p("[One or two sentences stating the single most important takeaway.]"),
      h1("Background"),
      p("[Brief context: what led to this work and why it matters now.]"),
      h1("Key Findings"),
      bullet("[Finding one, with a number or fact where possible.]"),
      bullet("[Finding two.]"),
      bullet("[Finding three.]"),
      h1("Recommendation"),
      p("[What we recommend, why, and the expected impact.]"),
      h1("Next Steps"),
      bullet("[Action one — owner, date]."),
      bullet("[Action two — owner, date]."),
      h1("Requested Decision"),
      p("[What we need from the reader, e.g. approval, funding, direction.]"),
    ]),
  ],
};

const quarterlyBusinessReview: DocxTemplateDef = {
  title: "Quarterly Business Review",
  description: "QBR report: performance vs. goals, wins, risks, and next-quarter plan.",
  category: "Business",
  sections: [
    section([
      ...titleBlock("QUARTERLY BUSINESS REVIEW", "[Quarter] [Year] — [Team / Business Unit]"),
      p("Prepared by [Author]  •  [Date]"),
      h1("1. Executive Summary"),
      p(
        "[Two to three sentences on how the quarter went overall, and the headline number or win.]",
      ),
      h1("2. Performance vs. Goals"),
      table(
        [3600, 2400, 2400, 2400],
        [
          [
            headerCell("Goal", 3600),
            headerCell("Target", 2400),
            headerCell("Actual", 2400),
            headerCell("Status", 2400),
          ],
          [
            dataCell("[Goal one]", 3600),
            dataCell("[Target]", 2400),
            dataCell("[Actual]", 2400),
            dataCell("[On / Behind]", 2400),
          ],
          [
            dataCell("[Goal two]", 3600),
            dataCell("[Target]", 2400),
            dataCell("[Actual]", 2400),
            dataCell("[On / Behind]", 2400),
          ],
          [
            dataCell("[Goal three]", 3600),
            dataCell("[Target]", 2400),
            dataCell("[Actual]", 2400),
            dataCell("[On / Behind]", 2400),
          ],
        ],
      ),
      h1("3. Wins"),
      bullet("[Win one and its impact]."),
      bullet("[Win two]."),
      h1("4. Challenges & Risks"),
      bullet("[Challenge / risk one and mitigation]."),
      bullet("[Challenge / risk two]."),
      h1("5. Learnings"),
      p("[What we learned this quarter and how it changes our approach going forward.]"),
      h1("6. Next Quarter Plan"),
      bullet("[Priority one with owner and target]."),
      bullet("[Priority two with owner and target]."),
      bullet("[Priority three with owner and target]."),
    ]),
  ],
};

const swotAnalysis: DocxTemplateDef = {
  title: "SWOT Analysis",
  description: "Strengths, Weaknesses, Opportunities, and Threats in a 2x2 layout.",
  category: "Strategy",
  sections: [
    section([
      ...titleBlock("SWOT ANALYSIS", "[Subject / Business / Initiative]"),
      p("Prepared by [Author]  •  [Date]"),
      h1("Strengths"),
      bullet("[Internal strength one — what we do better than anyone else.]"),
      bullet("[Internal strength two]."),
      bullet("[Internal strength three]."),
      h1("Weaknesses"),
      bullet("[Internal weakness one — what holds us back.]"),
      bullet("[Internal weakness two]."),
      bullet("[Internal weakness three]."),
      h1("Opportunities"),
      bullet("[External opportunity one — market or environment shift we can exploit.]"),
      bullet("[External opportunity two]."),
      bullet("[External opportunity three]."),
      h1("Threats"),
      bullet("[External threat one — competitor, regulation, or trend that could hurt us.]"),
      bullet("[External threat two]."),
      bullet("[External threat three]."),
      h1("Strategic Implications"),
      p(
        "[How we will leverage strengths and opportunities while mitigating weaknesses and threats.]",
      ),
    ]),
  ],
};

const roadmapTemplate: DocxTemplateDef = {
  title: "Product Roadmap",
  description: "Now / Next / Later product roadmap with themes and outcomes.",
  category: "Product",
  sections: [
    section([
      ...titleBlock("PRODUCT ROADMAP", "[Product / Area] — [Planning Horizon]"),
      p("Owner: [Product Owner]  •  Last updated [Date]"),
      h1("Vision"),
      p("[One to two sentences on the product vision and the outcomes this roadmap serves.]"),
      h1("Now (This Quarter)"),
      bullet("[Theme / initiative one — [Outcome it drives]]."),
      bullet("[Theme / initiative two — [Outcome it drives]]."),
      h1("Next (Next Quarter)"),
      bullet("[Theme / initiative one — [Outcome it drives]]."),
      bullet("[Theme / initiative two — [Outcome it drives]]."),
      h1("Later"),
      bullet("[Longer-horizon theme or bet.]"),
      bullet("[Longer-horizon theme or bet.]"),
      h1("Key Metrics"),
      bullet("[North-star metric we're moving — e.g. activation, retention, revenue]."),
      bullet("[Supporting metric]."),
    ]),
  ],
};

// --- Internal comms --------------------------------------------------------

const memo: DocxTemplateDef = {
  title: "Memo",
  description: "Internal memo with TO/FROM/DATE/SUBJECT header.",
  category: "Communications",
  sections: [
    section([
      ...titleBlock("MEMORANDUM", "[Subject line]"),
      table(
        [2160, 8640],
        [
          [subHeaderCell("TO:", 2160), dataCell("[Recipients]", 8640)],
          [subHeaderCell("FROM:", 2160), dataCell("[Sender]", 8640)],
          [subHeaderCell("DATE:", 2160), dataCell("[Date]", 8640)],
          [subHeaderCell("SUBJECT:", 2160), dataCell("[Subject]", 8640)],
        ],
      ),
      h1("Summary"),
      p("[One-paragraph summary of what this memo covers and what action, if any, is requested.]"),
      h1("Background"),
      p("[Context the reader needs to understand the rest of the memo.]"),
      h1("Details"),
      p("[The substance of the memo, organized logically.]"),
      bullet("[Key point one]."),
      bullet("[Key point two]."),
      h1("Action Required"),
      p("[What recipients should do, and by when.]"),
    ]),
  ],
};

const meetingAgenda: DocxTemplateDef = {
  title: "Meeting Agenda",
  description: "Agenda with objectives, topics, timeboxes, and preparation.",
  category: "Communications",
  sections: [
    section([
      ...titleBlock("MEETING AGENDA", "[Meeting Title]"),
      table(
        [3600, 3600, 3600],
        [
          [
            dataCell("Date: [Date]", 3600),
            dataCell("Time: [Time]", 3600),
            dataCell("Location: [Link / Room]", 3600),
          ],
        ],
      ),
      h1("Objective"),
      p("[What this meeting must accomplish — the single decision or outcome.]"),
      h1("Agenda"),
      table(
        [2880, 5040, 2880],
        [
          [headerCell("Time", 2880), headerCell("Topic", 5040), headerCell("Owner", 2880)],
          [dataCell("[00:00]", 2880), dataCell("[Topic one]", 5040), dataCell("[Owner]", 2880)],
          [dataCell("[00:15]", 2880), dataCell("[Topic two]", 5040), dataCell("[Owner]", 2880)],
          [dataCell("[00:30]", 2880), dataCell("[Topic three]", 5040), dataCell("[Owner]", 2880)],
          [
            dataCell("[00:45]", 2880),
            dataCell("[Wrap-up / action items]", 5040),
            dataCell("[Owner]", 2880),
          ],
        ],
      ),
      h1("Preparation"),
      bullet("[What attendees should read or prepare in advance]."),
      bullet("[Any decisions that must be made]."),
    ]),
  ],
};

const policyTemplate: DocxTemplateDef = {
  title: "Policy",
  description: "Company policy with purpose, scope, policy, and compliance.",
  category: "HR",
  sections: [
    section([
      ...titleBlock("[POLICY NAME]", "[Company Name] Policy"),
      p("Effective Date: [Date]  •  Owner: [Policy Owner]  •  Version [1.0]"),
      h1("1. Purpose"),
      p("[Why this policy exists and what it is intended to achieve.]"),
      h1("2. Scope"),
      p(
        "This policy applies to [employees, contractors, all personnel] in [departments / geographies / situations].",
      ),
      h1("3. Policy"),
      bullet("[The rule or expectation, stated clearly and unambiguously.]"),
      bullet("[Additional requirement or standard.]"),
      bullet("[Additional requirement or standard.]"),
      h1("4. Responsibilities"),
      bullet("Employees: [What employees must do]."),
      bullet("Managers: [What managers must do]."),
      h1("5. Exceptions & Escalation"),
      p("[Process for requesting an exception and who approves it.]"),
      h1("6. Compliance & Consequences"),
      p("[How compliance is monitored and consequences of non-compliance.]"),
    ]),
  ],
};

export const DOC_TEMPLATES_MORE: Record<string, DocxTemplateDef> = {
  nda_template: ndaTemplate,
  statement_of_work: statementOfWork,
  offer_letter: offerLetter,
  press_release: pressRelease,
  project_charter: projectCharter,
  business_case: businessCase,
  executive_summary: executiveSummary,
  quarterly_business_review: quarterlyBusinessReview,
  swot_analysis: swotAnalysis,
  product_roadmap: roadmapTemplate,
  memo_template: memo,
  meeting_agenda: meetingAgenda,
  policy_template: policyTemplate,
};
