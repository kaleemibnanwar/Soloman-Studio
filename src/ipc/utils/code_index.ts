import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getUserDataPath } from "@/paths/paths";

/**
 * Persistent, hash-keyed project code index.
 *
 * One `better-sqlite3` database per app (keyed by a hash of the app's resolved
 * path), holding one row per code *symbol* (function/class/method/…) with its
 * own source-slice SHA-256. This lets the agent update the map incrementally —
 * a one-line edit inside a 2,000-line file only re-hashes that function's row —
 * and lets `code_search`/`explore_code` answer symbol lookups deterministically
 * (plain SQL `LIKE`, no LLM call).
 *
 * Symbol extraction is a dependency-free, syntactic scan (not a full TypeScript
 * program): it masks string/comment trivia, brace-matches each declaration's
 * body, and records best-effort call-callee identifiers as "dependencies".
 * Octopus Studio only ever builds JS/TS/React apps, so a real type checker adds
 * cost without adding coverage for the one language family that matters here.
 */

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "variable"
  | "interface"
  | "type"
  | "enum";

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  signature: string;
  dependencies: string[];
}

export interface ChunkRecord {
  id: string;
  file_path: string;
  symbol_name: string;
  kind: string;
  start_line: number;
  end_line: number;
  hash: string;
  signature: string | null;
  dependencies: string | null;
}

const CHUNK_TABLE = "chunks";

const INDEXED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const SKIPPED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".octopusStudio",
]);

const dbCache = new Map<string, Database.Database>();

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

export function getCodeIndexDbPath(appPath: string): string {
  const resolved = path.resolve(appPath);
  const digest = crypto.createHash("sha256").update(resolved).digest("hex");
  return path.join(getUserDataPath(), "code-index-cache", `${digest}.db`);
}

export function openCodeIndexDb(appPath: string): Database.Database {
  const dbPath = getCodeIndexDbPath(appPath);
  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initCodeIndexSchema(db);
  dbCache.set(dbPath, db);
  return db;
}

