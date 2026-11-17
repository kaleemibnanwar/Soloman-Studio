import fs from "node:fs";
import path from "node:path";

export type MissionStatus = "PLANNING" | "IN PROGRESS" | "PAUSED" | "BLOCKED" | "DONE" | "ABORTED";

export interface MissionMilestone {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  botName?: string;
  chatId?: number | null;
  summary?: string | null;
  lastRunAt?: string | null;
}

export interface MissionArtifact {
  name: string;
  relativePath: string;
  fullPath: string;
  size: number;
  updatedAt: string;
  extension: string;
  isReport?: boolean;
}

export interface MissionChatRun {
  milestoneId: string;
  milestoneTitle: string;
  botName: string;
  chatId: number;
  lastRunAt: string | null;
  summary: string | null;
  status: string;
}

export interface MissionTeamMember {
  name: string;
  role: string;
  responsibilities: string;
  mcpTools?: string[];
}

export interface MissionApprovalPending {
  id: string;
  requestingBot: string;
  tool: string;
  actionCategory: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  command?: string;
  createdAt?: string;
}

export interface MissionConsensus {
  title: string;
  slug: string;
  status: MissionStatus;
  projectId: number | null;
  manager: string;
  createdAt: string;
  updatedAt: string;
  objective: string;
  context: string[];
  deliverables: string[];
  milestones: MissionMilestone[];
  teamRoster: MissionTeamMember[];
  approvalsPending: MissionApprovalPending[];
  decisions: string[];
  guardrails: string[];
  history: string[];
  hitlPolicy: MissionHitlPolicy;
  activeBot: string | null;
  nextMilestoneId: string | null;
  lastError: string | null;
  projectName?: string | null;
  projectPath?: string;
  missionDirPath?: string;
  chatRuns?: MissionChatRun[];
  artifacts?: MissionArtifact[];
}

export interface MissionHitlPolicy {
  enabled: boolean;
  blockExternalCommunication: boolean;
  blockGitPush: boolean;
  blockFinancialSpend: boolean;
  blockDestructiveFs: boolean;
}

export const DEFAULT_MISSION_HITL_POLICY: MissionHitlPolicy = {
  enabled: true,
  blockExternalCommunication: true,
  blockGitPush: true,
  blockFinancialSpend: true,
  blockDestructiveFs: true,
};

export interface MissionSummary {
  slug: string;
  title: string;
  status: MissionStatus;
  manager: string;
  createdAt: string;
  updatedAt: string;
  objective: string;
  totalMilestones: number;
  completedMilestones: number;
  pendingApprovalsCount: number;
  projectId?: number | null;
  projectName?: string | null;
  projectPath?: string;
  missionDirPath?: string;
  artifactsCount?: number;
  latestChatId?: number | null;
}

