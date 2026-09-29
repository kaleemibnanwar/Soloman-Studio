// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readConsensus,
  writeConsensus,
  consensusDiff,
  consensusFilePath,
} from "../worker_consensus";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-consensus-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("worker_consensus", () => {
  it("lazily creates the consensus file on first read", () => {
    expect(fs.existsSync(consensusFilePath(dir))).toBe(false);
    const consensus = readConsensus(dir);
    expect(consensus.nextAction).toBe("");
    expect(consensus.history).toEqual([]);
    expect(fs.existsSync(consensusFilePath(dir))).toBe(true);
  });

  it("writes next action and prepends history (newest first)", () => {
    writeConsensus(dir, {
      nextAction: "Do the thing",
      historyLine: "2026-01-01 — proposed: Do the thing",
    });
    writeConsensus(dir, {
      nextAction: "Do the next thing",
      historyLine: "2026-01-02 — proposed: Do the next thing",
    });
    const consensus = readConsensus(dir);
    expect(consensus.nextAction).toBe("Do the next thing");
    expect(consensus.history[0]).toContain("Do the next thing");
    expect(consensus.history[1]).toContain("Do the thing");
  });

  it("produces a compact before/after diff", () => {
    expect(consensusDiff("a", "b")).toBe("- a\n+ b");
    expect(consensusDiff("same", "same")).toBe("(no change)");
  });
});
