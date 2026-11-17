// Enterprise PPTX templates. Hand-authored against the office-open SlideOptions
// shape via the shared builders in builders/pptx.ts. Brand colors use the
// "slate" scheme's hex values (registered in office_template_roles.ts
// PPT_TEMPLATE_ROLES so `recolor` can swap them). Text follows the
// [Placeholder] convention consumed by applyPlaceholders.

import {
  bulletSlide,
  closingSlide,
  sectionSlide,
  statSlide,
  tableSlide,
  titleSlide,
} from "./builders/pptx";

export interface PptxTemplateDef {
  title: string;
  description: string;
  category: string;
  size: unknown;
  masters: unknown;
  slides: unknown[];
}

function deck(slides: unknown[]): unknown[] {
  return slides;
}

// --- Investor & Sales ------------------------------------------------------

const pitchDeck: PptxTemplateDef = {
  title: "Pitch Deck",
  description: "Investor pitch: problem, solution, market, traction, ask.",
  category: "Investor",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "PITCH DECK",
      "[Company Name]",
      "[One-line value proposition]",
      "[Founder Name]  •  [Date]",
    ),
    bulletSlide("The Problem", [
      "[The painful problem your customers face, quantified.]",
      "[Why existing solutions fall short.]",
      "[Who feels this pain most acutely.]",
    ]),
    bulletSlide("Our Solution", [
      "[How your product solves the problem, simply.]",
      "[The key differentiator vs. alternatives.]",
      "[Why now is the right time.]",
    ]),
    statSlide("Market Opportunity", [
      { value: "[$50B]", label: "[TAM]" },
      { value: "[$5B]", label: "[SAM]" },
      { value: "[$1B]", label: "[SOM]" },
    ]),
    tableSlide(
      "Business Model",
      [4800000, 3600000, 2400000],
      ["Stream", "Model", "Status"],
      [
        ["[Revenue stream one]", "[Subscription / usage / SaaS]", "[Live / planned]"],
        ["[Revenue stream two]", "[Model]", "[Live / planned]"],
      ],
    ),
    bulletSlide("Traction", [
      "[Headline metric — revenue, users, growth, or partnerships.]",
      "[Second traction proof point.]",
      "[Third traction proof point.]",
    ]),
    bulletSlide("The Ask", [
      "We are raising [$ Amount] to [what the capital funds].",
      "Use of funds: [40% product, 30% GTM, 20% team, 10% buffer].",
      "Milestones this round unlocks: [milestone one], [milestone two].",
    ]),
    closingSlide("Thank You", "[Founder Name]  •  [Email]  •  [Phone]"),
  ]),
};

const salesProposal: PptxTemplateDef = {
  title: "Sales Proposal",
  description: "Solution proposal with problem, approach, timeline, and pricing.",
  category: "Sales",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "PROPOSAL",
      "[Proposal Title]",
      "Prepared for [Client Name]  •  [Date]",
      "[Your Company Name]",
    ),
    bulletSlide("Executive Summary", [
      "[The opportunity and what we propose in one paragraph.]",
      "[The expected outcome / value delivered.]",
      "[Why us — our differentiator.]",
    ]),
    bulletSlide("Understanding & Approach", [
      "[Our understanding of the client's problem and goals.]",
      "[Our recommended approach and methodology.]",
      "[Key deliverables.]",
    ]),
    tableSlide(
      "Timeline",
      [4200000, 3200000, 3420000],
      ["Phase", "Duration", "Deliverable"],
      [
        ["Discovery", "[2 weeks]", "[Discovery report]"],
        ["Design", "[3 weeks]", "[Design / plan]"],
        ["Delivery", "[4 weeks]", "[Implementation]"],
      ],
    ),
    statSlide("Pricing", [
      { value: "[$ X]", label: "[Fixed / monthly]" },
      { value: "[X wk]", label: "[Timeline]" },
      { value: "[X]", label: "[Team size]" },
    ]),
    bulletSlide("Why Us", [
      "[Relevant experience or case study.]",
      "[Team credentials or certifications.]",
      "[Guarantee / support commitment.]",
    ]),
    closingSlide("Let's Talk", "[Contact Name]  •  [Email]  •  [Phone]"),
  ]),
};