const MISSIONS_BASE_DIR = ".soloman/missions";
const CONSENSUS_FILENAME = "consensus.md";
const MAX_HISTORY_LINES = 100;
const MISSION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertMissionSlug(slug: string): void {
  if (!MISSION_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid mission slug '${slug}'`);
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function missionsRootDir(projectPath: string): string {
  return path.join(projectPath, MISSIONS_BASE_DIR);
}

export function missionDirPath(projectPath: string, slug: string): string {
  assertMissionSlug(slug);
  return path.join(missionsRootDir(projectPath), slug);
}

export function missionConsensusFilePath(projectPath: string, slug: string): string {
  return path.join(missionDirPath(projectPath, slug), CONSENSUS_FILENAME);
}

export function missionArtifactsDirPath(projectPath: string, slug: string): string {
  return path.join(missionDirPath(projectPath, slug), "artifacts");
}

export function listMissionArtifacts(projectPath: string, slug: string): MissionArtifact[] {
  const artifactsDir = missionArtifactsDirPath(projectPath, slug);
  if (!fs.existsSync(artifactsDir)) return [];

  const results: MissionArtifact[] = [];
  function scan(dir: string, base: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = base ? path.join(base, entry.name) : entry.name;
        if (entry.isDirectory()) {
          scan(full, rel);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          const ext = path.extname(entry.name).toLowerCase();
          const lowerName = entry.name.toLowerCase();
          const isReport =
            lowerName.includes("report") ||
            lowerName.includes("certification") ||
            lowerName.includes("handover") ||
            lowerName.includes("proposal") ||
            lowerName.includes("summary") ||
            ext === ".md";

          results.push({
            name: entry.name,
            relativePath: rel,
            fullPath: full,
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            extension: ext,
            isReport,
          });
        }
      }
    } catch {
      // ignore read errors
    }
  }
  scan(artifactsDir, "");
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function extractSectionContent(raw: string, headingRegex: RegExp): string {
  const match = raw.match(headingRegex);
  return (match?.[1] ?? "").trim();
}

function extractSectionList(raw: string, headingTitle: string): string[] {
  const regex = new RegExp(`## [0-9.]*\\s*${headingTitle}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const content = extractSectionContent(raw, regex);
  if (!content) return [];
  return content
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
}

function parseMilestones(raw: string): MissionMilestone[] {
  const regex = /## [0-9.]*\s*Milestones[^\n]*\n([\s\S]*?)(?=\n## |$)/i;
  const content = extractSectionContent(raw, regex);
  if (!content) return [];

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ["));
  return lines.map((line, idx) => {
    let status: "todo" | "in_progress" | "done" = "todo";
    if (line.startsWith("- [x]") || line.startsWith("- [X]")) status = "done";
    else if (line.startsWith("- [/]")) status = "in_progress";

    const afterCheckbox = line.replace(/^- \[[ xX/]\]\s*/, "").trim();
    // Check for bot attribution like [🤖 Web Scout] or [Bot: Web Scout]
    const botMatch = afterCheckbox.match(/\[(?:🤖\s*|Bot:\s*)([^\]]+)\]/i);
    const botName = botMatch ? botMatch[1].trim() : undefined;
    const title = afterCheckbox.replace(/\[(?:🤖\s*|Bot:\s*)[^\]]+\]/i, "").trim();

    return {
      id: `milestone-${idx + 1}`,
      title,
      status,
      botName,
    };
  });
}

function parseTeamRoster(raw: string): MissionTeamMember[] {
  const regex = /## [0-9.]*\s*Team Roster[^\n]*\n([\s\S]*?)(?=\n## |$)/i;
  const content = extractSectionContent(raw, regex);
  if (!content) return [];

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "));
  return lines.map((line) => {
    // Format: - **Name** (Role): Responsibilities. Equipped with X, Y.
    const clean = line.replace(/^-\s+/, "");
    const nameMatch = clean.match(/^\*\*([^*]+)\*\*(?:\s*\(([^)]+)\))?:\s*(.*)$/);
    if (!nameMatch) {
      return {
        name: clean.split(":")[0]?.trim() || "Worker",
        role: "Worker",
        responsibilities: clean.split(":")[1]?.trim() || clean,
      };
    }

    const name = nameMatch[1].trim();
    const role = (nameMatch[2] || "Worker").trim();
    const rest = (nameMatch[3] || "").trim();

    // Check for MCP tools mentioned
    const mcpMatch = rest.match(/(?:Equipped with|MCPs?):\s*([^.]+)/i);
    const mcpTools = mcpMatch
      ? mcpMatch[1]
          .split(/[,&]/)
          .map((t) => t.trim().replace(/\s*MCPs?$/i, ""))
          .filter(Boolean)
      : undefined;

    return {
      name,
      role,
      responsibilities: rest,
      mcpTools,
    };
  });
}

