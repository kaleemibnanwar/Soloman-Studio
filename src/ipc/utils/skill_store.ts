import fs from "node:fs";
import path from "node:path";
import { getUserDataPath } from "../../paths/paths";
import { db } from "../../db";
import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { DEFAULT_SKILLS } from "./default_skills";
import log from "electron-log";

/**
 * Filesystem-backed skill store. Each skill is a `<slug>.md` file with YAML
 * frontmatter (Antigravity SKILL.md shape) living under `{userData}/skills/`,
 * so skills are global across every project and the home/default chat — not
 * scoped to a DB or an app.
 */

const logger = log.scope("skill-store");
const SKILLS_SUBDIR = "skills";

export interface SkillRecord {
  name: string;
  description: string;
  instructions: string;
  updatedAt: Date;
}

export function skillsDir(): string {
  return path.join(getUserDataPath(), SKILLS_SUBDIR);
}

/** Lowercase-kebab a skill name into a safe filename slug. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureSkillsDir(): void {
  fs.mkdirSync(skillsDir(), { recursive: true });
}

let migratedFromDb = false;

/**
 * One-time migration of legacy SQLite `skills` rows into `<userData>/skills/*.md`
 * files, then drops the table. Runs lazily on the first `listSkills()` — which
 * is always after the DB has been initialized (handlers/agents only read
 * skills once the app is ready). Idempotent and best-effort.
 */
function migrateFromDbOnce(): void {
  if (migratedFromDb) return;
  migratedFromDb = true;
  try {
    const client = db.$client;
    const hasTable = client
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills'")
      .get();
    if (!hasTable) return;

    const rows = client.prepare("SELECT name, description, instructions FROM skills").all() as {
      name: string;
      description: string;
      instructions: string;
    }[];

    ensureSkillsDir();
    for (const row of rows) {
      const file = path.join(skillsDir(), `${slugify(row.name)}.md`);
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, serializeSkillFile(row), "utf8");
      }
    }

    client.exec("DROP TABLE IF EXISTS skills");
    logger.info(`Migrated ${rows.length} skill(s) from DB to files and dropped the skills table.`);
  } catch (error) {
    logger.warn(
      `Skill migration skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parse a SKILL.md file: a `---`-delimited frontmatter block of `key: value`
 * lines followed by a markdown body. Hand-rolled (no YAML dependency) — skills
 * only need the two scalar frontmatter fields `name` and `description`.
 */
function parseSkillFile(content: string, fileName: string): SkillRecord {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new OctopusStudioError(
      `Invalid skill file "${fileName}": missing frontmatter.`,
      OctopusStudioErrorKind.Validation,
    );
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new OctopusStudioError(
      `Invalid skill file "${fileName}": unterminated frontmatter.`,
      OctopusStudioErrorKind.Validation,
    );
  }
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    name: meta.name || slugify(fileName.replace(/\.md$/, "")),
    description: meta.description ?? "",
    instructions: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
    updatedAt: new Date(0),
  };
}

function serializeSkillFile(skill: {
  name: string;
  description: string;
  instructions: string;
}): string {
  const name = skill.name.trim();
  // Collapse the description to a single line — frontmatter is line-based.
  const description = skill.description.replace(/\s+/g, " ").trim();
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${skill.instructions.trim()}\n`;
}

export function seedDefaultSkills(): void {
  ensureSkillsDir();
  for (const def of DEFAULT_SKILLS) {
    const slug = slugify(def.name);
    const file = path.join(skillsDir(), `${slug}.md`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, serializeSkillFile(def), "utf8");
    }
  }
}

export function listSkills(): SkillRecord[] {
  migrateFromDbOnce();
  ensureSkillsDir();
  seedDefaultSkills();
  const files = fs.readdirSync(skillsDir()).filter((f) => f.toLowerCase().endsWith(".md"));
  return files
    .map((file) => {
      const full = path.join(skillsDir(), file);
      const content = fs.readFileSync(full, "utf8");
      const skill = parseSkillFile(content, file);
      try {
        skill.updatedAt = fs.statSync(full).mtime;
      } catch {
        // Keep epoch timestamp; stat failure shouldn't block listing.
      }
      return skill;
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** Case-insensitive lookup by skill name. */
export function findSkill(name: string): SkillRecord | null {
  const target = name.trim().toLowerCase();
  return listSkills().find((s) => s.name.toLowerCase() === target) ?? null;
}

export function createSkill(params: {
  name: string;
  description: string;
  instructions: string;
}): SkillRecord {
  ensureSkillsDir();
  const name = params.name.trim();
  const slug = slugify(name);
  if (!slug) {
    throw new OctopusStudioError(
      "Skill name must contain at least one letter or number.",
      OctopusStudioErrorKind.Validation,
    );
  }
  if (findSkill(name)) {
    throw new OctopusStudioError(
      `A skill named "${name}" already exists — use update instead.`,
      OctopusStudioErrorKind.Conflict,
    );
  }
  const file = path.join(skillsDir(), `${slug}.md`);
  fs.writeFileSync(file, serializeSkillFile(params), "utf8");
  return findSkill(name)!;
}

export function updateSkill(
  name: string,
  fields: {
    name?: string;
    description?: string;
    instructions?: string;
  },
): SkillRecord {
  const existing = findSkill(name);
  if (!existing) {
    throw new OctopusStudioError("Skill not found", OctopusStudioErrorKind.NotFound);
  }
  const next = {
    name: (fields.name ?? existing.name).trim(),
    description: fields.description ?? existing.description,
    instructions: fields.instructions ?? existing.instructions,
  };
  const nextSlug = slugify(next.name);
  if (!nextSlug) {
    throw new OctopusStudioError(
      "Skill name must contain at least one letter or number.",
      OctopusStudioErrorKind.Validation,
    );
  }
  const oldFile = path.join(skillsDir(), `${slugify(existing.name)}.md`);
  const newFile = path.join(skillsDir(), `${nextSlug}.md`);
  fs.writeFileSync(newFile, serializeSkillFile(next), "utf8");
  if (oldFile !== newFile) {
    fs.rmSync(oldFile, { force: true });
  }
  return findSkill(next.name)!;
}

export function deleteSkill(name: string): boolean {
  const existing = findSkill(name);
  if (!existing) return false;
  fs.rmSync(path.join(skillsDir(), `${slugify(existing.name)}.md`), {
    force: true,
  });
  return true;
}