export function initCodeIndexSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${CHUNK_TABLE} (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      symbol_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      signature TEXT,
      dependencies TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file ON ${CHUNK_TABLE}(file_path);
    CREATE INDEX IF NOT EXISTS idx_chunks_name ON ${CHUNK_TABLE}(symbol_name);
  `);
}

// ---------------------------------------------------------------------------
// Symbol extraction (dependency-free, syntactic)
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `source` with the *contents* of strings, template-literal
 * interpolation, and comments replaced by spaces (newlines preserved). Braces
 * and keywords inside trivia can no longer fool the declaration regexes or the
 * brace matcher, and every returned offset stays valid against the original.
 */
function maskTrivia(source: string): string {
  const out = source.split("");
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };

  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? n : end);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      blank(i, end === -1 ? n : end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
          // Leave `${` visible so its brace still balances; blank only up to it.
          blank(i, j);
          i = j;
          break;
        }
        if (source[j] === quote) {
          closed = true;
          break;
        }
        j++;
      }
      blank(i, closed ? j + 1 : n);
      i = closed ? j + 1 : n;
      continue;
    }
    i++;
  }
  return out.join("");
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineOfOffset(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-indexed
}

function findMatchingBrace(masked: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return masked.length - 1;
}

const JS_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "else",
  "do",
  "try",
  "finally",
  "return",
  "function",
  "with",
  "await",
  "async",
  "new",
  "typeof",
  "instanceof",
  "in",
  "of",
  "delete",
  "void",
  "yield",
  "class",
  "extends",
  "import",
  "export",
  "default",
  "this",
  "super",
  "throw",
]);

function collectDependencies(maskedBody: string, selfName: string): string[] {
  const found = new Set<string>();
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(maskedBody)) !== null) {
    const name = m[1];
    if (!JS_KEYWORDS.has(name) && name !== selfName) found.add(name);
  }
  return [...found].sort();
}

function statementEnd(masked: string, from: number): number {
  const semi = masked.indexOf(";", from);
  const newline = masked.indexOf("\n", from);
  const candidates = [semi, newline].filter((v) => v !== -1);
  if (candidates.length === 0) return masked.length;
  return Math.min(...candidates);
}

interface DeclarationMatch {
  name: string;
  kind: SymbolKind;
  declStart: number;
  bodyStart: number;
  hasBlockBody: boolean;
}

/**
 * Scan the (masked) source line-by-line for declarations. Block-bodied
 * declarations point `bodyStart` at their `{`; expression-bodied ones point at
 * the expression. `classDepth` is a rough brace-depth guard so method shorthand
 * is only claimed inside a surrounding block.
 */
function findDeclarations(masked: string): DeclarationMatch[] {
  const results: DeclarationMatch[] = [];
  let classDepth = 0;

  const lines = masked.split("\n");
  let offset = 0;
  for (const line of lines) {
    const lineEnd = offset + line.length;
    const trimmed = line.trim();

    // `name(...) { ... }` method shorthand — only inside an enclosing block.
    const methodDecl = /^\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*(?::[^{=;]*?)?\{/.exec(line);
    if (methodDecl && classDepth > 0 && !JS_KEYWORDS.has(methodDecl[1])) {
      const openBrace = line.lastIndexOf("{");
      if (openBrace !== -1) {
        results.push({
          name: methodDecl[1],
          kind: "method",
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      }
    }

    const fnDecl = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(
      trimmed,
    );
    if (fnDecl) {
      const openBrace = line.indexOf("{");
      if (openBrace !== -1) {
        results.push({
          name: fnDecl[1],
          kind: classDepth > 0 ? "method" : "function",
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      }
    }

    const classDecl =
      /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(trimmed);
    if (classDecl) {
      const openBrace = line.indexOf("{");
      if (openBrace !== -1) {
        results.push({
          name: classDecl[1],
          kind: "class",
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      }
    }

    const typeDecl = /(?:export\s+)?(?:declare\s+)?(interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(
      trimmed,
    );
    if (typeDecl) {
      const openBrace = line.indexOf("{");
      const kind: SymbolKind =
        typeDecl[1] === "interface" ? "interface" : typeDecl[1] === "enum" ? "enum" : "type";
      if (openBrace !== -1) {
        results.push({
          name: typeDecl[2],
          kind,
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      } else {
        results.push({
          name: typeDecl[2],
          kind,
          declStart: offset,
          bodyStart: offset + trimmed.length,
          hasBlockBody: false,
        });
      }
    }

    const varDecl =
      /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*?)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(
        trimmed,
      );
    if (varDecl) {
      const openBrace = line.indexOf("{");
      const isArrow = /=>/.test(trimmed);
      if (isArrow && openBrace !== -1) {
        results.push({
          name: varDecl[1],
          kind: "variable",
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      } else if (isArrow) {
        results.push({
          name: varDecl[1],
          kind: "variable",
          declStart: offset,
          bodyStart: offset + trimmed.length,
          hasBlockBody: false,
        });
      } else if (openBrace !== -1) {
        results.push({
          name: varDecl[1],
          kind: "variable",
          declStart: offset,
          bodyStart: offset + openBrace,
          hasBlockBody: true,
        });
      }
    }

    for (let i = offset; i < lineEnd; i++) {
      if (masked[i] === "{") classDepth++;
      else if (masked[i] === "}") classDepth = Math.max(0, classDepth - 1);
    }

    offset = lineEnd + 1;
  }

  return results;
}

export function extractFileSymbols(source: string): ExtractedSymbol[] {
  const masked = maskTrivia(source);
  const lineStarts = computeLineStarts(source);
  const decls = findDeclarations(masked);
  const symbols: ExtractedSymbol[] = [];
  const seen = new Set<string>();

  for (const decl of decls) {
    const start = decl.declStart;
    let end: number;
    if (decl.hasBlockBody) {
      end = findMatchingBrace(masked, decl.bodyStart) + 1;
    } else {
      end = statementEnd(masked, decl.bodyStart);
    }
    end = Math.max(start, Math.min(end, source.length));

    const startLine = lineOfOffset(lineStarts, start);
    const endLine = lineOfOffset(lineStarts, Math.max(start, end - 1));

    const signature =
      source
        .slice(start, end)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0] ?? decl.name;

    const body = masked.slice(decl.bodyStart, end);
    const dependencies = collectDependencies(body, decl.name);

    const key = `${decl.name}#${decl.kind}#${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    symbols.push({
      name: decl.name,
      kind: decl.kind,
      start,
      end,
      startLine,
      endLine,
      signature,
      dependencies,
    });
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Incremental chunk maintenance
// ---------------------------------------------------------------------------

function hashSlice(source: string, start: number, end: number): string {
  return crypto.createHash("sha256").update(source.slice(start, end), "utf8").digest("hex");
}

function chunkId(relPath: string, symbolName: string): string {
  return `${relPath}::${symbolName}`;
}

function upsertStmt(db: Database.Database) {
  return db.prepare(`
    INSERT INTO ${CHUNK_TABLE} (id, file_path, symbol_name, kind, start_line, end_line, hash, signature, dependencies)
    VALUES (@id, @file_path, @symbol_name, @kind, @start_line, @end_line, @hash, @signature, @dependencies)
    ON CONFLICT(id) DO UPDATE SET
      file_path = excluded.file_path,
      kind = excluded.kind,
      start_line = excluded.start_line,
      end_line = excluded.end_line,
      hash = excluded.hash,
      signature = excluded.signature,
      dependencies = excluded.dependencies
  `);
}

function deleteByFileStmt(db: Database.Database) {
  return db.prepare(`DELETE FROM ${CHUNK_TABLE} WHERE file_path = ?`);
}

export interface FileChunkUpdateSummary {
  filePath: string;
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
}

/**
 * Re-index a single file at the symbol level: unchanged-hash symbols are left
 * untouched, changed/new symbols are upserted, removed symbols are deleted.
 */
export function buildOrUpdateFileChunks(
  db: Database.Database,
  appPath: string,
  relPath: string,
): FileChunkUpdateSummary {
  const absPath = path.join(appPath, relPath);
  let source: string;
  try {
    source = fs.readFileSync(absPath, "utf8");
  } catch {
    const deleted = deleteByFileStmt(db).run(relPath).changes;
    return { filePath: relPath, inserted: 0, updated: 0, unchanged: 0, deleted };
  }

  const symbols = extractFileSymbols(source);
  const existing = new Map<string, ChunkRecord>();
  for (const row of db
    .prepare(`SELECT * FROM ${CHUNK_TABLE} WHERE file_path = ?`)
    .all(relPath) as ChunkRecord[]) {
    existing.set(row.symbol_name, row);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  const upsert = upsertStmt(db);
  for (const symbol of symbols) {
    const id = chunkId(relPath, symbol.name);
    const hash = hashSlice(source, symbol.start, symbol.end);
    const prior = existing.get(symbol.name);
    if (prior && prior.hash === hash) {
      unchanged++;
      continue;
    }
    upsert.run({
      id,
      file_path: relPath,
      symbol_name: symbol.name,
      kind: symbol.kind,
      start_line: symbol.startLine,
      end_line: symbol.endLine,
      hash,
      signature: symbol.signature,
      dependencies: JSON.stringify(symbol.dependencies),
    });
    if (prior) updated++;
    else inserted++;
  }

  const liveNames = new Set(symbols.map((s) => s.name));
  let deleted = 0;
  for (const name of existing.keys()) {
    if (!liveNames.has(name)) {
      db.prepare(`DELETE FROM ${CHUNK_TABLE} WHERE id = ?`).run(chunkId(relPath, name));
      deleted++;
    }
  }

  return { filePath: relPath, inserted, updated, unchanged, deleted };
}

function walkSourceFiles(appPath: string): string[] {
  const results: string[] = [];
  const visit = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
        visit(path.join(dir, entry.name));
      } else if (entry.isFile() && INDEXED_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name));
      }
    }
  };
  visit(appPath);
  return results;
}