function parseApprovalsPending(raw: string): MissionApprovalPending[] {
  const regex = /## [0-9.]*\s*Approvals Pending[^\n]*\n([\s\S]*?)(?=\n## |$)/i;
  const content = extractSectionContent(raw, regex);
  if (!content) return [];

  const blocks = content
    .split(/\n(?=- \[[ xX/]\])/g)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("- ["));

  return blocks.map((block, idx) => {
    const lines = block.split("\n").map((l) => l.trim());
    const headerLine = lines[0] || "";
    let status: "pending" | "approved" | "rejected" = "pending";
    if (headerLine.startsWith("- [x]") || headerLine.startsWith("- [X]")) status = "approved";
    const explicitStatus = block.match(/(?:\*\*)?Status:(?:\*\*)?\s*([^\n]+)/i)?.[1]?.trim();
    if (explicitStatus === "REJECTED") status = "rejected";

    const idMatch = headerLine.match(/\[ID:\s*([^\]]+)\]/i);
    const id = idMatch ? idMatch[1].trim() : `apprv_${idx + 1}`;

    const botMatch = block.match(/(?:\*\*)?Requesting Bot:(?:\*\*)?\s*(?:🤖\s*)?([^\n]+)/i);
    const requestingBot = botMatch
      ? botMatch[1]
          .trim()
          .replace(/^\*\*|\*\*$/g, "")
          .trim()
      : "Worker";

    const toolMatch = block.match(/(?:\*\*)?Tool:(?:\*\*)?\s*`?([^`\n]+)`?/i);
    const tool = toolMatch
      ? toolMatch[1]
          .trim()
          .replace(/^\*\*|\*\*$/g, "")
          .trim()
      : "unknown_tool";

    const catMatch = block.match(/(?:\*\*)?Action Category:(?:\*\*)?\s*`?([^`\n]+)`?/i);
    const actionCategory = catMatch
      ? catMatch[1]
          .trim()
          .replace(/^\*\*|\*\*$/g, "")
          .trim()
      : "general";

    const summaryMatch = block.match(/(?:\*\*)?Summary:(?:\*\*)?\s*([^\n]+)/i);
    const summary = summaryMatch
      ? summaryMatch[1]
          .trim()
          .replace(/^\*\*|\*\*$/g, "")
          .trim()
      : headerLine;

    const cmdMatch = block.match(/(?:\*\*)?Command:(?:\*\*)?\s*`?([^`\n]+)`?/i);
    const command = cmdMatch
      ? cmdMatch[1]
          .trim()
          .replace(/^\*\*|\*\*$/g, "")
          .trim()
      : undefined;

    return {
      id,
      requestingBot,
      tool,
      actionCategory,
      summary,
      status,
      command,
    };
  });
}

export function parseMissionConsensus(raw: string, slugFallback = "mission"): MissionConsensus {
  const titleMatch = raw.match(/^# Mission:\s*([^\n]+)/m);
  const title = (titleMatch?.[1] ?? slugFallback).trim();

  const statusMatch = raw.match(/^STATUS:\s*([^\n]+)/m);
  const rawStatus = (statusMatch?.[1] ?? "PLANNING").trim().toUpperCase();
  const validStatuses: MissionStatus[] = [
    "PLANNING",
    "IN PROGRESS",
    "PAUSED",
    "BLOCKED",
    "DONE",
    "ABORTED",
  ];
  const status: MissionStatus = validStatuses.includes(rawStatus as MissionStatus)
    ? (rawStatus as MissionStatus)
    : "PLANNING";

  const slugMatch = raw.match(/^MISSION_SLUG:\s*([^\n]+)/m);
  const slug = (slugMatch?.[1] ?? slugFallback).trim();

  const projectMatch = raw.match(/^PROJECT_ID:\s*([^\n]+)/m);
  const projectId =
    projectMatch && !Number.isNaN(Number(projectMatch[1])) ? Number(projectMatch[1]) : null;

  const managerMatch = raw.match(/^MANAGER:\s*([^\n]+)/m);
  const manager = (managerMatch?.[1] ?? "Lead-Strategist").trim();

  const createdMatch = raw.match(/^CREATED:\s*([^\n]+)/m);
  const createdAt = (createdMatch?.[1] ?? new Date().toISOString()).trim();

  const updatedMatch = raw.match(/^UPDATED:\s*([^\n]+)/m);
  const updatedAt = (updatedMatch?.[1] ?? new Date().toISOString()).trim();
  const headerValue = (name: string): string | undefined =>
    raw.match(new RegExp(`^${name}:\\s*([^\\n]*)`, "m"))?.[1]?.trim();
  const headerBoolean = (name: string, fallback: boolean): boolean => {
    const value = headerValue(name);
    return value == null || value === "" ? fallback : value.toLowerCase() === "true";
  };

  // Objective & Context
  const objContextRegex = /## [0-9.]*\s*Objective & Context[^\n]*\n([\s\S]*?)(?=\n## |$)/i;
  const objContextRaw = extractSectionContent(raw, objContextRegex);
  const objMatch = objContextRaw.match(/[-*]\s*\*\*Objective:\*\*\s*([^\n]+)/i);
  const objective = (objMatch?.[1] ?? "Execute autonomous mission").trim();

  const contextLines = objContextRaw
    .split("\n")
    .filter((l) => /[-*]\s*\*\*Context(?:\s*&\s*Docs)?:\*\*/i.test(l))
    .map((l) => l.replace(/^[-*]\s*\*\*Context(?:\s*&\s*Docs)?:\*\*\s*/i, "").trim());

  const deliverableLines = objContextRaw
    .split("\n")
    .filter((l) => /[-*]\s*\*\*Deliverables?:\*\*/i.test(l))
    .map((l) => l.replace(/^[-*]\s*\*\*Deliverables?:\*\*\s*/i, "").trim());

  const milestones = parseMilestones(raw);
  const teamRoster = parseTeamRoster(raw);
  const approvalsPending = parseApprovalsPending(raw);
  const decisionEntries = extractSectionList(raw, "Consensus & Decisions Log");
  const guardrails = decisionEntries
    .filter((entry) => /^\*?Guardrail:\*?/i.test(entry))
    .map((entry) => entry.replace(/^\*?Guardrail:\*?\s*/i, ""));
  const decisions = decisionEntries.filter((entry) => !/^\*?Guardrail:\*?/i.test(entry));
  const history = extractSectionList(raw, "Execution Ledger & History");

  return {
    title,
    slug,
    status,
    projectId,
    manager,
    createdAt,
    updatedAt,
    objective,
    context: contextLines,
    deliverables: deliverableLines,
    milestones,
    teamRoster,
    approvalsPending,
    decisions,
    guardrails,
    history,
    hitlPolicy: {
      enabled: headerBoolean("HITL_ENABLED", true),
      blockExternalCommunication: headerBoolean("HITL_EXTERNAL_COMMUNICATION", true),
      blockGitPush: headerBoolean("HITL_GIT_PUSH", true),
      blockFinancialSpend: headerBoolean("HITL_FINANCIAL_SPEND", true),
      blockDestructiveFs: headerBoolean("HITL_DESTRUCTIVE_FS", true),
    },
    activeBot: headerValue("ACTIVE_BOT") || null,
    nextMilestoneId: headerValue("NEXT_MILESTONE") || null,
    lastError: headerValue("LAST_ERROR") || null,
  };
}

export function renderMissionConsensus(c: MissionConsensus): string {
  const listItems = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  const milestonesText = c.milestones.length
    ? c.milestones
        .map((m) => {
          const check = m.status === "done" ? "x" : m.status === "in_progress" ? "/" : " ";
          const botTag = m.botName ? ` [🤖 ${m.botName}]` : "";
          return `- [${check}] ${m.title}${botTag}`;
        })
        .join("\n")
    : "- [ ] Phase 1: Strategic Planning [🤖 Lead-Strategist]";

  const rosterText = c.teamRoster.length
    ? c.teamRoster
        .map((r) => {
          const mcpStr = r.mcpTools?.length ? ` Equipped with ${r.mcpTools.join(", ")} MCPs.` : "";
          return `- **${r.name}** (${r.role}): ${r.responsibilities}.${mcpStr}`;
        })
        .join("\n")
    : `- **${c.manager}** (Manager): Directs workflow and manages consensus.`;

  const approvalsText = c.approvalsPending.length
    ? c.approvalsPending
        .map((a) => {
          const check = a.status === "approved" ? "x" : " ";
          const cmdLine = a.command ? `\n  - **Command:** \`${a.command}\`` : "";
          return `- [${check}] [ID: ${a.id}] ${a.summary}\n  - **Requesting Bot:** 🤖 ${a.requestingBot}\n  - **Tool:** \`${a.tool}\`\n  - **Action Category:** \`${a.actionCategory}\`\n  - **Status:** ${a.status === "pending" ? "BLOCKED_AWAITING_APPROVAL" : a.status.toUpperCase()}${cmdLine}`;
        })
        .join("\n\n")
    : "- (No pending approvals)";

  return [
    `# Mission: ${c.title}`,
    "",
    `STATUS: ${c.status}`,
    `PROJECT_ID: ${c.projectId ?? ""}`,
    `MISSION_SLUG: ${c.slug}`,
    `MANAGER: ${c.manager}`,
    `CREATED: ${c.createdAt}`,
    `UPDATED: ${c.updatedAt}`,
    `ACTIVE_BOT: ${c.activeBot ?? ""}`,
    `NEXT_MILESTONE: ${c.nextMilestoneId ?? ""}`,
    `LAST_ERROR: ${c.lastError ?? ""}`,
    `HITL_ENABLED: ${c.hitlPolicy.enabled}`,
    `HITL_EXTERNAL_COMMUNICATION: ${c.hitlPolicy.blockExternalCommunication}`,
    `HITL_GIT_PUSH: ${c.hitlPolicy.blockGitPush}`,
    `HITL_FINANCIAL_SPEND: ${c.hitlPolicy.blockFinancialSpend}`,
    `HITL_DESTRUCTIVE_FS: ${c.hitlPolicy.blockDestructiveFs}`,
    "",
    "## 1. Objective & Context",
    `- **Objective:** ${c.objective}`,
    `- **Context & Docs:** ${c.context.length ? c.context.join("; ") : "Attached project workspace"}`,
    `- **Deliverables:** ${c.deliverables.length ? c.deliverables.join("; ") : "Completed milestones and verified artifacts"}`,
    "",
    "## 2. Milestones & Progress",
    milestonesText,
    "",
    "## 3. Team Roster & Responsibilities",
    rosterText,
    "",
    "## 4. Approvals Pending (HITL)",
    approvalsText,
    "",
    "## 5. Consensus & Decisions Log",
    c.decisions.length || c.guardrails.length
      ? [
          ...(c.decisions.length ? c.decisions.map((decision) => `- ${decision}`) : []),
          ...c.guardrails.map((guardrail) => `- *Guardrail:* ${guardrail}`),
        ].join("\n")
      : "- Initial consensus established.",
    "",
    "## 6. Execution Ledger & History",
    c.history.length
      ? listItems(c.history)
      : `- [${c.createdAt}] [${c.manager}] Mission initialized.`,
    "",
  ].join("\n");
}

