/**
 * Compaction-resistant task-progress store.
 *
 * Context compaction summarizes the conversation, which is lossy: completed
 * tool calls, their results, key IDs and the current plan position can all be
 * dropped from the summary. This store keeps a small structured record *outside*
 * the conversation history — a JSON file under the app's .octopusStudio/chats/
 * directory (sibling to the compaction transcript backups) — so compaction
 * never touches it and the loop can recover the lost state on resume.
 */

import fs from "node:fs";
import path from "node:path";
import log from "electron-log";

const logger = log.scope("task_progress_store");

export interface TaskProgressStep {
  /** Tool name (e.g. "write_file", "run_tests"). */
  tool: string;
  /** Short human-readable summary of the call (truncated args/result). */
  summary: string;
}

export interface TaskProgress {
  completedSteps: TaskProgressStep[];
  updatedAt: number;
}

// Cap the on-disk record so the file stays small regardless of chat length.
const MAX_STORED_STEPS = 100;
// Cap how many steps are re-injected into the prompt on resume, so the
// reminder doesn't itself become a token cost. Most-recent steps win.
const MAX_PROMPT_STEPS = 50;
// Truncation limit for a single step's summary.
const STEP_SUMMARY_LIMIT = 160;

function storePath(appPath: string, chatId: number): string {
  return path.join(appPath, ".octopusStudio", "chats", String(chatId), "task-progress.json");
}

export function readTaskProgress(appPath: string, chatId: number): TaskProgress | null {
  try {
    const raw = fs.readFileSync(storePath(appPath, chatId), "utf8");
    const parsed = JSON.parse(raw) as Partial<TaskProgress>;
    if (parsed && Array.isArray(parsed.completedSteps)) {
      return {
        completedSteps: parsed.completedSteps.filter(
          (s): s is TaskProgressStep =>
            !!s && typeof s.tool === "string" && typeof s.summary === "string",
        ),
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Append completed steps to the store, deduping by tool+summary and capping to
 * MAX_STORED_STEPS. Accumulates across compactions so a re-compaction extends
 * (rather than replaces) the record of earlier work.
 */
export function recordCompletedSteps(
  appPath: string,
  chatId: number,
  steps: TaskProgressStep[],
): void {
  if (steps.length === 0) {
    return;
  }
  try {
    const filePath = storePath(appPath, chatId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const existing = readTaskProgress(appPath, chatId);
    const seen = new Set<string>();
    const merged: TaskProgressStep[] = [];
    for (const step of [...(existing?.completedSteps ?? []), ...steps]) {
      const key = JSON.stringify([step.tool, step.summary]);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(step);
    }
    const completedSteps = merged.slice(-MAX_STORED_STEPS);
    fs.writeFileSync(filePath, JSON.stringify({ completedSteps, updatedAt: Date.now() }, null, 2));
  } catch (error) {
    logger.warn(`Failed to record task progress for chat ${chatId}:`, error);
  }
}

export function clearTaskProgress(appPath: string, chatId: number): void {
  try {
    fs.rmSync(storePath(appPath, chatId), { force: true });
  } catch {
    // Best-effort: a missing/failed clear just leaves a stale record.
  }
}

/** Collapse whitespace and truncate a step body into a one-line summary. */
function summarizeStepBody(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length > STEP_SUMMARY_LIMIT
    ? `${collapsed.slice(0, STEP_SUMMARY_LIMIT)}…`
    : collapsed;
}

const TOOL_CALL_RE =
  /<octopus-studio-mcp-tool-call\b[^>]*?\btool="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/octopus-studio-mcp-tool-call>/g;

/**
 * Extract the completed tool-call steps from pre-compaction message content.
 * Matches the same `<octopus-studio-mcp-tool-call>` markup that
 * `formatAsTranscript`/`transformToolTags` operate on.
 */
export function extractCompletedSteps(messages: Array<{ content: string }>): TaskProgressStep[] {
  const steps: TaskProgressStep[] = [];
  for (const message of messages) {
    if (!message.content) continue;
    for (const match of message.content.matchAll(TOOL_CALL_RE)) {
      const tool = match[1];
      const body = match[2] ?? "";
      if (!tool) continue;
      steps.push({ tool, summary: summarizeStepBody(body) });
    }
  }
  return steps;
}

/**
 * Render the most-recent completed steps as a compact system-prompt block that
 * lets the model recover context the compaction summary may have dropped.
 */
export function formatTaskProgressForPrompt(progress: TaskProgress): string | null {
  const steps = progress.completedSteps.slice(-MAX_PROMPT_STEPS);
  if (steps.length === 0) {
    return null;
  }
  const lines = steps.map((s) => `- ${s.tool}: ${s.summary}`).join("\n");
  const omitted = progress.completedSteps.length - steps.length;
  return [
    "# Task progress (from before compaction)",
    "The following steps were already completed before this conversation was",
    "summarized. Do not redo them unless the user explicitly asks you to.",
    omitted > 0 ? `(${omitted} earlier steps omitted; only the most recent are shown.)` : "",
    lines,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
