import fs from "node:fs";
import path from "node:path";
import { buildOrUpdateProjectIndex, openCodeIndexDb } from "../utils/code_index";

/**
 * Per-project `.octopus/` context files — a compact, human-curatable map of the
 * project (overview.md, tree.md, rules/*.md) that the agent loads instead of
 * walking the whole repo. Distinct from the internal `.octopusStudio/` media
 * dir; `.octopus/` is the AI-facing context layer.
 */

export const OCTOPUS_CONTEXT_DIR = ".octopus";

/** Hard cap on the context string returned to the prompt (≈1.5k tokens). */
const MAX_CONTEXT_CHARS = 6000;

const SKIPPED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".octopusStudio",
  ".octopus",
]);

interface AppMeta {
  name: string;
  description: string;
}

function readPackageJson(appPath: string): AppMeta {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appPath, "package.json"), "utf8"));
    return {
      name: typeof pkg.name === "string" ? pkg.name : path.basename(appPath),
      description: typeof pkg.description === "string" ? pkg.description : "",
    };
  } catch {
    return { name: path.basename(appPath), description: "" };
  }
}

/** Compact directory tree of important files/folders (skips build artifacts). */
function buildTree(appPath: string): string {
  const lines: string[] = [];
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
        lines.push(`${"  ".repeat(depth)}${entry.name}/`);
        if (depth < 3) walk(path.join(dir, entry.name), depth + 1);
      } else {
        lines.push(`${"  ".repeat(depth)}${entry.name}`);
      }
    }
  };
  walk(appPath, 0);
  return lines.join("\n") || "(empty project)";
}

/** Most symbol-dense files from the code index — the "frequently stressed" files. */
function topFiles(appPath: string): string[] {
  try {
    const db = openCodeIndexDb(appPath);
    const rows = db
      .prepare(
        `SELECT file_path, COUNT(*) AS n FROM chunks
         GROUP BY file_path ORDER BY n DESC, file_path ASC LIMIT 15`,
      )
      .all() as { file_path: string; n: number }[];
    return rows.map((r) => r.file_path);
  } catch {
    return [];
  }
}

/**
 * (Re)generate the `.octopus/` context files for a project. Best-effort: the
 * code index build is wrapped so a slow/failed index doesn't block the turn.
 */
export function buildOctopusContext(appPath: string): void {
  const dir = path.join(appPath, OCTOPUS_CONTEXT_DIR);
  const rulesDir = path.join(dir, "rules");
  fs.mkdirSync(rulesDir, { recursive: true });

  try {
    buildOrUpdateProjectIndex(openCodeIndexDb(appPath), appPath);
  } catch {
    // Overview/tree fall back to package.json + the directory walk.
  }

  const meta = readPackageJson(appPath);
  const top = topFiles(appPath);

  const overview = [
    `# ${meta.name}`,
    "",
    meta.description || "No description.",
    "",
    "## Key files",
    ...(top.length ? top.map((f) => `- \`${f}\``) : ["- (no indexed symbols yet)"]),
    "",
  ].join("\n");

  const tree = `# Project tree\n\n\`\`\`\n${buildTree(appPath)}\n\`\`\`\n`;

  fs.writeFileSync(path.join(dir, "overview.md"), overview, "utf8");
  fs.writeFileSync(path.join(dir, "tree.md"), tree, "utf8");

  const alwaysRules = path.join(rulesDir, "always.md");
  if (!fs.existsSync(alwaysRules)) {
    fs.writeFileSync(
      alwaysRules,
      "# Project rules\n\n<!-- Add project-specific rules the agent should always follow. -->\n",
      "utf8",
    );
  }
}

/** Read `.octopus/` files and return a compact context string (may be empty). */
export function loadOctopusContext(appPath: string): string {
  const dir = path.join(appPath, OCTOPUS_CONTEXT_DIR);
  const parts: string[] = [];

  for (const name of ["overview.md", "tree.md"]) {
    try {
      const content = fs.readFileSync(path.join(dir, name), "utf8").trim();
      if (content) parts.push(content);
    } catch {
      // Missing file — skip.
    }
  }

  const rulesDir = path.join(dir, "rules");
  try {
    for (const file of fs.readdirSync(rulesDir)) {
      if (!file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(rulesDir, file), "utf8").trim();
      if (content) parts.push(content);
    }
  } catch {
    // No rules dir yet.
  }

  let combined = parts.join("\n\n").trim();
  if (combined.length > MAX_CONTEXT_CHARS) {
    combined = combined.slice(0, MAX_CONTEXT_CHARS) + "\n…[truncated]";
  }
  return combined;
}

/** Build the context on first use, then load it. */
export function ensureOctopusContext(appPath: string): string {
  if (!fs.existsSync(path.join(appPath, OCTOPUS_CONTEXT_DIR, "overview.md"))) {
    try {
      buildOctopusContext(appPath);
    } catch {
      // Fall through to load whatever exists (likely empty).
    }
  }
  return loadOctopusContext(appPath);
}