export function readMissionConsensus(projectPath: string, slug: string): MissionConsensus {
  const filePath = missionConsensusFilePath(projectPath, slug);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Consensus file not found for mission '${slug}' at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return parseMissionConsensus(raw, slug);
}

export function writeMissionConsensus(
  projectPath: string,
  slug: string,
  updates: Partial<MissionConsensus>,
): MissionConsensus {
  const dir = missionDirPath(projectPath, slug);
  const artifactsDir = missionArtifactsDirPath(projectPath, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

  let current: MissionConsensus;
  try {
    current = readMissionConsensus(projectPath, slug);
  } catch {
    current = {
      title: updates.title || slug,
      slug,
      status: "PLANNING",
      projectId: updates.projectId ?? null,
      manager: updates.manager || "Lead-Strategist",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      objective: updates.objective || "Autonomous mission",
      context: updates.context || [],
      deliverables: updates.deliverables || [],
      milestones: updates.milestones || [],
      teamRoster: updates.teamRoster || [],
      approvalsPending: updates.approvalsPending || [],
      decisions: updates.decisions || [],
      guardrails: updates.guardrails || [],
      history: updates.history || [],
      hitlPolicy: updates.hitlPolicy || DEFAULT_MISSION_HITL_POLICY,
      activeBot: updates.activeBot ?? null,
      nextMilestoneId: updates.nextMilestoneId ?? null,
      lastError: updates.lastError ?? null,
    };
  }

  const merged: MissionConsensus = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    history: updates.history
      ? updates.history.slice(0, MAX_HISTORY_LINES)
      : current.history.slice(0, MAX_HISTORY_LINES),
  };

  const rendered = renderMissionConsensus(merged);
  const targetPath = missionConsensusFilePath(projectPath, slug);
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, rendered, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original persistence error.
    }
    throw error;
  }
  return merged;
}

