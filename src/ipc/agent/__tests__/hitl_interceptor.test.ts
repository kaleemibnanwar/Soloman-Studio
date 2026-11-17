import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMission } from "../../utils/mission_consensus";
import {
  categorizeToolAction,
  handleIncomingApprovalResponse,
  requestHitlApproval,
  shouldInterceptTool,
} from "../hitl_interceptor";

describe("hitl_interceptor", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-test-"));
    createMission(tmpDir, {
      title: "Lead Generation",
      slug: "lead-generation",
      objective: "Prospect leads and send outreach",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accurately categorizes sensitive actions", () => {
    expect(categorizeToolAction("gmail_send_message")).toBe("external_communication");
    expect(categorizeToolAction("sendgrid_send_mail")).toBe("external_communication");
    expect(categorizeToolAction("git_push")).toBe("git_push");
    expect(categorizeToolAction("charge_customer_card")).toBe("financial_spend");
    expect(categorizeToolAction("delete_database")).toBe("destructive_fs");
    expect(categorizeToolAction("execute_command", { command: "git push origin main" })).toBe(
      "git_push",
    );
    expect(categorizeToolAction("delete_file", { path: "tmp.txt" })).toBe("destructive_fs");
    expect(categorizeToolAction("read_file")).toBeNull();
  });

  it("evaluates HITL policy flags correctly", () => {
    const { shouldBlock } = shouldInterceptTool("gmail_send_message");
    expect(shouldBlock).toBe(true);

    const safe = shouldInterceptTool("read_file");
    expect(safe.shouldBlock).toBe(false);

    const disabled = shouldInterceptTool(
      "gmail_send_message",
      {},
      {
        enabled: false,
        blockExternalCommunication: true,
        blockGitPush: true,
        blockFinancialSpend: true,
        blockDestructiveFs: true,
      },
    );
    expect(disabled.shouldBlock).toBe(false);
  });

  it("suspends execution and resumes when approved via response signal", async () => {
    const broadcastMock = vi.fn();

    const approvalPromise = requestHitlApproval({
      projectPath: tmpDir,
      missionSlug: "lead-generation",
      requestingBot: "Commercial Communicator",
      toolName: "gmail_send_message",
      args: { to: "ceo@acme.com", subject: "Intro" },
      summary: "Send intro email to CEO at Acme",
      onBroadcast: broadcastMock,
    });

    expect(broadcastMock).toHaveBeenCalledTimes(1);
    const broadcastPayload = broadcastMock.mock.calls[0][0];
    expect(broadcastPayload.botName).toBe("Commercial Communicator");
    expect(broadcastPayload.approvalId).toBeDefined();

    // Simulate approval from mobile
    const handled = handleIncomingApprovalResponse(broadcastPayload.approvalId, "approved");
    expect(handled).toBe(true);

    const outcome = await approvalPromise;
    expect(outcome.approved).toBe(true);
    expect(outcome.reason).toBeUndefined();
  });
});