export function buildOrUpdateProjectIndex(
  db: Database.Database,
  appPath: string,
): { filesIndexed: number; symbolsIndexed: number } {
  let filesIndexed = 0;
  let symbolsIndexed = 0;
  for (const absPath of walkSourceFiles(appPath)) {
    const relPath = path.relative(appPath, absPath).split(path.sep).join("/");
    const summary = buildOrUpdateFileChunks(db, appPath, relPath);
    filesIndexed++;
    symbolsIndexed += summary.inserted + summary.updated;
  }
  return { filesIndexed, symbolsIndexed };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export function searchChunks(db: Database.Database, query: string, limit = 20): ChunkRecord[] {
  const pattern = `%${query}%`;
  return db
    .prepare(
      `SELECT * FROM ${CHUNK_TABLE}
       WHERE symbol_name LIKE ? OR file_path LIKE ? OR kind LIKE ?
       ORDER BY symbol_name = ? DESC, start_line ASC
       LIMIT ?`,
    )
    .all(pattern, pattern, pattern, query, limit) as ChunkRecord[];
}

export function getChunk(db: Database.Database, id: string): ChunkRecord | undefined {
  return db.prepare(`SELECT * FROM ${CHUNK_TABLE} WHERE id = ?`).get(id) as ChunkRecord | undefined;
}

export function getSignatures(
  db: Database.Database,
  symbolNames: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (symbolNames.length === 0) return result;
  const placeholders = symbolNames.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT symbol_name, signature FROM ${CHUNK_TABLE} WHERE symbol_name IN (${placeholders})`,
    )
    .all(...symbolNames) as Array<{ symbol_name: string; signature: string | null }>;
  for (const row of rows) {
    if (row.signature) result[row.symbol_name] = row.signature;
  }
  return result;
}

export function removeFileChunks(db: Database.Database, relPath: string): number {
  return deleteByFileStmt(db).run(relPath).changes;
}
