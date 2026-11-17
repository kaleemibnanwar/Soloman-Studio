import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require("node:os");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-store-"));
});

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("../../../paths/paths", () => ({
  getUserDataPath: () => tmpDir,
}));

vi.mock("../../../db", () => ({
  db: {
    $client: { prepare: () => ({ get: () => undefined, all: () => [] }) },
  },
}));

import {
  createSkill,
  deleteSkill,
  findSkill,
  listSkills,
  slugify,
  updateSkill,
} from "../skill_store";
import { DEFAULT_SKILLS } from "../default_skills";

beforeEach(() => {
  const skillsPath = path.join(tmpDir, "skills");
  fs.rmSync(skillsPath, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("skill_store", () => {
  it("slugifies names into kebab-case filenames", () => {
    expect(slugify("Deploy App")).toBe("deploy-app");
    expect(slugify("  My_Skill!! ")).toBe("my-skill");
    expect(slugify("")).toBe("");
  });

  it("seeds default skills on initial list", () => {
    const listed = listSkills();
    expect(listed.length).toBeGreaterThanOrEqual(DEFAULT_SKILLS.length);
    for (const def of DEFAULT_SKILLS) {
      expect(findSkill(def.name)).not.toBeNull();
    }
  });

  it("round-trips create/list/read/update/delete and matches by name", () => {
    createSkill({
      name: "Deploy App",
      description: "Ship it",
      instructions: "# Steps\n1. Build",
    });

    const listed = listSkills();
    const custom = listed.find((s) => s.name === "Deploy App");
    expect(custom).toBeDefined();
    expect(custom?.description).toBe("Ship it");
    expect(custom?.instructions).toBe("# Steps\n1. Build");

    const read = findSkill("deploy app");
    expect(read?.description).toBe("Ship it");

    updateSkill("Deploy App", { description: "Ship it fast" });
    expect(findSkill("deploy app")?.description).toBe("Ship it fast");

    expect(deleteSkill("DEPLOY APP")).toBe(true);
    expect(findSkill("Deploy App")).toBeNull();
  });
});