export function listMissions(projectPath: string): MissionSummary[] {
  const root = missionsRootDir(projectPath);
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const summaries: MissionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const consensusFile = missionConsensusFilePath(projectPath, slug);
    if (!fs.existsSync(consensusFile)) continue;

    try {
      const consensus = readMissionConsensus(projectPath, slug);
      const totalMilestones = consensus.milestones.length;
      const completedMilestones = consensus.milestones.filter((m) => m.status === "done").length;
      const pendingApprovalsCount = consensus.approvalsPending.filter(
        (a) => a.status === "pending",
      ).length;

      summaries.push({
        slug,
        title: consensus.title,
        status: consensus.status,
        manager: consensus.manager,
        createdAt: consensus.createdAt,
        updatedAt: consensus.updatedAt,
        objective: consensus.objective,
        totalMilestones,
        completedMilestones,
        pendingApprovalsCount,
      });
    } catch {
      // ignore corrupt directories
    }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createMission(
  projectPath: string,
  input: {
    title: string;
    slug?: string;
    objective: string;
    context?: string[];
    deliverables?: string[];
    projectId?: number | null;
    manager?: string;
    milestones?: MissionMilestone[];
    teamRoster?: MissionTeamMember[];
    hitlPolicy?: MissionHitlPolicy;
  },
): MissionConsensus {
  const slug = input.slug || slugify(input.title);
  assertMissionSlug(slug);
  if (fs.existsSync(missionConsensusFilePath(projectPath, slug))) {
    throw new Error(`Mission '${slug}' already exists`);
  }
  const now = new Date().toISOString();
  const initial: MissionConsensus = {
    title: input.title,
    slug,
    status: "PLANNING",
    projectId: input.projectId ?? null,
    manager: input.manager || "Lead-Strategist",
    createdAt: now,
    updatedAt: now,
    objective: input.objective,
    context: input.context || [],
    deliverables: input.deliverables || [],
    milestones: input.milestones ?? [
      {
        id: "milestone-1",
        title: "Strategic Planning & Team Decomposition",
        status: "in_progress",
        botName: input.manager || "Lead-Strategist",
      },
    ],
    teamRoster: input.teamRoster ?? [
      {
        name: input.manager || "Lead-Strategist",
        role: "Manager",
        responsibilities: "Directs strategy, unblocks sub-workers, coordinates consensus ledger",
      },
    ],
    approvalsPending: [],
    decisions: ["Mission created. Initiating strategic decomposition."],
    guardrails: [],
    history: [`[${now}] [${input.manager || "Lead-Strategist"}] Mission created.`],
    hitlPolicy: input.hitlPolicy ?? DEFAULT_MISSION_HITL_POLICY,
    activeBot: input.manager || "Lead-Strategist",
    nextMilestoneId: input.milestones?.[0]?.id ?? "milestone-1",
    lastError: null,
  };

  return writeMissionConsensus(projectPath, slug, initial);
}

export function appendMissionHistory(
  projectPath: string,
  slug: string,
  historyLine: string,
): MissionConsensus {
  const current = readMissionConsensus(projectPath, slug);
  const timestamp = new Date().toISOString();
  const formatted = historyLine.startsWith("[") ? historyLine : `[${timestamp}] ${historyLine}`;
  return writeMissionConsensus(projectPath, slug, {
    history: [formatted, ...current.history].slice(0, MAX_HISTORY_LINES),
  });
}

export function recordPendingApproval(
  projectPath: string,
  slug: string,
  approval: Omit<MissionApprovalPending, "status">,
): MissionConsensus {
  const current = readMissionConsensus(projectPath, slug);
  const existingIdx = current.approvalsPending.findIndex((a) => a.id === approval.id);
  const updatedApprovals = [...current.approvalsPending];

  const pendingEntry: MissionApprovalPending = {
    ...approval,
    status: "pending",
  };

  if (existingIdx >= 0) {
    updatedApprovals[existingIdx] = pendingEntry;
  } else {
    updatedApprovals.push(pendingEntry);
  }

  return writeMissionConsensus(projectPath, slug, {
    status: "BLOCKED",
    approvalsPending: updatedApprovals,
    history: [
      `[${new Date().toISOString()}] [${approval.requestingBot}] Requested approval: ${approval.summary} (ID: ${approval.id})`,
      ...current.history,
    ],
  });
}

export function resolvePendingApproval(
  projectPath: string,
  slug: string,
  approvalId: string,
  decision: "approved" | "rejected",
): MissionConsensus {
  const current = readMissionConsensus(projectPath, slug);
  const updatedApprovals = current.approvalsPending.map((a) => {
    if (a.id === approvalId) {
      return { ...a, status: decision };
    }
    return a;
  });

  const stillBlocked = updatedApprovals.some((a) => a.status === "pending");
  const newStatus: MissionStatus = stillBlocked
    ? "BLOCKED"
    : current.status === "BLOCKED"
      ? "IN PROGRESS"
      : current.status;

  return writeMissionConsensus(projectPath, slug, {
    status: newStatus,
    approvalsPending: updatedApprovals,
    history: [
      `[${new Date().toISOString()}] User ${decision} approval request ${approvalId}`,
      ...current.history,
    ],
  });
}
