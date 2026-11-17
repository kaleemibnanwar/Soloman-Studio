import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMission,
  listMissionArtifacts,
  listMissions,
  missionArtifactsDirPath,
  missionConsensusFilePath,
  parseMissionConsensus,
  readMissionConsensus,
  recordPendingApproval,
  renderMissionConsensus,
  resolvePendingApproval,
} from "../mission_consensus";

describe("mission_consensus", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-consensus-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new mission with default structure", () => {
    const mission = createMission(tmpDir, {
      title: "Lead Generation & Outreach",
      objective: "Extract 50 qualified CTO profiles and craft cold emails",
      context: ["docs/market-analysis.md"],
      deliverables: ["artifacts/leads.json"],
      projectId: 42,
      manager: "Lead-Strategist",
    });

    expect(mission.slug).toBe("lead-generation-outreach");
    expect(mission.status).toBe("PLANNING");
    expect(mission.projectId).toBe(42);
    expect(mission.milestones.length).toBeGreaterThan(0);
    expect(mission.teamRoster.length).toBeGreaterThan(0);

    const filePath = missionConsensusFilePath(tmpDir, "lead-generation-outreach");
    expect(fs.existsSync(filePath)).toBe(true);

    const reloaded = readMissionConsensus(tmpDir, "lead-generation-outreach");
    expect(reloaded.title).toBe("Lead Generation & Outreach");
    expect(reloaded.objective).toBe("Extract 50 qualified CTO profiles and craft cold emails");
  });

  it("lists all created missions", () => {
    createMission(tmpDir, {
      title: "Alpha Mission",
      objective: "First objective",
    });
    createMission(tmpDir, {
      title: "Beta Mission",
      objective: "Second objective",
    });

    const missions = listMissions(tmpDir);
    expect(missions.length).toBe(2);
    const slugs = missions.map((m) => m.slug);
    expect(slugs).toContain("alpha-mission");
    expect(slugs).toContain("beta-mission");
  });

  it("handles pending approvals and status transitions to BLOCKED and back", () => {
    createMission(tmpDir, {
      title: "Outreach Bot",
      slug: "outreach-bot",
      objective: "Send automated cold emails",
    });

    // Record an approval
    const blockedMission = recordPendingApproval(tmpDir, "outreach-bot", {
      id: "apprv_999",
      requestingBot: "Commercial Communicator",
      tool: "gmail_send_message",
      actionCategory: "external_communication",
      summary: "Send email to Sarah (CTO at Acme)",
      command: "gmail_send(to='sarah@acme.com')",
    });

    expect(blockedMission.status).toBe("BLOCKED");
    expect(blockedMission.approvalsPending.length).toBe(1);
    expect(blockedMission.approvalsPending[0].status).toBe("pending");

    // Resolve approval
    const resolvedMission = resolvePendingApproval(tmpDir, "outreach-bot", "apprv_999", "approved");

    expect(resolvedMission.status).toBe("IN PROGRESS");
    expect(resolvedMission.approvalsPending[0].status).toBe("approved");
    expect(resolvedMission.history[0]).toContain("approved");
  });

  it("round-trips render and parse correctly with bot attributions", () => {
    const raw = `# Mission: Full Lifecycle Test

STATUS: IN PROGRESS
PROJECT_ID: 10
MISSION_SLUG: full-lifecycle-test
MANAGER: Orchestrator
CREATED: 2026-11-11T03:00:00Z
UPDATED: 2026-11-11T03:15:00Z

## 1. Objective & Context
- **Objective:** Deploy high-converting landing page
- **Context & Docs:** specs/design.md
- **Deliverables:** public/index.html

## 2. Milestones & Progress
- [x] Phase 1: Wireframe Review [🤖 Lead-Strategist]
- [/] Phase 2: React Implementation [🤖 Code Steward]
- [ ] Phase 3: Playwright Testing [🤖 QA Sentinel]

## 3. Team Roster & Responsibilities
- **Orchestrator** (Manager): Overall lead
- **Code Steward** (Builder): Component author. Equipped with Filesystem, Git MCPs.
- **QA Sentinel** (Tester): Automated regression tester.

## 4. Approvals Pending (HITL)
- [ ] [ID: apprv_10] Deploy to production
  - **Requesting Bot:** 🤖 Code Steward
  - **Tool:** \`vercel_deploy\`
  - **Action Category:** \`deployment\`
  - **Status:** BLOCKED_AWAITING_APPROVAL

## 5. Consensus & Decisions Log
- Tailwind v4 used for styling.

## 6. Execution Ledger & History
- [2026-11-11T03:00:00Z] Started phase 1.
`;

    const parsed = parseMissionConsensus(raw, "full-lifecycle-test");
    expect(parsed.title).toBe("Full Lifecycle Test");
    expect(parsed.status).toBe("IN PROGRESS");
    expect(parsed.projectId).toBe(10);
    expect(parsed.milestones.length).toBe(3);
    expect(parsed.milestones[0].status).toBe("done");
    expect(parsed.milestones[0].botName).toBe("Lead-Strategist");
    expect(parsed.milestones[1].status).toBe("in_progress");
    expect(parsed.milestones[1].botName).toBe("Code Steward");
    expect(parsed.milestones[2].status).toBe("todo");
    expect(parsed.milestones[2].botName).toBe("QA Sentinel");

    expect(parsed.approvalsPending.length).toBe(1);
    expect(parsed.approvalsPending[0].requestingBot).toBe("Code Steward");
    expect(parsed.approvalsPending[0].tool).toBe("vercel_deploy");

    const reRendered = renderMissionConsensus(parsed);
    expect(reRendered).toContain("Full Lifecycle Test");
    expect(reRendered).toContain("[🤖 Code Steward]");
  });

  it("round-trips guardrails and rejected approvals", () => {
    const mission = createMission(tmpDir, {
      title: "Guarded Outreach",
      objective: "Draft safe outreach",
    });
    const rendered = renderMissionConsensus({
      ...mission,
      guardrails: ["Plain text email only"],
      approvalsPending: [
        {
          id: "apprv_rejected",
          requestingBot: "Commercial Communicator",
          tool: "gmail_send_message",
          actionCategory: "external_communication",
          summary: "Send draft",
          status: "rejected",
        },
      ],
    });

    const parsed = parseMissionConsensus(rendered, mission.slug);
    expect(parsed.guardrails).toEqual(["Plain text email only"]);
    expect(parsed.approvalsPending[0].status).toBe("rejected");
  });

  it("rejects unsafe and duplicate mission slugs", () => {
    expect(() =>
      createMission(tmpDir, {
        title: "Unsafe",
        slug: "../unsafe",
        objective: "Escape the workspace",
      }),
    ).toThrow("Invalid mission slug");

    createMission(tmpDir, { title: "Unique", slug: "unique", objective: "First" });
    expect(() =>
      createMission(tmpDir, { title: "Duplicate", slug: "unique", objective: "Second" }),
    ).toThrow("already exists");
  });

  it("lists generated mission artifacts and reports", () => {
    const mission = createMission(tmpDir, {
      title: "Lead Gen",
      slug: "lead-gen",
      objective: "Gather leads",
    });

    const artifactsDir = missionArtifactsDirPath(tmpDir, mission.slug);
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "qa-certification-report.md"), "# QA Passed");
    fs.writeFileSync(path.join(artifactsDir, "leads.json"), "[]");

    const artifacts = listMissionArtifacts(tmpDir, mission.slug);
    expect(artifacts.length).toBe(2);
    const report = artifacts.find((a) => a.name === "qa-certification-report.md");
    expect(report).toBeDefined();
    expect(report?.isReport).toBe(true);
    expect(report?.extension).toBe(".md");
    const dataset = artifacts.find((a) => a.name === "leads.json");
    expect(dataset).toBeDefined();
  });
});
