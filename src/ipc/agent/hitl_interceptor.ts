import { EventEmitter } from "node:events";
import {
  readMissionConsensus,
  recordPendingApproval,
  resolvePendingApproval,
} from "../utils/mission_consensus";

export interface ApprovalPendingBroadcast {
  approvalId: string;
  botName: string;
  action: string;
  explanation: string;
  command: string;
}

export const hitlEvents = new EventEmitter();

export interface HitlPolicy {
  enabled: boolean;
  blockExternalCommunication: boolean;
  blockGitPush: boolean;
  blockFinancialSpend: boolean;
  blockDestructiveFs: boolean;
}

export const DEFAULT_HITL_POLICY: HitlPolicy = {
  enabled: true,
  blockExternalCommunication: true,
  blockGitPush: true,
  blockFinancialSpend: true,
  blockDestructiveFs: true,
};

export function getMissionHitlPolicy(projectPath: string, missionSlug: string): HitlPolicy {
  try {
    return readMissionConsensus(projectPath, missionSlug).hitlPolicy;
  } catch {
    return DEFAULT_HITL_POLICY;
  }
}

export type ActionCategory =
  | "external_communication"
  | "git_push"
  | "financial_spend"
  | "destructive_fs"
  | "general";

interface ApprovalDeferred {
  approvalId: string;
  projectPath: string;
  missionSlug: string;
  resolve: (decision: "approved" | "rejected", feedback?: string) => void;
  timer: NodeJS.Timeout;
}

// In-memory registry of awaiting approval promises
const activeApprovals = new Map<string, ApprovalDeferred>();

export function categorizeToolAction(
  toolName: string,
  args: Record<string, unknown> = {},
): ActionCategory | null {
  const normalized = toolName.toLowerCase();
  const argumentText = JSON.stringify(args).toLowerCase();

  // External communication: emails, webhooks, social posts, Slack
  if (
    normalized.includes("email") ||
    normalized.startsWith("gmail") ||
    normalized.startsWith("sendgrid") ||
    normalized.startsWith("resend") ||
    normalized.includes("slack_post") ||
    normalized.includes("send_message") ||
    argumentText.includes("webhook")
  ) {
    return "external_communication";
  }

  // Remote Git mutations
  if (
    normalized === "git_push" ||
    normalized.includes("push_remote") ||
    normalized.includes("push_branch") ||
    /\bgit\s+push\b/.test(argumentText)
  ) {
    return "git_push";
  }

  // Financial spend
  if (
    normalized.includes("charge") ||
    normalized.includes("payment") ||
    normalized.includes("purchase") ||
    argumentText.includes("paid_api")
  ) {
    return "financial_spend";
  }

  // Destructive FS or DB
  if (
    normalized.includes("delete_database") ||
    normalized.includes("drop_table") ||
    normalized.includes("rm_rf") ||
    normalized === "delete_file" ||
    /(^|\s)rm\s+(-[^\s]*r[^\s]*f|--recursive)(\s|$)/.test(argumentText) ||
    argumentText.includes("drop table")
  ) {
    return "destructive_fs";
  }

  return null;
}

export function shouldInterceptTool(
  toolName: string,
  args: Record<string, unknown> = {},
  policy: HitlPolicy = DEFAULT_HITL_POLICY,
): { shouldBlock: boolean; category: ActionCategory | null } {
  if (!policy.enabled) {
    return { shouldBlock: false, category: null };
  }

  const category = categorizeToolAction(toolName, args);
  if (!category) {
    return { shouldBlock: false, category: null };
  }

  let shouldBlock = false;
  if (category === "external_communication" && policy.blockExternalCommunication) {
    shouldBlock = true;
  } else if (category === "git_push" && policy.blockGitPush) {
    shouldBlock = true;
  } else if (category === "financial_spend" && policy.blockFinancialSpend) {
    shouldBlock = true;
  } else if (category === "destructive_fs" && policy.blockDestructiveFs) {
    shouldBlock = true;
  }

  return { shouldBlock, category };
}

export interface InterceptParams {
  projectPath: string;
  missionSlug: string;
  requestingBot: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  timeoutMs?: number;
  onBroadcast?: (payload: ApprovalPendingBroadcast) => void;
  policy?: HitlPolicy;
}

export async function requestHitlApproval(
  params: InterceptParams,
): Promise<{ approved: boolean; reason?: string }> {
  const interception = shouldInterceptTool(
    params.toolName,
    params.args,
    params.policy ?? getMissionHitlPolicy(params.projectPath, params.missionSlug),
  );
  if (!interception.shouldBlock) return { approved: true };
  const approvalId = `apprv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const category = interception.category || "general";
  const commandStr = `${params.toolName}(${JSON.stringify(params.args).slice(0, 200)})`;

  // 1. Record in mission consensus ledger
  recordPendingApproval(params.projectPath, params.missionSlug, {
    id: approvalId,
    requestingBot: params.requestingBot,
    tool: params.toolName,
    actionCategory: category,
    summary: params.summary,
    command: commandStr,
    createdAt: new Date().toISOString(),
  });

  // 2. Broadcast via callback (e.g. to Soloman Mobile Bridge)
  const broadcast: ApprovalPendingBroadcast = {
    approvalId,
    botName: params.requestingBot,
    action: params.toolName,
    explanation: params.summary,
    command: commandStr,
  };
  params.onBroadcast?.(broadcast);
  hitlEvents.emit("approval_pending", broadcast);

  // 3. Defer promise waiting for approval response (or timeout after 10 mins)
  const timeoutMs = params.timeoutMs ?? 10 * 60 * 1000;
  return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
    const timer = setTimeout(() => {
      activeApprovals.delete(approvalId);
      resolvePendingApproval(params.projectPath, params.missionSlug, approvalId, "rejected");
      resolve({
        approved: false,
        reason: "Approval request timed out after 10 minutes without response.",
      });
    }, timeoutMs);

    activeApprovals.set(approvalId, {
      approvalId,
      projectPath: params.projectPath,
      missionSlug: params.missionSlug,
      timer,
      resolve: (decision, feedback) => {
        clearTimeout(timer);
        activeApprovals.delete(approvalId);
        resolvePendingApproval(params.projectPath, params.missionSlug, approvalId, decision);
        resolve({
          approved: decision === "approved",
          reason:
            decision === "approved" ? undefined : feedback?.trim() || "Action rejected by user.",
        });
      },
    });
  });
}

export function handleIncomingApprovalResponse(
  approvalId: string,
  decision: "approved" | "rejected",
  feedback?: string,
): boolean {
  const deferred = activeApprovals.get(approvalId);
  if (!deferred) return false;

  deferred.resolve(decision, feedback);
  return true;
}

export function getActivePendingApprovalsCount(): number {
  return activeApprovals.size;
}