const investorUpdate: PptxTemplateDef = {
  title: "Investor Update",
  description: "Monthly/quarterly investor update with metrics, wins, and asks.",
  category: "Investor",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "INVESTOR UPDATE",
      "[Company Name] — [Month / Quarter] [Year]",
      "[One-line summary of the period]",
      "[Founder Name]  •  [Date]",
    ),
    statSlide("Key Metrics", [
      { value: "[$ X]", label: "[Revenue / MRR]" },
      { value: "[X%]", label: "[Growth]" },
      { value: "[X]", label: "[Customers]" },
    ]),
    bulletSlide("Highlights", [
      "[Biggest win of the period.]",
      "[Product milestone shipped.]",
      "[Team or partnership highlight.]",
    ]),
    bulletSlide("Challenges", [
      "[What went wrong or is at risk.]",
      "[What we learned and are changing.]",
      "[Any competitive or market shifts.]",
    ]),
    bulletSlide("Focus Next Period", [
      "[Top priority one and why.]",
      "[Top priority two.]",
      "[Top priority three.]",
    ]),
    bulletSlide("Asks", [
      "[Specific ask — intro, hire, advice, follow-on capital.]",
      "[Second ask, if any.]",
    ]),
    closingSlide("Thank You", "[Founder Name]  •  [Email]"),
  ]),
};

// --- Product & Strategy ----------------------------------------------------

const productRoadmap: PptxTemplateDef = {
  title: "Product Roadmap Deck",
  description: "Now/Next/Later roadmap with themes, outcomes, and metrics.",
  category: "Product",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "ROADMAP",
      "[Product Area] — [Planning Horizon]",
      "[One-line product vision]",
      "[Product Owner]  •  [Date]",
    ),
    bulletSlide("Vision & Goals", [
      "[Product vision in one sentence.]",
      "[Top goal this period and how it's measured.]",
    ]),
    sectionSlide("01", "Now", "[Current quarter focus]"),
    bulletSlide("Now", [
      "[Theme one — [Outcome it drives]].",
      "[Theme two — [Outcome it drives]].",
    ]),
    sectionSlide("02", "Next", "[Next quarter focus]"),
    bulletSlide("Next", [
      "[Theme one — [Outcome it drives]].",
      "[Theme two — [Outcome it drives]].",
    ]),
    sectionSlide("03", "Later", "[Longer-horizon bets]"),
    bulletSlide("Later", ["[Exploratory bet one].", "[Exploratory bet two]."]),
    statSlide("Success Metrics", [
      { value: "[X]", label: "[North-star metric]" },
      { value: "[X%]", label: "[Supporting metric]" },
      { value: "[X]", label: "[Supporting metric]" },
    ]),
    closingSlide("Questions?", "[Contact]"),
  ]),
};

const strategyDeck: PptxTemplateDef = {
  title: "Strategy Deck",
  description: "Strategy narrative: where we play, how we win, and priorities.",
  category: "Strategy",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "STRATEGY",
      "[Strategy Title] — [Horizon]",
      "[One-line strategy summary]",
      "[Author]  •  [Date]",
    ),
    bulletSlide("Context", [
      "[Market / competitive context and why change is needed.]",
      "[Key trends shaping the opportunity.]",
    ]),
    bulletSlide("Where We Play", [
      "[Target customer segments and markets.]",
      "[Geographies, verticals, or use cases in scope.]",
    ]),
    bulletSlide("How We Win", [
      "[The core differentiation and defensible advantage.]",
      "[Capabilities we must build or protect.]",
    ]),
    statSlide("Strategic Priorities", [
      { value: "01", label: "[Priority one]" },
      { value: "02", label: "[Priority two]" },
      { value: "03", label: "[Priority three]" },
    ]),
    bulletSlide("Measures of Success", ["[Metric one and target.]", "[Metric two and target.]"]),
    closingSlide("Thank You", "[Contact]"),
  ]),
};

