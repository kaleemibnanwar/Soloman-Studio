import fs from "node:fs";
import path from "node:path";
import { jsonSchema, type Tool, type ToolSet } from "ai";
import type { IpcMainInvokeEvent } from "electron";
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { chats, tasks, skills } from "../../db/schema";
import { AGENT_TOOL_REGISTRY } from "./agent_tool_registry";
import { readTextFileLines, AGENT_READ_FILE_TRUNCATION_NOTICE } from "./bounded_text_file";
import { searchAppFilesWithRipgrep } from "../handlers/app_handlers";
import { runCodeExplorer } from "../processors/code_explorer";
import { applySearchReplace } from "../processors/response_processor";
import { installPackages } from "../processors/executeAddDependency";
import { runTypeScriptCheck } from "../processors/tsc";
import { restartApp } from "../services/restart_app";
import { runSandboxScript } from "./sandbox/runner";
import { executeCopyFile } from "./copy_file_utils";
import { safeJoin, assertMutationPathAllowed, prepareDeletePath } from "./path_utils";
import {
  getAgentGitStatus,
  getAgentGitDiff,
  getAgentGitLog,
  getAgentGitCommit,
  getAgentGitFile,
  restoreAgentGitFile,
} from "./git_utils";
import {
  openCodeIndexDb,
  buildOrUpdateProjectIndex,
  buildOrUpdateFileChunks,
  removeFileChunks,
  searchChunks,
} from "./code_index";
import { agentEvents } from "../types/agent";
import { publishQueryInvalidations } from "./query_invalidation_delivery";
import {
  generateDocx,
  generatePptx,
  generateXlsx,
  parseDocx,
  parsePptx,
  parseXlsx,
} from "./office_open";
import { DOC_TEMPLATES } from "./office_templates";
import { DOC_TEMPLATES_EXTRA } from "./office_docx_templates_extra";
import { PPT_TEMPLATES } from "./office_pptx_templates";
import { PPT_TEMPLATES_EXTRA } from "./office_pptx_templates_extra";
import { XLSX_TEMPLATES } from "./office_xlsx_templates";
import {
  resolveColorScheme,
  recolor,
  listColorSchemeNames,
  type ColorRole,
} from "./office_theme";
import {
  DOC_TEMPLATE_ROLES,
  PPT_TEMPLATE_ROLES,
  XLSX_TEMPLATE_ROLES,
} from "./office_template_roles";

const ALL_DOC_TEMPLATES = { ...DOC_TEMPLATES, ...DOC_TEMPLATES_EXTRA };
const ALL_PPT_TEMPLATES = { ...PPT_TEMPLATES, ...PPT_TEMPLATES_EXTRA };
const ALL_XLSX_TEMPLATES = { ...XLSX_TEMPLATES };

/**
 * The real, callable built-in tools for `ask`/`plan`/`local-agent` chat modes.
 *
 * These are what the model was *supposed* to have (the prompt in
 * `local_agent_prompt.ts` describes ~32 of them) but `chat_stream_handlers.ts`
 * only ever attached MCP tools — which is why the model kept reaching for
 * OctoLimb's browser-automation tools even for non-browser tasks.
 *
 * Every tool reuses an existing, tested utility; none introduce new
 * file-editing/git/build primitives. Tools without a real local backing return
 * an honest error instead of silently no-op'ing.
 */

const STUB_MESSAGE = "not available in this build";

// Registry lookups for consent defaults (default approval lives in the same
// table that powers the Settings tool-visibility UI).
const registryByName = new Map(AGENT_TOOL_REGISTRY.map((t) => [t.name, t]));

type JsonSchemaProperties = Record<
  string,
  { type: string; description?: string; items?: Record<string, unknown>; default?: unknown }
>;

function schema(properties: JsonSchemaProperties, required: string[] = []) {
  return jsonSchema({ type: "object", properties, required } as never);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

/** Recursively collect readable text from parsed office-open options. */
function collectOfficeText(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectOfficeText(v, out);
    return out;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") out.push(o.text);
    if (typeof o.value === "string") out.push(o.value);
    for (const key of [
      "children",
      "paragraph",
      "heading",
      "textBox",
      "rows",
      "cells",
      "sections",
      "slides",
      "worksheets",
    ]) {
      if (key in o) collectOfficeText(o[key], out);
    }
  }
  return out;
}

/** Collect the unique `[...]` placeholder tokens found anywhere in a template. */
function collectPlaceholders(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    const matches = value.match(/\[[^\]]+\]/g);
    if (matches) {
      for (const m of matches) if (!out.includes(m)) out.push(m);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectPlaceholders(v, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectPlaceholders(v, out);
    }
  }
  return out;
}

/**
 * Deep-clone `value` and replace every occurrence of each placeholder key
 * (e.g. `"[Client / Company Name]"`) with its mapped text. Keys are the literal
 * placeholder strings returned by `collectPlaceholders`.
 */
function applyPlaceholders(
  value: unknown,
  values: Record<string, string>,
): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    let s = value;
    for (const [k, v] of Object.entries(values)) {
      if (k) s = s.split(k).join(v);
    }
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => applyPlaceholders(v, values));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = applyPlaceholders(v, values);
    }
    return result;
  }
  return value;
}

/** Format a template's name/title and placeholder list for the model. */
function formatTemplateInfo(
  name: string,
  title: string,
  placeholders: string[],
): string {
  const lines = [`Template: ${name} (${title})`, ""];
  if (placeholders.length === 0) {
    lines.push("No placeholders.");
  } else {
    lines.push("Placeholders (fill via the `values` map when creating):");
    for (const p of placeholders) lines.push(`- ${p}`);
  }
  lines.push(
    "",
    `Color schemes (pass as "colorScheme"): ${listColorSchemeNames().join(", ")}.`,
  );
  return lines.join("\n");
}

/** A single row of batch data: what to fill in, and optionally its own output filename. */
interface BatchRecord {
  filename?: string;
  values: Record<string, string>;
}

/** Minimal RFC4180 CSV parser: quoted fields, embedded commas/newlines, "" escaping. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // skip, \n (or end) terminates the row
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Build [key] and bracketed-[key] entries so CSV/JSON headers work with or without brackets. */
function toPlaceholderValues(fields: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    values[k] = v;
    const bracketed = k.startsWith("[") && k.endsWith("]") ? k : `[${k}]`;
    values[bracketed] = v;
  }
  return values;
}

function parseJsonRecords(
  text: string,
  filenameField?: string,
): BatchRecord[] | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (!Array.isArray(data)) return "Data file must be a JSON array of records.";
  return data.map((entry) => {
    if (entry && typeof entry === "object") {
      const o = entry as Record<string, unknown>;
      const rawValues =
        o.values && typeof o.values === "object"
          ? (o.values as Record<string, unknown>)
          : Object.fromEntries(Object.entries(o).filter(([k]) => k !== "filename"));
      const stringValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawValues)) stringValues[k] = String(v);
      let filename: string | undefined;
      if (typeof o.filename === "string") {
        filename = o.filename;
      } else if (filenameField) {
        const fieldValue = rawValues[filenameField];
        if (typeof fieldValue === "string" || typeof fieldValue === "number") {
          filename = String(fieldValue);
        }
      }
      return { filename, values: toPlaceholderValues(stringValues) };
    }
    return { values: {} };
  });
}

function parseCsvRecords(text: string, filenameField?: string): BatchRecord[] | string {
  const rows = parseCsv(text);
  if (rows.length < 1) return "CSV data file is empty.";
  const [header, ...dataRows] = rows;
  return dataRows.map((row) => {
    const fields: Record<string, string> = {};
    header.forEach((h, i) => {
      fields[h] = row[i] ?? "";
    });
    const filename = filenameField ? fields[filenameField] : undefined;
    return { filename, values: toPlaceholderValues(fields) };
  });
}

// Illegal filename characters, listed via char codes rather than a regex
// character class (some codes here are adjacent to control-char ranges and
// a couple of editing tools in this environment have mis-rewritten that
// class into a literal null-byte range in the past).
const ILLEGAL_FILENAME_CHARS = [60, 62, 58, 34, 124, 63, 42].map((c) => String.fromCharCode(c));

