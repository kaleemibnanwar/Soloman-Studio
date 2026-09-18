import fs from "node:fs";
import path from "node:path";

/**
 * Per-project consensus memory — modeled on Auto-Company's `consensus.md`:
 * the cross-cycle "baton" that the autonomous planner reads and rewrites. A
 * plain markdown file, git-tracked like any other project file.
 */

export interface Consensus {
  lastUpdated: string;
  phase: string;
  nextAction: string;
  activeProjects: string[];
  whatWeDid: string[];
  keyDecisions: string[];
  openQuestions: string[];
  history: string[];
}

const CONSENSUS_FILE = ".workers/consensus.md";
const MAX_HISTORY_LINES = 50;

const DEFAULT_PHASE = "Exploring";

const EMPTY: Consensus = {
  lastUpdated: "",
  phase: DEFAULT_PHASE,
  nextAction: "",
  activeProjects: [],
  whatWeDid: [],
  keyDecisions: [],
  openQuestions: [],
  history: [],
};

export function consensusFilePath(projectPath: string): string {
  return path.join(projectPath, CONSENSUS_FILE);
}

function section(raw: string, heading: string): string[] {
  const match = raw.match(
    new RegExp(`## ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, "i"),
  );
  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

function first(raw: string, heading: string): string {
  return section(raw, heading)[0] ?? "";
}

export function parseConsensus(raw: string): Consensus {
  return {
    lastUpdated: first(raw, "Last Updated"),
    phase: first(raw, "Current Phase") || DEFAULT_PHASE,
    nextAction: first(raw, "Next Action"),
    activeProjects: section(raw, "Active Projects"),
    whatWeDid: section(raw, "What We Did"),
    keyDecisions: section(raw, "Key Decisions"),
    openQuestions: section(raw, "Open Questions"),
    history: section(raw, "History"),
  };
}

export function readConsensus(projectPath: string): Consensus {
  const filePath = consensusFilePath(projectPath);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, render(EMPTY), "utf8");
  }
  return parseConsensus(fs.readFileSync(filePath, "utf8"));
}

export function writeConsensus(
  projectPath: string,
  update: { phase?: string; nextAction?: string; historyLine?: string },
): void {
  const existing = readConsensus(projectPath);
  const next: Consensus = {
    lastUpdated: new Date().toISOString(),
    phase: update.phase ?? existing.phase,
    nextAction: update.nextAction ?? existing.nextAction,
    activeProjects: existing.activeProjects,
    whatWeDid: existing.whatWeDid,
    keyDecisions: existing.keyDecisions,
    openQuestions: existing.openQuestions,
    history: update.historyLine
      ? [update.historyLine, ...existing.history].slice(0, MAX_HISTORY_LINES)
      : existing.history,
  };
  fs.writeFileSync(consensusFilePath(projectPath), render(next), "utf8");
}

function render(c: Consensus): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    "# Consensus",
    "",
    "## Last Updated",
    c.lastUpdated || "",
    "",
    "## Current Phase",
    c.phase,
    "",
    "## Next Action",
    c.nextAction,
    "",
    "## Active Projects",
    list(c.activeProjects),
    "",
    "## What We Did",
    list(c.whatWeDid),
    "",
    "## Key Decisions",
    list(c.keyDecisions),
    "",
    "## Open Questions",
    list(c.openQuestions),
    "",
    "## History",
    list(c.history),
    "",
  ].join("\n");
}

export function consensusDiff(before: string, after: string): string {
  const b = before.trim();
  const a = after.trim();
  if (b === a) return "(no change)";
  return `- ${b}\n+ ${a}`;
}