const quarterlyReview: PptxTemplateDef = {
  title: "Quarterly Business Review (Deck)",
  description: "QBR presentation: performance, wins, risks, and next plan.",
  category: "Business",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "QBR",
      "[Team / Business Unit] — [Quarter] [Year]",
      "[One-line quarter summary]",
      "[Presenter]  •  [Date]",
    ),
    statSlide("Performance", [
      { value: "[X%]", label: "[vs. goal]" },
      { value: "[$ X]", label: "[Revenue]" },
      { value: "[X]", label: "[Wins]" },
    ]),
    bulletSlide("Wins", ["[Win one and impact].", "[Win two and impact]."]),
    bulletSlide("Challenges & Risks", [
      "[Challenge one and mitigation].",
      "[Challenge two and mitigation].",
    ]),
    bulletSlide("Learnings", ["[Key learning one].", "[Key learning two]."]),
    bulletSlide("Next Quarter", [
      "[Priority one — owner, target].",
      "[Priority two — owner, target].",
      "[Priority three — owner, target].",
    ]),
    closingSlide("Questions?", "[Contact]"),
  ]),
};

const financialReview: PptxTemplateDef = {
  title: "Financial Review",
  description: "Finance presentation: revenue, margin, cash, and forecast.",
  category: "Finance",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "FINANCIAL REVIEW",
      "[Company] — [Period]",
      "[One-line financial summary]",
      "[CFO / Finance]  •  [Date]",
    ),
    statSlide("Headline Numbers", [
      { value: "[$ X]", label: "[Revenue]" },
      { value: "[X%]", label: "[Gross margin]" },
      { value: "[$ X]", label: "[Cash on hand]" },
    ]),
    tableSlide(
      "P&L Summary",
      [4800000, 3000000, 3000000],
      ["Line", "Actual", "Budget"],
      [
        ["Revenue", "[$ X]", "[$ X]"],
        ["COGS", "[$ X]", "[$ X]"],
        ["OpEx", "[$ X]", "[$ X]"],
        ["Net income", "[$ X]", "[$ X]"],
      ],
    ),
    bulletSlide("Drivers & Variances", [
      "[What drove revenue / margin variance vs. budget.]",
      "[Cost changes and one-time items.]",
    ]),
    bulletSlide("Forecast & Risks", [
      "[Updated forecast for next period.]",
      "[Key financial risks and mitigations.]",
    ]),
    closingSlide("Thank You", "[Contact]"),
  ]),
};

// --- People & Culture ------------------------------------------------------

const allHands: PptxTemplateDef = {
  title: "All-Hands",
  description: "Company all-hands: updates, wins, hiring, and Q&A.",
  category: "People",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "ALL-HANDS",
      "[Company Name] — [Month] [Year]",
      "[One-line theme for the month]",
      "[CEO / Host]  •  [Date]",
    ),
    statSlide("Company Pulse", [
      { value: "[X]", label: "[Team size]" },
      { value: "[X%]", label: "[Revenue growth]" },
      { value: "[X]", label: "[Customers]" },
    ]),
    bulletSlide("Business Update", ["[Headline business update].", "[Second update]."]),
    bulletSlide("Wins & Shoutouts", [
      "[Team or individual win one].",
      "[Team or individual win two].",
    ]),
    bulletSlide("Hiring", ["[Roles we're hiring for and why].", "[Referral encouragement]."]),
    bulletSlide("What's Ahead", ["[Upcoming milestone one].", "[Upcoming milestone two]."]),
    closingSlide("Thank You", "[Q&A — ask anything]"),
  ]),
};

const onboardingDeck: PptxTemplateDef = {
  title: "Onboarding Deck",
  description: "New-hire onboarding: mission, org, and how to get started.",
  category: "People",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "WELCOME",
      "Welcome to [Company Name]",
      "[Your start date / role]",
      "[Manager]  •  [Buddy]",
    ),
    bulletSlide("Our Mission", [
      "[Company mission in one sentence].",
      "[What we're building and for whom].",
    ]),
    bulletSlide("The Team", ["[Org structure and key leaders].", "[Where your team fits]."]),
    bulletSlide("Your First 30 Days", [
      "[Week 1–2: setup and meet the team].",
      "[Week 3–4: first project and checkpoints].",
    ]),
    bulletSlide("How We Work", [
      "[Communication norms, tools, and cadence].",
      "[Core values in practice].",
    ]),
    closingSlide("Welcome Aboard!", "[Manager name]  •  [Email]"),
  ]),
};