/** Strip path separators/traversal and illegal filename characters; force the correct extension. */
function sanitizeBatchFilename(name: string | undefined, fallback: string, ext: string): string {
  const base = (name && name.trim()) || fallback;
  let cleaned = base.replace(/[\\/]/g, "-").replace(/^\.+/, "");
  for (const ch of ILLEGAL_FILENAME_CHARS) cleaned = cleaned.split(ch).join("");
  cleaned = cleaned.replace(/\s+/g, " ").trim() || fallback;
  return cleaned.toLowerCase().endsWith(`.${ext}`) ? cleaned : `${cleaned}.${ext}`;
}

const MAX_BATCH_RECORDS = 20000;
/** Yield to the event loop every this many documents so a large batch doesn't freeze the app. */
const BATCH_YIELD_EVERY = 200;

/** A structured question asked via `planning_questionnaire` (doc §8/§22). */
export interface QuestionnaireQuestion {
  id: string;
  type: "text" | "radio" | "checkbox";
  question: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/** A bounded, isolated subtask delegated to a sub-agent (doc §22 task.create). */
export interface SubAgentSpec {
  role?: "explorer" | "coder" | "tester" | "debugger" | "reviewer";
  description: string;
  allowedFiles?: string[] | null;
  context?: string;
}

export interface BuiltinToolsParams {
  appPath: string;
  appId: number;
  chatId: number;
  chatMode: string;
  agentToolConsents: Record<string, string> | undefined;
  event: IpcMainInvokeEvent;
  /**
   * Per-agent permission boundary (§9). Undefined = unrestricted, which is the
   * current single-agent path. The orchestrator supplies this so a worker's tool
   * calls are checked against its allowed_files/allowed_symbols.
   */
  agentTaskContext?: {
    taskId: string;
    allowedFiles?: string[] | null;
    allowedSymbols?: string[] | null;
  };
  /** Ask the user a set of structured questions and await their answers. */
  requestQuestionnaire?: (
    questions: QuestionnaireQuestion[],
    abortSignal?: AbortSignal,
  ) => Promise<Record<string, string> | null>;
  /** Run a bounded sub-agent and return its result text. */
  spawnSubAgent?: (spec: SubAgentSpec) => Promise<string>;
}

function blockReason(name: string, params: BuiltinToolsParams): string | null {
  const registry = registryByName.get(name);
  if (params.chatMode === "ask" && !(registry?.isAllowedByDefault ?? true)) {
    return `${name} is not available in read-only Ask mode.`;
  }
  if (params.agentToolConsents?.[name] === "never") {
    return `${name} is disabled by the user's consent settings.`;
  }
  return null;
}

/**
 * Returns a block message when `relPath` falls outside the task's allowed_files
 * (§9). Semantics: no task context, or an explicit `null`/`undefined`
 * allowedFiles, means unrestricted (the current single-agent path). A non-null
 * array is enforced — including the empty array, which denies all access
 * (fail-closed). `allowedFiles` entries may be exact paths or directory prefixes.
 */
function fileAccessBlock(params: BuiltinToolsParams, relPath: string): string | null {
  const ctx = params.agentTaskContext;
  if (!ctx) return null;
  const allowedFiles = ctx.allowedFiles;
  if (allowedFiles == null) return null;
  const normalized = relPath.replaceAll("\\", "/");
  const allowed = allowedFiles.some((entry) => {
    const prefix = entry.replaceAll("\\", "/").replace(/\/+$/, "");
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
  if (allowed) return null;
  return `Task ${ctx.taskId} is not permitted to access ${relPath} (outside its allowed_files).`;
}

function ensureIndexed(appPath: string): void {
  const indexDb = openCodeIndexDb(appPath);
  const row = indexDb.prepare(`SELECT COUNT(*) AS n FROM chunks`).get() as { n: number };
  if (row.n === 0) {
    buildOrUpdateProjectIndex(indexDb, appPath);
  }
}

export function buildBuiltinTools(params: BuiltinToolsParams): ToolSet {
  const tools: Record<string, Tool> = {};

  // --- Reading -------------------------------------------------------------

  tools.list_files = {
    description:
      "List files and directories in the current app's project. Prefer this before reading files so you only read what you actually need. Returns a compact directory tree (excludes node_modules and build output).",
    inputSchema: schema({
      path: {
        type: "string",
        description: "Directory path relative to the project root. Omit for the root.",
      },
    }),
    execute: async ({ path: rel = "" }: { path?: string }) => {
      const blocked = blockReason("list_files", params);
      if (blocked) return blocked;
      try {
        const base = rel ? safeJoin(params.appPath, rel) : params.appPath;
        if (!fs.existsSync(base)) return `No such directory: ${rel || "."}`;
        return listTree(params.appPath, base, rel || ".");
      } catch (e) {
        return `Error listing files: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.read_file = {
    description:
      "Read a file's contents from the current app's project, optionally restricted to a line range (start_line_one_indexed / end_line_one_indexed_inclusive) so you only fetch the lines you need. Large files are truncated at 256 KiB.",
    inputSchema: schema({
      file_path: { type: "string", description: "File path relative to the project root." },
      start_line_one_indexed: { type: "number", description: "First line to read (1-indexed)." },
      end_line_one_indexed_inclusive: {
        type: "number",
        description: "Last line to read (inclusive).",
      },
    }),
    execute: async ({
      file_path,
      start_line_one_indexed,
      end_line_one_indexed_inclusive,
    }: {
      file_path: string;
      start_line_one_indexed?: number;
      end_line_one_indexed_inclusive?: number;
    }) => {
      const blocked = blockReason("read_file", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, file_path);
      if (fileBlocked) return fileBlocked;
      try {
        const result = await readTextFileLines({
          rootPath: params.appPath,
          filePath: path.join(params.appPath, file_path),
          displayPath: file_path,
          startLine: start_line_one_indexed ?? 1,
          endLineInclusive: end_line_one_indexed_inclusive,
        });
        return result.truncated
          ? result.content + AGENT_READ_FILE_TRUNCATION_NOTICE
          : result.content;
      } catch (e) {
        return `Error reading ${file_path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.grep = {
    description:
      "Search file contents across the project for an exact text pattern (case-insensitive). Returns matching file paths and snippets. Prefer this over read_file to locate code you haven't seen yet.",
    inputSchema: schema({
      query: { type: "string", description: "The exact text to search for." },
    }),
    execute: async ({ query }: { query: string }) => {
      const blocked = blockReason("grep", params);
      if (blocked) return blocked;
      try {
        const results = await searchAppFilesWithRipgrep({ appPath: params.appPath, query });
        if (results.length === 0) return `No matches for "${query}".`;
        return stringify(results);
      } catch (e) {
        return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.code_search = {
    description:
      "Search the project's code index for a symbol, function, or concept by name. Returns each match's file, kind, line range, signature, and the symbols it calls. Use this before read_file to jump straight to the relevant code.",
    inputSchema: schema({
      query: { type: "string", description: "Symbol or concept name to search for." },
    }),
    execute: async ({ query }: { query: string }) => {
      const blocked = blockReason("code_search", params);
      if (blocked) return blocked;
      try {
        ensureIndexed(params.appPath);
        const rows = searchChunks(openCodeIndexDb(params.appPath), query);
        if (rows.length === 0) return `No symbols matched "${query}".`;
        return stringify(
          rows.map((r) => ({
            file: r.file_path,
            symbol: r.symbol_name,
            kind: r.kind,
            lines: `${r.start_line}-${r.end_line}`,
            signature: r.signature,
            dependencies: r.dependencies ? JSON.parse(r.dependencies) : [],
          })),
        );
      } catch (e) {
        return `Error searching code index: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.explore_code = {
    description:
      "Investigate the codebase for a stated intent (explain, locate, edit, or debug) and report the relevant files and symbols with source windows. Use when the relevant files aren't clear yet.",
    inputSchema: schema({
      intent: { type: "string", description: "One of: explain, locate, edit, debug." },
    }),
    execute: async ({ intent }: { intent: string }) => {
      const blocked = blockReason("explore_code", params);
      if (blocked) return blocked;
      try {
        const result = await runCodeExplorer({ appPath: params.appPath, query: intent });
        return stringify(result);
      } catch (e) {
        return `Error exploring code: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Editing -------------------------------------------------------------

  tools.write_file = {
    description:
      "Overwrite a file's entire contents, or create a new file. Use for large rewrites or new files; prefer search_replace for small, targeted edits.",
    inputSchema: schema(
      {
        file_path: { type: "string", description: "File path relative to the project root." },
        content: { type: "string", description: "The full new contents of the file." },
      },
      ["file_path", "content"],
    ),
    execute: async ({ file_path, content }: { file_path: string; content: string }) => {
      const blocked = blockReason("write_file", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, file_path);
      if (fileBlocked) return fileBlocked;
      try {
        const rel = await assertMutationPathAllowed({
          appPath: params.appPath,
          relativePath: file_path,
        });
        const full = safeJoin(params.appPath, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
        buildOrUpdateFileChunks(openCodeIndexDb(params.appPath), params.appPath, rel);
        return `Wrote ${rel} (${Buffer.byteLength(content, "utf8")} bytes).`;
      } catch (e) {
        return `Error writing ${file_path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.search_replace = {
    description:
      "Make a targeted edit by replacing exact text in a file. Line-based: include entire original lines in `search` and entire edited lines in `replace`. Fails loudly if the search text isn't found exactly once.",
    inputSchema: schema(
      {
        file_path: { type: "string", description: "File path relative to the project root." },
        search: {
          type: "string",
          description: "The exact text to replace (must match exactly once).",
        },
        replace: { type: "string", description: "The replacement text." },
      },
      ["file_path", "search", "replace"],
    ),
    execute: async ({
      file_path,
      search,
      replace,
    }: {
      file_path: string;
      search: string;
      replace: string;
    }) => {
      const blocked = blockReason("search_replace", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, file_path);
      if (fileBlocked) return fileBlocked;
      try {
        const rel = await assertMutationPathAllowed({
          appPath: params.appPath,
          relativePath: file_path,
        });
        const full = safeJoin(params.appPath, rel);
        const original = fs.readFileSync(full, "utf8");
        const diff = `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
        const result = applySearchReplace(original, diff);
        if (!result.success) return `search_replace failed: ${result.error}`;
        fs.writeFileSync(full, result.content, "utf8");
        buildOrUpdateFileChunks(openCodeIndexDb(params.appPath), params.appPath, rel);
        return `Applied edit to ${rel}.`;
      } catch (e) {
        return `Error editing ${file_path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.delete_file = {
    description: "Delete a file or directory from the project.",
    inputSchema: schema(
      { file_path: { type: "string", description: "Path relative to the project root." } },
      ["file_path"],
    ),
    execute: async ({ file_path }: { file_path: string }) => {
      const blocked = blockReason("delete_file", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, file_path);
      if (fileBlocked) return fileBlocked;
      try {
        const { relativePath, fullPath } = await prepareDeletePath(params.appPath, file_path);
        fs.rmSync(fullPath, { recursive: true, force: true });
        removeFileChunks(openCodeIndexDb(params.appPath), relativePath);
        return `Deleted ${relativePath}.`;
      } catch (e) {
        return `Error deleting ${file_path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.rename_file = {
    description: "Rename or move a file within the project.",
    inputSchema: schema(
      {
        from: { type: "string", description: "Current path relative to the project root." },
        to: { type: "string", description: "New path relative to the project root." },
      },
      ["from", "to"],
    ),
    execute: async ({ from, to }: { from: string; to: string }) => {
      const blocked = blockReason("rename_file", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, from) ?? fileAccessBlock(params, to);
      if (fileBlocked) return fileBlocked;
      try {
        const fromRel = await assertMutationPathAllowed({
          appPath: params.appPath,
          relativePath: from,
        });
        const toRel = await assertMutationPathAllowed({
          appPath: params.appPath,
          relativePath: to,
        });
        const fromFull = safeJoin(params.appPath, fromRel);
        const toFull = safeJoin(params.appPath, toRel);
        fs.mkdirSync(path.dirname(toFull), { recursive: true });
        fs.renameSync(fromFull, toFull);
        const indexDb = openCodeIndexDb(params.appPath);
        removeFileChunks(indexDb, fromRel);
        buildOrUpdateFileChunks(indexDb, params.appPath, toRel);
        return `Renamed ${fromRel} to ${toRel}.`;
      } catch (e) {
        return `Error renaming ${from}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.copy_file = {
    description: "Copy a file to a new path within the project.",
    inputSchema: schema(
      {
        from: { type: "string", description: "Source path relative to the project root." },
        to: { type: "string", description: "Destination path relative to the project root." },
      },
      ["from", "to"],
    ),
    execute: async ({ from, to }: { from: string; to: string }) => {
      const blocked = blockReason("copy_file", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, from) ?? fileAccessBlock(params, to);
      if (fileBlocked) return fileBlocked;
      try {
        await executeCopyFile({ from, to, appId: params.appId });
        const toRel = await assertMutationPathAllowed({
          appPath: params.appPath,
          relativePath: to,
        });
        buildOrUpdateFileChunks(openCodeIndexDb(params.appPath), params.appPath, toRel);
        return `Copied ${from} to ${to}.`;
      } catch (e) {
        return `Error copying ${from}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.add_dependency = {
    description: "Add one or more npm packages to the project's dependencies.",
    inputSchema: schema(
      {
        packages: {
          type: "array",
          items: { type: "string" },
          description: "Package names (or name@version).",
        },
        dev: { type: "boolean", description: "Install as devDependencies." },
      },
      ["packages"],
    ),
    execute: async ({ packages, dev }: { packages: string[]; dev?: boolean }) => {
      const blocked = blockReason("add_dependency", params);
      if (blocked) return blocked;
      try {
        const result = await installPackages({ packages, appPath: params.appPath, dev });
        return [result.installResults, ...result.warningMessages].filter(Boolean).join("\n");
      } catch (e) {
        return `Error adding dependency: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Build / run ---------------------------------------------------------

  tools.run_type_checks = {
    description: "Run TypeScript type checking on the project and report errors.",
    inputSchema: schema({}),
    execute: async () => {
      const blocked = blockReason("run_type_checks", params);
      if (blocked) return blocked;
      try {
        return stringify(await runTypeScriptCheck({ appPath: params.appPath }));
      } catch (e) {
        return `Error running type checks: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.restart_app = {
    description:
      "Restart the running app preview. Only use when a restart is actually required (server config, env vars, or logs say so).",
    inputSchema: schema({}),
    execute: async () => {
      const blocked = blockReason("restart_app", params);
      if (blocked) return blocked;
      try {
        await restartApp(params.event, { appId: params.appId });
        return "Restarted the app.";
      } catch (e) {
        return `Error restarting: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.rebuild_app = {
    description:
      "Rebuild the app from a clean install (removes node_modules and recreates the sandbox). Only use for genuinely broken dependency state.",
    inputSchema: schema({}),
    execute: async () => {
      const blocked = blockReason("rebuild_app", params);
      if (blocked) return blocked;
      try {
        await restartApp(params.event, {
          appId: params.appId,
          removeNodeModules: true,
          recreateSandbox: true,
        });
        return "Rebuilding the app from a clean install.";
      } catch (e) {
        return `Error rebuilding: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.execute_sandbox_script = {
    description:
      "Run a short JavaScript snippet in an isolated JS sandbox and return its console output. JavaScript only — there is no shell, Python, or filesystem access. For non-JS projects, inspect files with read_file/grep/git_* instead of trying to run their runtime here.",
    inputSchema: schema({ script: { type: "string", description: "The script source to run." } }, [
      "script",
    ]),
    execute: async ({ script }: { script: string }) => {
      const blocked = blockReason("execute_sandbox_script", params);
      if (blocked) return blocked;
      try {
        const result = await runSandboxScript({ appPath: params.appPath, script });
        return result.truncated ? result.value : result.value;
      } catch (e) {
        return `Error running sandbox script: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Git -----------------------------------------------------------------

  tools.git_status = {
    description: "Show the git working tree status (changed/added/deleted files).",
    inputSchema: schema({}),
    execute: async () => {
      const blocked = blockReason("git_status", params);
      if (blocked) return blocked;
      try {
        return stringify(await getAgentGitStatus({ path: params.appPath }));
      } catch (e) {
        return `Error reading git status: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.git_diff = {
    description: "Show the git diff of uncommitted changes (optionally for one file).",
    inputSchema: schema({
      file_path: { type: "string", description: "Restrict the diff to a single file." },
      context_lines: { type: "number", description: "Context lines around changes." },
    }),
    execute: async ({
      file_path,
      context_lines,
    }: {
      file_path?: string;
      context_lines?: number;
    }) => {
      const blocked = blockReason("git_diff", params);
      if (blocked) return blocked;
      try {
        return stringify(
          await getAgentGitDiff({
            path: params.appPath,
            filePath: file_path,
            contextLines: context_lines,
          }),
        );
      } catch (e) {
        return `Error reading git diff: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.git_log = {
    description: "Show recent git commit history.",
    inputSchema: schema({
      revision: { type: "string", description: "Optional revision to start from." },
      max_count: { type: "number", description: "Maximum number of commits." },
      file_path: { type: "string", description: "Restrict to commits touching this file." },
    }),
    execute: async ({
      revision,
      max_count,
      file_path,
    }: {
      revision?: string;
      max_count?: number;
      file_path?: string;
    }) => {
      const blocked = blockReason("git_log", params);
      if (blocked) return blocked;
      try {
        return stringify(
          await getAgentGitLog({
            path: params.appPath,
            revision,
            maxCount: max_count,
            filePath: file_path,
          }),
        );
      } catch (e) {
        return `Error reading git log: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.git_show_commit = {
    description: "Show the details and file changes of a specific git commit.",
    inputSchema: schema({ revision: { type: "string", description: "The commit hash to show." } }, [
      "revision",
    ]),
    execute: async ({ revision }: { revision: string }) => {
      const blocked = blockReason("git_show_commit", params);
      if (blocked) return blocked;
      try {
        return stringify(await getAgentGitCommit({ path: params.appPath, revision }));
      } catch (e) {
        return `Error showing commit: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.git_show_file = {
    description: "Show a file's contents as of a specific git revision.",
    inputSchema: schema(
      {
        revision: { type: "string", description: "The commit hash." },
        file_path: { type: "string", description: "The file path." },
        start_line_one_indexed: { type: "number" },
        end_line_one_indexed_inclusive: { type: "number" },
      },
      ["revision", "file_path"],
    ),
    execute: async ({
      revision,
      file_path,
      start_line_one_indexed,
      end_line_one_indexed_inclusive,
    }: {
      revision: string;
      file_path: string;
      start_line_one_indexed?: number;
      end_line_one_indexed_inclusive?: number;
    }) => {
      const blocked = blockReason("git_show_file", params);
      if (blocked) return blocked;
      try {
        return stringify(
          await getAgentGitFile({
            path: params.appPath,
            revision,
            filePath: file_path,
            startLine: start_line_one_indexed ?? 1,
            endLineInclusive: end_line_one_indexed_inclusive,
          }),
        );
      } catch (e) {
        return `Error showing file: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.git_restore_file = {
    description: "Restore a file to its contents at a specific git revision.",
    inputSchema: schema(
      {
        revision: { type: "string", description: "The commit hash to restore from." },
        file_path: { type: "string", description: "The file path to restore." },
      },
      ["revision", "file_path"],
    ),
    execute: async ({ revision, file_path }: { revision: string; file_path: string }) => {
      const blocked = blockReason("git_restore_file", params);
      if (blocked) return blocked;
      try {
        const result = await restoreAgentGitFile({
          path: params.appPath,
          revision,
          filePath: file_path,
        });
        const rel = result.path;
        buildOrUpdateFileChunks(openCodeIndexDb(params.appPath), params.appPath, rel);
        return `Restored ${rel} to ${revision}.`;
      } catch (e) {
        return `Error restoring file: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Chat / planning -----------------------------------------------------

  tools.set_chat_summary = {
    description: "Set this chat's title/summary. Call once, early in the turn.",
    inputSchema: schema(
      { summary: { type: "string", description: "A short title for the chat." } },
      ["summary"],
    ),
    execute: async ({ summary }: { summary: string }) => {
      const blocked = blockReason("set_chat_summary", params);
      if (blocked) return blocked;
      try {
        await db.update(chats).set({ title: summary }).where(eq(chats.id, params.chatId));
        return "Set chat summary.";
      } catch (e) {
        return `Error setting chat summary: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.update_todos = {
    description: "Update the agent's task checklist for this chat.",
    inputSchema: schema(
      {
        todos: {
          type: "array",
          items: { type: "object" },
          description: "Array of { id, content, status: 'pending'|'in_progress'|'completed' }.",
        },
      },
      ["todos"],
    ),
    execute: async ({
      todos,
    }: {
      todos: Array<{ id: string; content: string; status: string }>;
    }) => {
      const blocked = blockReason("update_todos", params);
      if (blocked) return blocked;
      try {
        params.event.sender.send(agentEvents.todosUpdate.channel, { chatId: params.chatId, todos });
        return "Updated todos.";
      } catch (e) {
        return `Error updating todos: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.create_scheduled_task = {
    description:
      "Create a recurring (scheduled) task that will run the agent against a prompt on an interval, or as a one-off manual task. Provide a short title, the prompt/instructions the agent should carry out, and an optional repeat interval in minutes (60 = hourly, 1440 = daily, 10080 = weekly, 43200 = monthly). Omit scheduleMinutes to create a manual/on-demand task.",
    inputSchema: schema(
      {
        title: { type: "string", description: "A short, descriptive task title." },
        prompt: { type: "string", description: "What the agent should do each time the task runs." },
        scheduleMinutes: {
          type: "number",
          description: "Repeat interval in minutes. Omit for a manual/on-demand task.",
        },
      },
      ["title", "prompt"],
    ),
    execute: async ({
      title,
      prompt,
      scheduleMinutes,
    }: {
      title: string;
      prompt: string;
      scheduleMinutes?: number;
    }) => {
      const blocked = blockReason("create_scheduled_task", params);
      if (blocked) return blocked;
      try {
        const [created] = await db
          .insert(tasks)
          .values({
            title,
            prompt,
            scheduleMinutes: scheduleMinutes ?? null,
            // Run in the project this chat belongs to (null = default project).
            projectId: params.appId,
          })
          .returning();
        // This tool bypasses the task IPC contracts, so publish the same
        // invalidation the contracts would, to refresh sidebar task lists.
        publishQueryInvalidations([{ family: "tasks" }], params.event.sender);
        return `Created task #${created.id} "${created.title}"${
          created.scheduleMinutes != null
            ? ` (repeats every ${created.scheduleMinutes} minutes)`
            : " (manual/on-demand)"
        }.`;
      } catch (e) {
        return `Error creating task: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Skills ----------------------------------------------------------------

  tools.list_skills = {
    description:
      "List every saved skill by name with its short description of when to use it. Call this to check whether a saved skill matches the current task before starting from scratch.",
    inputSchema: schema({}, []),
    execute: async () => {
      const blocked = blockReason("list_skills", params);
      if (blocked) return blocked;
      try {
        const all = await db.query.skills.findMany();
        if (all.length === 0) {
          return "No skills saved yet. Use create_skill to save a reusable workflow.";
        }
        return all.map((s) => `- ${s.name}: ${s.description}`).join("\n");
      } catch (e) {
        return `Error listing skills: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.read_skill = {
    description:
      "Load one saved skill's full instructions by name. Call this right before you need to follow it — only load a skill for the step that actually needs it, not preemptively for the whole conversation.",
    inputSchema: schema(
      { name: { type: "string", description: "The skill's name." } },
      ["name"],
    ),
    execute: async ({ name }: { name: string }) => {
      const blocked = blockReason("read_skill", params);
      if (blocked) return blocked;
      try {
        const all = await db.query.skills.findMany();
        const skill = all.find(
          (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (!skill) {
          return `No skill named "${name}" — call list_skills to see what's available.`;
        }
        return skill.instructions;
      } catch (e) {
        return `Error reading skill: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.create_skill = {
    description:
      "Save a new reusable skill (a name, a short description of when to use it, and the full instructions) so future tasks can reuse it. Use this when the user asks you to remember a workflow as a skill, or after working out a non-obvious multi-step approach worth reusing.",
    inputSchema: schema(
      {
        name: { type: "string", description: "A short, kebab-case skill name." },
        description: {
          type: "string",
          description: "A short description of when to use this skill.",
        },
        instructions: {
          type: "string",
          description: "The full instructions the agent should follow.",
        },
      },
      ["name", "description", "instructions"],
    ),
    execute: async ({
      name,
      description,
      instructions,
    }: {
      name: string;
      description: string;
      instructions: string;
    }) => {
      const blocked = blockReason("create_skill", params);
      if (blocked) return blocked;
      try {
        const existing = await db.query.skills.findMany();
        if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          return `A skill named "${name}" already exists — use update_skill instead.`;
        }
        const [created] = await db
          .insert(skills)
          .values({ name, description, instructions })
          .returning();
        publishQueryInvalidations([{ family: "skills" }], params.event.sender);
        return `Created skill #${created.id} "${created.name}".`;
      } catch (e) {
        return `Error creating skill: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.update_skill = {
    description:
      "Update an existing saved skill's name, description, or instructions.",
    inputSchema: schema(
      {
        name: { type: "string", description: "The current name of the skill to update." },
        newName: { type: "string", description: "A new name for the skill, if renaming." },
        description: { type: "string", description: "A new description, if changing." },
        instructions: { type: "string", description: "New instructions, if changing." },
      },
      ["name"],
    ),
    execute: async ({
      name,
      newName,
      description,
      instructions,
    }: {
      name: string;
      newName?: string;
      description?: string;
      instructions?: string;
    }) => {
      const blocked = blockReason("update_skill", params);
      if (blocked) return blocked;
      try {
        const all = await db.query.skills.findMany();
        const skill = all.find(
          (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (!skill) {
          return `No skill named "${name}" — call list_skills to see what's available.`;
        }
        const updates: Partial<typeof skills.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (newName !== undefined) updates.name = newName;
        if (description !== undefined) updates.description = description;
        if (instructions !== undefined) updates.instructions = instructions;
        const [updated] = await db
          .update(skills)
          .set(updates)
          .where(eq(skills.id, skill.id))
          .returning();
        publishQueryInvalidations([{ family: "skills" }], params.event.sender);
        return `Updated skill "${updated.name}".`;
      } catch (e) {
        return `Error updating skill: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.delete_skill = {
    description: "Permanently delete a saved skill.",
    inputSchema: schema(
      { name: { type: "string", description: "The name of the skill to delete." } },
      ["name"],
    ),
    execute: async ({ name }: { name: string }) => {
      const blocked = blockReason("delete_skill", params);
      if (blocked) return blocked;
      try {
        const all = await db.query.skills.findMany();
        const skill = all.find(
          (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (!skill) {
          return `No skill named "${name}" — call list_skills to see what's available.`;
        }
        await db.delete(skills).where(eq(skills.id, skill.id));
        publishQueryInvalidations([{ family: "skills" }], params.event.sender);
        return `Deleted skill "${skill.name}".`;
      } catch (e) {
        return `Error deleting skill: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Web -----------------------------------------------------------------

  tools.web_fetch = {
    description: "Fetch the contents of a URL and return its text.",
    inputSchema: schema({ url: { type: "string", description: "The URL to fetch." } }, ["url"]),
    execute: async ({ url }: { url: string }) => {
      const blocked = blockReason("web_fetch", params);
      if (blocked) return blocked;
      try {
        const res = await fetch(url);
        const text = await res.text();
        const bounded = text.slice(0, 64 * 1024);
        return bounded.length < text.length ? `${bounded}\n[truncated]` : bounded;
      } catch (e) {
        return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Office documents (docx / pptx / xlsx) ------------------------------

  const writeOfficeArtifact = async (
    filename: string,
    buffer: Uint8Array,
    expectedExt: ".docx" | ".xlsx" | ".pptx",
  ): Promise<string> => {
    // The model sometimes names the file after its content (e.g. a "budget.csv")
    // rather than the binary format this tool actually produces. Writing that
    // format under a mismatched extension leaves an unreadable file behind, so
    // the extension is normalized to match what was actually generated.
    const normalizedFilename = filename.toLowerCase().endsWith(expectedExt)
      ? filename
      : `${filename.replace(/\.[^./\\]+$/, "")}${expectedExt}`;
    const rel = await assertMutationPathAllowed({
      appPath: params.appPath,
      relativePath: normalizedFilename,
    });
    const full = safeJoin(params.appPath, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
    return rel;
  };

  const COLOR_SCHEME_NAMES = listColorSchemeNames();

  /** Shared "colorScheme" / "colors" input-schema fields for the office tools. */
  function officeColorSchemaFields(): JsonSchemaProperties {
    return {
      colorScheme: {
        type: "string",
        description: `Named color scheme to recolor the template's brand colors (${COLOR_SCHEME_NAMES.join(", ")}). Defaults to slate.`,
      },
      colors: {
        type: "object",
        description:
          'Optional hex overrides per role, layered on top of colorScheme, e.g. { "primary": "2F5233" }. Roles: primary, primaryText, secondary, surface, muted, border.',
      },
    };
  }

  const resolveScheme = (colorScheme?: string, colors?: Record<string, string>) =>
    resolveColorScheme(colorScheme, colors as Partial<Record<ColorRole, string>>);

  tools.create_document = {
    description:
      'Create a Word document (.docx) from a professional, pre-styled template, filling its [placeholders] with your content. Pick a "template" (list available ones with read_office_template) and pass "values" mapping each placeholder to replacement text. Set "colorScheme" (or per-role "colors" overrides) to recolor the template\'s brand colors. Omit "sections" unless you need a fully custom, unstyled document (skips template design + recoloring).',
    inputSchema: schema(
      {
        filename: { type: "string", description: "Output filename ending in .docx" },
        template: {
          type: "string",
          description:
            "Base template name. Defaults to professional_report_template. See read_office_template for the full list.",
        },
        values: {
          type: "object",
          description:
            'Map of placeholder -> replacement text, e.g. { "[Client / Company Name]": "Acme Corp", "[$ amount]": "$5,000" }. Keys are the exact placeholder strings (with brackets) returned by read_office_template.',
        },
        ...officeColorSchemaFields(),
        title: { type: "string", description: "Document title (metadata)." },
        sections: {
          type: "array",
          items: { type: "object" },
          description:
            "Optional: full custom document sections that replace the template entirely.",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      title,
      template,
      values,
      colorScheme,
      colors,
      sections,
    }: {
      filename: string;
      title?: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      sections?: unknown[];
    }) => {
      const blocked = blockReason("create_document", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        const key = template ?? "professional_report_template";
        const tmpl = ALL_DOC_TEMPLATES[key] ?? ALL_DOC_TEMPLATES["professional_report_template"];
        let finalSections: unknown[];
        if (sections && sections.length > 0) {
          finalSections = sections;
        } else {
          const scheme = resolveScheme(colorScheme, colors);
          const recolored = recolor(tmpl?.sections ?? [], DOC_TEMPLATE_ROLES[key] ?? {}, scheme);
          finalSections = applyPlaceholders(recolored, values ?? {}) as unknown[];
        }
        const buffer = await generateDocx({
          title: title ?? tmpl?.title,
          sections: finalSections,
        });
        const rel = await writeOfficeArtifact(filename, buffer, ".docx");
        return `Created ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error creating document: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.create_spreadsheet = {
    description:
      'Create an Excel spreadsheet (.xlsx) from a professional, pre-styled template, filling its [placeholders] with your content. Pick a "template" (list available ones with read_office_template) and pass "values" mapping each placeholder to replacement text. Set "colorScheme" (or per-role "colors" overrides) to recolor the template\'s brand colors. Omit "worksheets" unless you need a fully custom, unstyled spreadsheet (skips template design + recoloring).',
    inputSchema: schema(
      {
        filename: { type: "string", description: "Output filename ending in .xlsx" },
        template: {
          type: "string",
          description:
            "Base template name. Defaults to budget_tracker. See read_office_template for the full list.",
        },
        values: {
          type: "object",
          description: 'Map of placeholder -> replacement text, e.g. { "[Employee Name]": "Jordan Lee" }.',
        },
        ...officeColorSchemaFields(),
        worksheets: {
          type: "array",
          items: { type: "object" },
          description: "Optional: full custom worksheets that replace the template entirely.",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      template,
      values,
      colorScheme,
      colors,
      worksheets,
    }: {
      filename: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      worksheets?: unknown[];
    }) => {
      const blocked = blockReason("create_spreadsheet", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        const key = template ?? "budget_tracker";
        const tmpl = ALL_XLSX_TEMPLATES[key] ?? ALL_XLSX_TEMPLATES["budget_tracker"];
        let finalWorksheets: unknown[];
        if (worksheets && worksheets.length > 0) {
          finalWorksheets = worksheets;
        } else {
          const scheme = resolveScheme(colorScheme, colors);
          const recolored = recolor(tmpl?.worksheets ?? [], XLSX_TEMPLATE_ROLES[key] ?? {}, scheme);
          finalWorksheets = applyPlaceholders(recolored, values ?? {}) as unknown[];
        }
        const buffer = await generateXlsx({ worksheets: finalWorksheets });
        const rel = await writeOfficeArtifact(filename, buffer, ".xlsx");
        return `Created ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error creating spreadsheet: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.create_presentation = {
    description:
      'Create a PowerPoint presentation (.pptx) from a professional, pre-styled template, filling its [placeholders] with your content. Pick a "template" (list available ones with read_office_template) and pass "values" mapping each placeholder to replacement text. Set "colorScheme" (or per-role "colors" overrides) to recolor the deck\'s brand colors. Omit "slides" unless you need a fully custom deck (skips template design + recoloring) — a slide is { children: [{ shape: { textBody: { text: "Title" }, x, y, width, height, fill } }, ...] }.',
    inputSchema: schema(
      {
        filename: { type: "string", description: "Output filename ending in .pptx" },
        template: {
          type: "string",
          description:
            "Base template name. Defaults to presentation_idea. See read_office_template for the full list.",
        },
        values: {
          type: "object",
          description:
            'Map of placeholder -> replacement text. Keys are the exact placeholder strings (with brackets) returned by read_office_template.',
        },
        ...officeColorSchemaFields(),
        title: { type: "string", description: "Presentation title (metadata)." },
        slides: {
          type: "array",
          items: { type: "object" },
          description: "Optional: full custom slides that replace the template entirely.",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      template,
      values,
      colorScheme,
      colors,
      title,
      slides,
    }: {
      filename: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      title?: string;
      slides?: unknown[];
    }) => {
      const blocked = blockReason("create_presentation", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        const key = template ?? "presentation_idea";
        const tmpl = ALL_PPT_TEMPLATES[key] ?? ALL_PPT_TEMPLATES["presentation_idea"];
        const options =
          slides && slides.length > 0
            ? { title: title ?? tmpl?.title, slides }
            : {
                title: title ?? tmpl?.title,
                size: tmpl?.size,
                masters: tmpl?.masters,
                slides: applyPlaceholders(
                  recolor(
                    tmpl?.slides ?? [],
                    PPT_TEMPLATE_ROLES[key] ?? {},
                    resolveScheme(colorScheme, colors),
                  ),
                  values ?? {},
                ),
              };
        const buffer = await generatePptx(options);
        const rel = await writeOfficeArtifact(filename, buffer, ".pptx");
        return `Created ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error creating presentation: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.create_office_documents_batch = {
    description:
      'Generate many documents/presentations/spreadsheets from the SAME pre-styled template in one call — e.g. certificates, personalized reports, or invoices for a list of people — keeping the template\'s design (and color scheme) identical across every file, mail-merge style. Provide "records" inline for small batches, or point "dataFile" at a .json (array of objects) or .csv (header row + data rows) file already written into the project — recommended for large batches (hundreds to thousands of records), since it avoids emitting every record as tool-call output. Each record\'s fields become placeholder values (a "Name" column fills both "Name" and "[Name]"). Up to 20,000 records per call.',
    inputSchema: schema(
      {
        kind: { type: "string", description: 'Document kind: "docx", "pptx", or "xlsx".' },
        template: {
          type: "string",
          description: "Base template name (see read_office_template for the full list per kind).",
        },
        outputDir: {
          type: "string",
          description: "Project-relative folder to write the generated files into.",
        },
        records: {
          type: "array",
          items: { type: "object" },
          description:
            'Inline records for small batches: [{ "filename": "jordan.docx", "values": { "[Name]": "Jordan" } }, ...]. "filename" is optional (auto-numbered if omitted).',
        },
        dataFile: {
          type: "string",
          description:
            'Project-relative path to a .json (array of record objects) or .csv (header row + data rows) file to use instead of "records" — the right choice for hundreds to thousands of records.',
        },
        filenameField: {
          type: "string",
          description:
            'Column/key in each CSV or JSON record to use as that file\'s name (extension is added automatically). Ignored for inline "records" that already set "filename".',
        },
        filenamePrefix: {
          type: "string",
          description: 'Prefix for auto-numbered filenames when no filename is available. Defaults to "document".',
        },
        values: {
          type: "object",
          description: "Placeholder values shared by every record (e.g. a constant company name), merged under each record's own values.",
        },
        ...officeColorSchemaFields(),
      },
      ["kind", "outputDir"],
    ),
    execute: async ({
      kind,
      template,
      outputDir,
      records,
      dataFile,
      filenameField,
      filenamePrefix,
      values,
      colorScheme,
      colors,
    }: {
      kind: string;
      template?: string;
      outputDir: string;
      records?: { filename?: string; values?: Record<string, string> }[];
      dataFile?: string;
      filenameField?: string;
      filenamePrefix?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
    }) => {
      const blocked = blockReason("create_office_documents_batch", params);
      if (blocked) return blocked;

      if (kind !== "docx" && kind !== "pptx" && kind !== "xlsx") {
        return 'Invalid "kind": must be "docx", "pptx", or "xlsx".';
      }

      let batchRecords: BatchRecord[];
      if (dataFile) {
        const dataFileBlocked = fileAccessBlock(params, dataFile);
        if (dataFileBlocked) return dataFileBlocked;
        try {
          const rel = await assertMutationPathAllowed({ appPath: params.appPath, relativePath: dataFile });
          const full = safeJoin(params.appPath, rel);
          if (!fs.existsSync(full)) return `Data file not found: ${dataFile}`;
          const text = fs.readFileSync(full, "utf8");
          const ext = path.extname(dataFile).toLowerCase();
          const parsed =
            ext === ".json"
              ? parseJsonRecords(text, filenameField)
              : ext === ".csv"
                ? parseCsvRecords(text, filenameField)
                : `Unsupported data file type: ${dataFile} (use .json or .csv).`;
          if (typeof parsed === "string") return parsed;
          batchRecords = parsed;
        } catch (e) {
          return `Error reading data file: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else if (records && records.length > 0) {
        batchRecords = records.map((r) => ({
          filename: r.filename,
          values: toPlaceholderValues(r.values ?? {}),
        }));
      } else {
        return 'Provide either "records" (inline) or "dataFile" (a .json/.csv path in the project).';
      }

      if (batchRecords.length === 0) return "No records to generate.";
      if (batchRecords.length > MAX_BATCH_RECORDS) {
        return `Too many records: ${batchRecords.length} (max ${MAX_BATCH_RECORDS} per call). Split into multiple calls.`;
      }

      const fileBlocked = fileAccessBlock(params, outputDir);
      if (fileBlocked) return fileBlocked;

      const sharedValues = toPlaceholderValues(values ?? {});
      const scheme = resolveScheme(colorScheme, colors);
      const prefix = (filenamePrefix && filenamePrefix.trim()) || "document";
      const pad = Math.max(3, String(batchRecords.length).length);

      let recoloredBody: unknown;
      let title: string | undefined;
      let pptSize: unknown;
      let pptMasters: unknown;
      if (kind === "docx") {
        const key = template ?? "professional_report_template";
        const tmpl = ALL_DOC_TEMPLATES[key] ?? ALL_DOC_TEMPLATES["professional_report_template"];
        title = tmpl?.title;
        recoloredBody = recolor(tmpl?.sections ?? [], DOC_TEMPLATE_ROLES[key] ?? {}, scheme);
      } else if (kind === "pptx") {
        const key = template ?? "presentation_idea";
        const tmpl = ALL_PPT_TEMPLATES[key] ?? ALL_PPT_TEMPLATES["presentation_idea"];
        title = tmpl?.title;
        pptSize = tmpl?.size;
        pptMasters = tmpl?.masters;
        recoloredBody = recolor(tmpl?.slides ?? [], PPT_TEMPLATE_ROLES[key] ?? {}, scheme);
      } else {
        const key = template ?? "budget_tracker";
        const tmpl = ALL_XLSX_TEMPLATES[key] ?? ALL_XLSX_TEMPLATES["budget_tracker"];
        title = tmpl?.title;
        recoloredBody = recolor(tmpl?.worksheets ?? [], XLSX_TEMPLATE_ROLES[key] ?? {}, scheme);
      }

      const startedAt = Date.now();
      const usedNames = new Set<string>();
      const examples: string[] = [];
      const failures: string[] = [];
      let succeeded = 0;

      for (let i = 0; i < batchRecords.length; i++) {
        const record = batchRecords[i];
        try {
          const recordValues = { ...sharedValues, ...record.values };
          const content = applyPlaceholders(recoloredBody, recordValues);

          let baseName = sanitizeBatchFilename(
            record.filename,
            `${prefix}-${String(i + 1).padStart(pad, "0")}`,
            kind,
          );
          if (usedNames.has(baseName)) {
            const dot = baseName.lastIndexOf(".");
            let n = 2;
            let candidate = `${baseName.slice(0, dot)}-${n}${baseName.slice(dot)}`;
            while (usedNames.has(candidate)) {
              n++;
              candidate = `${baseName.slice(0, dot)}-${n}${baseName.slice(dot)}`;
            }
            baseName = candidate;
          }
          usedNames.add(baseName);

          const buffer =
            kind === "docx"
              ? await generateDocx({ title, sections: content })
              : kind === "pptx"
                ? await generatePptx({ title, size: pptSize, masters: pptMasters, slides: content })
                : await generateXlsx({ worksheets: content });

          const rel = await writeOfficeArtifact(
            `${outputDir}/${baseName}`,
            buffer,
            kind === "docx" ? ".docx" : kind === "pptx" ? ".pptx" : ".xlsx",
          );
          succeeded++;
          if (examples.length < 3) examples.push(rel);
        } catch (e) {
          if (failures.length < 10) {
            failures.push(`#${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (i % BATCH_YIELD_EVERY === BATCH_YIELD_EVERY - 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const lines = [
        `Generated ${succeeded}/${batchRecords.length} ${kind} files in ${outputDir}/ (${elapsedSec}s).`,
      ];
      if (failures.length > 0) {
        lines.push(`${batchRecords.length - succeeded} failed:`);
        for (const f of failures) lines.push(`- ${f}`);
        if (batchRecords.length - succeeded > failures.length) lines.push("- ...");
      }
      for (const rel of examples) {
        lines.push(`<octopus-studio-office-file path="${rel}" />`);
      }
      if (succeeded > examples.length) {
        lines.push(`...and ${succeeded - examples.length} more in ${outputDir}/.`);
      }
      return lines.join("\n");
    },
  };

  const readOfficeText = async (filename: string): Promise<string> => {
    const rel = await assertMutationPathAllowed({
      appPath: params.appPath,
      relativePath: filename,
    });
    const full = safeJoin(params.appPath, rel);
    if (!fs.existsSync(full)) return `File not found: ${filename}`;
    const ext = path.extname(filename).toLowerCase();
    const buffer = fs.readFileSync(full);
    let parsed: unknown;
    if (ext === ".docx") parsed = await parseDocx(buffer);
    else if (ext === ".pptx") parsed = await parsePptx(buffer);
    else if (ext === ".xlsx") parsed = await parseXlsx(buffer);
    else return `Unsupported file type: ${filename}`;
    return collectOfficeText(parsed).filter(Boolean).join("\n");
  };

  tools.read_office_file = {
    description:
      "Read and parse an existing office file (.docx/.pptx/.xlsx) and return its text content, so you can review it before editing.",
    inputSchema: schema({ filename: { type: "string" } }, ["filename"]),
    execute: async ({ filename }: { filename: string }) => {
      const blocked = blockReason("read_office_file", params);
      if (blocked) return blocked;
      try {
        return await readOfficeText(filename);
      } catch (e) {
        return `Error reading office file: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.read_office_template = {
    description:
      "List the available document/spreadsheet/presentation templates, the [placeholders] they contain, and the color schemes available to recolor them. Pass a template name to see its placeholders; omit to list all templates.",
    inputSchema: schema(
      {
        template: {
          type: "string",
          description:
            "Template name (e.g. professional_report_template, budget_tracker, or presentation_pitch). Omit to list all.",
        },
      },
      [],
    ),
    execute: async ({ template }: { template?: string }) => {
      const blocked = blockReason("read_office_template", params);
      if (blocked) return blocked;
      try {
        if (template) {
          const doc = ALL_DOC_TEMPLATES[template];
          if (doc) {
            return formatTemplateInfo(template, doc.title, collectPlaceholders(doc.sections));
          }
          const xlsx = ALL_XLSX_TEMPLATES[template];
          if (xlsx) {
            return formatTemplateInfo(template, xlsx.title, collectPlaceholders(xlsx.worksheets));
          }
          const ppt = ALL_PPT_TEMPLATES[template];
          if (ppt) {
            return formatTemplateInfo(template, ppt.title, collectPlaceholders(ppt.slides));
          }
          return `Unknown template: ${template}`;
        }
        const lines = ["Available templates:", ""];
        for (const [name, t] of Object.entries(ALL_DOC_TEMPLATES)) {
          lines.push(`- ${name} (docx): ${t.title}`);
        }
        for (const [name, t] of Object.entries(ALL_XLSX_TEMPLATES)) {
          lines.push(`- ${name} (xlsx): ${t.title}`);
        }
        for (const [name, t] of Object.entries(ALL_PPT_TEMPLATES)) {
          lines.push(`- ${name} (pptx): ${t.title}`);
        }
        lines.push(
          "",
          `Color schemes (pass as "colorScheme" to create_document/create_spreadsheet/create_presentation): ${COLOR_SCHEME_NAMES.join(", ")}.`,
          'You can also override individual roles with "colors", e.g. { "primary": "2F5233" }. Roles: primary, primaryText, secondary, surface, muted, border.',
          "",
          "Call read_office_template with a specific name to see its placeholders.",
        );
        return lines.join("\n");
      } catch (e) {
        return `Error reading template: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.edit_document = {
    description:
      "Edit an existing Word document (.docx): regenerate it from a template with corrected values/colors, or overwrite it with a custom sections spec. Review it first with read_office_file if needed.",
    inputSchema: schema(
      {
        filename: { type: "string", description: "Existing .docx file to edit" },
        template: { type: "string", description: "Base template name (optional)." },
        values: {
          type: "object",
          description: "Map of placeholder -> replacement text.",
        },
        ...officeColorSchemaFields(),
        sections: {
          type: "array",
          items: { type: "object" },
          description: "Corrected document sections (custom).",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      template,
      values,
      colorScheme,
      colors,
      sections,
    }: {
      filename: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      sections?: unknown[];
    }) => {
      const blocked = blockReason("edit_document", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        await readOfficeText(filename); // confirm it exists / is parseable
        const key = template ?? "professional_report_template";
        const tmpl = template ? ALL_DOC_TEMPLATES[key] : undefined;
        const finalSections =
          sections && sections.length > 0
            ? sections
            : (applyPlaceholders(
                recolor(tmpl?.sections ?? [], DOC_TEMPLATE_ROLES[key] ?? {}, resolveScheme(colorScheme, colors)),
                values ?? {},
              ) as unknown[]);
        const buffer = await generateDocx({
          title: tmpl?.title,
          sections: finalSections,
        });
        const rel = await writeOfficeArtifact(filename, buffer, ".docx");
        return `Edited ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error editing document: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.edit_spreadsheet = {
    description:
      "Edit an existing Excel spreadsheet (.xlsx): regenerate it from a template with corrected values/colors, or overwrite it with a custom worksheets spec.",
    inputSchema: schema(
      {
        filename: { type: "string", description: "Existing .xlsx file to edit" },
        template: { type: "string", description: "Base template name (optional)." },
        values: {
          type: "object",
          description: "Map of placeholder -> replacement text.",
        },
        ...officeColorSchemaFields(),
        worksheets: {
          type: "array",
          items: { type: "object" },
          description: "Corrected worksheets (custom).",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      template,
      values,
      colorScheme,
      colors,
      worksheets,
    }: {
      filename: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      worksheets?: unknown[];
    }) => {
      const blocked = blockReason("edit_spreadsheet", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        await readOfficeText(filename);
        const key = template ?? "budget_tracker";
        const tmpl = template ? ALL_XLSX_TEMPLATES[key] : undefined;
        const finalWorksheets =
          worksheets && worksheets.length > 0
            ? worksheets
            : (applyPlaceholders(
                recolor(tmpl?.worksheets ?? [], XLSX_TEMPLATE_ROLES[key] ?? {}, resolveScheme(colorScheme, colors)),
                values ?? {},
              ) as unknown[]);
        const buffer = await generateXlsx({ worksheets: finalWorksheets });
        const rel = await writeOfficeArtifact(filename, buffer, ".xlsx");
        return `Edited ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error editing spreadsheet: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.edit_presentation = {
    description:
      "Edit an existing PowerPoint presentation (.pptx): regenerate it from a template with corrected values/colors, or overwrite it with a custom slides spec. Review it first with read_office_file if needed.",
    inputSchema: schema(
      {
        filename: { type: "string", description: "Existing .pptx file to edit" },
        template: { type: "string", description: "Base template name (optional)." },
        values: {
          type: "object",
          description: "Map of placeholder -> replacement text.",
        },
        ...officeColorSchemaFields(),
        slides: {
          type: "array",
          items: { type: "object" },
          description: "Corrected slides (custom).",
        },
      },
      ["filename"],
    ),
    execute: async ({
      filename,
      template,
      values,
      colorScheme,
      colors,
      slides,
    }: {
      filename: string;
      template?: string;
      values?: Record<string, string>;
      colorScheme?: string;
      colors?: Record<string, string>;
      slides?: unknown[];
    }) => {
      const blocked = blockReason("edit_presentation", params);
      if (blocked) return blocked;
      const fileBlocked = fileAccessBlock(params, filename);
      if (fileBlocked) return fileBlocked;
      try {
        await readOfficeText(filename);
        const key = template ?? "presentation_idea";
        const tmpl = template ? ALL_PPT_TEMPLATES[key] : undefined;
        const options =
          slides && slides.length > 0
            ? { title: tmpl?.title, slides }
            : {
                title: tmpl?.title,
                size: tmpl?.size,
                masters: tmpl?.masters,
                slides: applyPlaceholders(
                  recolor(tmpl?.slides ?? [], PPT_TEMPLATE_ROLES[key] ?? {}, resolveScheme(colorScheme, colors)),
                  values ?? {},
                ),
              };
        const buffer = await generatePptx(options);
        const rel = await writeOfficeArtifact(filename, buffer, ".pptx");
        return `Edited ${rel}\n<octopus-studio-office-file path="${rel}" />`;
      } catch (e) {
        return `Error editing presentation: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // --- Honest stubs --------------------------------------------------------
  // No local backing exists for these; several imply product decisions (OAuth
  // integrations, image-gen billing, interactive questionnaires) or infra
  // (a web search API). Never silently no-op: tell the model the truth so it
  // stops trying and works around the gap.

  const stub = (description: string) => ({
    description,
    inputSchema: schema({}),
    execute: async () => `${STUB_MESSAGE}`,
  });

  tools.web_search = stub("Search the web for information.");
  tools.web_crawl = stub("Crawl a website starting from a URL and collect page contents.");
  tools.generate_image = stub("Generate an image asset for the app.");
  tools.add_integration = stub(
    "Add a third-party integration (e.g. Supabase, GitHub) to the project.",
  );
  tools.enable_nitro = stub("Enable the Nitro build/performance optimization for the project.");
  tools.planning_questionnaire = {
    description:
      "Ask the user 1-3 focused structured questions while planning (design preferences, target audience, etc.). Each question is text, radio, or checkbox. Waits for the user's answers and returns them.",
    inputSchema: schema(
      {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", description: "'text' | 'radio' | 'checkbox'" },
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              required: { type: "boolean" },
              placeholder: { type: "string" },
            },
            required: ["id", "type", "question"],
          },
          description:
            "1-3 structured questions. Each item: { id, type: 'text'|'radio'|'checkbox', question, options?, required?, placeholder? }.",
        },
      },
      ["questions"],
    ),
    execute: async (
      args: { questions: QuestionnaireQuestion[] },
      options?: { abortSignal?: AbortSignal },
    ) => {
      const blocked = blockReason("planning_questionnaire", params);
      if (blocked) return blocked;
      if (!params.requestQuestionnaire) return `${STUB_MESSAGE}`;
      try {
        const answers = await params.requestQuestionnaire(
          args.questions,
          options?.abortSignal,
        );
        if (!answers || Object.keys(answers).length === 0) {
          return "No response received from the user.";
        }
        return stringify(answers);
      } catch (e) {
        return `Error asking questionnaire: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  tools.spawn_subagent = {
    description:
      "Delegate a bounded, isolated subtask to a sub-agent worker that runs with its own narrow context and file permissions, then returns the sub-agent's result. Use to isolate or parallelize a chunk of work.",
    inputSchema: schema(
      {
        description: { type: "string", description: "What the sub-agent should do." },
        role: {
          type: "string",
          description: "One of: explorer, coder, tester, debugger, reviewer. Default coder.",
        },
        allowed_files: {
          type: "array",
          items: { type: "string" },
          description: "Files or directories the sub-agent may read/write (relative paths or directory prefixes).",
        },
        context: { type: "string", description: "Relevant context for the sub-agent." },
      },
      ["description"],
    ),
    execute: async (args: {
      description: string;
      role?: string;
      allowed_files?: string[];
      context?: string;
    }) => {
      const blocked = blockReason("spawn_subagent", params);
      if (blocked) return blocked;
      if (!params.spawnSubAgent) return `${STUB_MESSAGE}`;
      const validRoles: SubAgentSpec["role"][] = [
        "explorer",
        "coder",
        "tester",
        "debugger",
        "reviewer",
      ];
      try {
        return await params.spawnSubAgent({
          description: args.description,
          role: validRoles.includes(args.role as SubAgentSpec["role"])
            ? (args.role as SubAgentSpec["role"])
            : "coder",
          allowedFiles: args.allowed_files ?? null,
          context: args.context,
        });
      } catch (e) {
        return `Error running sub-agent: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
  tools.read_chat = stub("Read a specific past chat message and its surrounding context.");
  tools.search_chats = stub("Search this app's chat history by keyword.");
  tools.explore_chat_history = stub(
    "Search prior chats for this app for relevant decisions and report a summary.",
  );
  tools.read_guide = stub("Read a project guide or documentation file (e.g. AGENTS.md).");
  tools.read_logs = stub("Read the app's recent runtime logs.");

  return tools;
}

function listTree(appPath: string, base: string, relPrefix: string): string {
  const EXCLUDED = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".octopusStudio",
  ]);
  const lines: string[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of sorted) {
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED.has(entry.name)) continue;
        lines.push(`${"  ".repeat(depth)}${entry.name}/`);
        if (depth < 3) walk(path.join(dir, entry.name), childRel, depth + 1);
      } else {
        lines.push(`${"  ".repeat(depth)}${entry.name}`);
      }
    }
  };
  walk(base, relPrefix === "." ? "" : relPrefix, 0);
  return lines.join("\n") || "(empty directory)";
}