const projectKickoff: PptxTemplateDef = {
  title: "Project Kickoff",
  description: "Kickoff deck: objectives, scope, roles, timeline, and risks.",
  category: "Project Management",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide("KICKOFF", "[Project Name]", "[One-line project goal]", "[PM]  •  [Date]"),
    bulletSlide("Objectives", [
      "[Project objective one — measurable].",
      "[Project objective two].",
    ]),
    bulletSlide("Scope", ["In scope: [what we'll deliver].", "Out of scope: [what we won't]."]),
    tableSlide(
      "Roles & Responsibilities",
      [3600000, 3600000, 3600000],
      ["Role", "Owner", "Responsibility"],
      [
        ["Sponsor", "[Name]", "[Approves scope / budget]"],
        ["PM", "[Name]", "[Plans / coordinates]"],
        ["Team", "[Names]", "[Executes work]"],
      ],
    ),
    tableSlide(
      "Timeline",
      [4200000, 3200000, 3420000],
      ["Phase", "Dates", "Milestone"],
      [
        ["Kickoff", "[Date]", "[Charter approved]"],
        ["Execution", "[Dates]", "[Key milestone]"],
        ["Close", "[Date]", "[Launch / handoff]"],
      ],
    ),
    bulletSlide("Risks & Decisions", [
      "[Risk one and mitigation].",
      "[Decision needed from sponsor].",
    ]),
    closingSlide("Let's Build", "[PM contact]"),
  ]),
};

const retrospective: PptxTemplateDef = {
  title: "Retrospective",
  description: "Sprint/project retro: what went well, what didn't, actions.",
  category: "Project Management",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide("RETROSPECTIVE", "[Project / Sprint] — [Date]", "[One-line theme]", "[Facilitator]"),
    bulletSlide("What Went Well", ["[Win one].", "[Win two].", "[Win three]."]),
    bulletSlide("What Didn't Go Well", ["[Issue one].", "[Issue two]."]),
    bulletSlide("What We Learned", ["[Learning one].", "[Learning two]."]),
    tableSlide(
      "Action Items",
      [3600000, 3600000, 3600000],
      ["Action", "Owner", "Due"],
      [
        ["[Action one]", "[Owner]", "[Date]"],
        ["[Action two]", "[Owner]", "[Date]"],
      ],
    ),
    closingSlide("Thank You", "Keep improving 🚀"),
  ]),
};

const marketingPlan: PptxTemplateDef = {
  title: "Marketing Plan",
  description: "Marketing plan: audience, channels, budget, and goals.",
  category: "Marketing",
  size: "16:9",
  masters: undefined,
  slides: deck([
    titleSlide(
      "MARKETING PLAN",
      "[Campaign / Period]",
      "[One-line marketing goal]",
      "[Marketer]  •  [Date]",
    ),
    bulletSlide("Audience", [
      "[Target audience segments and personas].",
      "[Key pain points and desires].",
    ]),
    bulletSlide("Positioning & Message", [
      "[Positioning statement].",
      "[Core message and value prop].",
    ]),
    tableSlide(
      "Channels",
      [4200000, 3200000, 3420000],
      ["Channel", "Goal", "Budget"],
      [
        ["Paid search", "[Acquisition]", "[$ X]"],
        ["Social", "[Awareness]", "[$ X]"],
        ["Email", "[Retention]", "[$ X]"],
      ],
    ),
    statSlide("Goals", [
      { value: "[X]", label: "[Leads]" },
      { value: "[X%]", label: "[Conversion]" },
      { value: "[$ X]", label: "[CAC]" },
    ]),
    bulletSlide("Measurement", [
      "[KPIs and dashboards we'll track].",
      "[Experiment / iteration cadence].",
    ]),
    closingSlide("Thank You", "[Contact]"),
  ]),
};

export const PPT_TEMPLATES_MORE: Record<string, PptxTemplateDef> = {
  pitch_deck: pitchDeck,
  sales_proposal: salesProposal,
  investor_update: investorUpdate,
  product_roadmap: productRoadmap,
  strategy_deck: strategyDeck,
  quarterly_review: quarterlyReview,
  financial_review: financialReview,
  all_hands: allHands,
  onboarding_deck: onboardingDeck,
  project_kickoff: projectKickoff,
  retrospective: retrospective,
  marketing_plan: marketingPlan,
};
