// @vitest-environment node
//
// Tests for the SQLite-backed, per-symbol chunk index. Verifies the two
// properties that matter for the token-efficiency goal: (1) symbol extraction
// produces sane line ranges / signatures / dependencies, and (2) a re-index of
// a changed file only re-hashes the changed symbol — unchanged symbols' rows are
// left untouched, removed symbols' rows are deleted.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  extractFileSymbols,
  initCodeIndexSchema,
  buildOrUpdateFileChunks,
  buildOrUpdateProjectIndex,
  searchChunks,
  getSignatures,
  removeFileChunks,
} from "../code_index";

const FIXTURE = `
import { helper } from "../helpers";

export function add(a: number, b: number): number {
  // adds two numbers
  return helper(a + b);
}

export function greet(name: string): string {
  return "hello " + name; // string in a comment: { ignored }
}

export class Counter {
  private count = 0;

  increment(): void {
    this.count += 1;
  }

  get value(): number {
    return this.count;
  }
}
`;

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-index-"));
  db = new Database(":memory:");
  initCodeIndexSchema(db);
  fs.writeFileSync(path.join(dir, "index.ts"), FIXTURE);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("extractFileSymbols", () => {
  it("extracts functions, classes, and methods with line ranges", () => {
    const symbols = extractFileSymbols(FIXTURE);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    expect(byName.has("add")).toBe(true);
    expect(byName.get("add")?.kind).toBe("function");
    expect(byName.get("add")?.startLine).toBeGreaterThanOrEqual(4);

    expect(byName.has("greet")).toBe(true);
    expect(byName.get("greet")?.kind).toBe("function");

    expect(byName.has("Counter")).toBe(true);
    expect(byName.get("Counter")?.kind).toBe("class");

    expect(byName.has("increment")).toBe(true);
    expect(byName.get("increment")?.kind).toBe("method");

    // String/comment braces and `{ ignored }` must not break brace matching:
    // `greet` should span its own body, not swallow the class below it.
    const greet = byName.get("greet")!;
    expect(greet.endLine).toBeLessThan(byName.get("Counter")!.startLine);
  });

  it("records best-effort call-callee dependencies", () => {
    const symbols = extractFileSymbols(FIXTURE);
    const add = symbols.find((s) => s.name === "add");
    expect(add?.dependencies).toContain("helper");
  });
});

describe("buildOrUpdateFileChunks", () => {
  it("inserts symbols on first index", () => {
    const summary = buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(summary.inserted).toBeGreaterThan(0);
    expect(summary.updated).toBe(0);
  });

  it("leaves every symbol unchanged when nothing changed", () => {
    buildOrUpdateFileChunks(db, dir, "index.ts");
    const before = db.prepare(`SELECT * FROM chunks WHERE file_path = ?`).all("index.ts");

    const summary = buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(summary.unchanged).toBe(before.length);
    expect(summary.updated).toBe(0);
    expect(summary.inserted).toBe(0);
  });

  it("re-hashes only the changed symbol", () => {
    buildOrUpdateFileChunks(db, dir, "index.ts");
    const addBefore = db.prepare(`SELECT hash FROM chunks WHERE symbol_name = ?`).get("add") as {
      hash: string;
    };
    const greetBefore = db
      .prepare(`SELECT hash FROM chunks WHERE symbol_name = ?`)
      .get("greet") as { hash: string };

    // Change only the body of `add`.
    const modified = FIXTURE.replace("return helper(a + b);", "return helper(a + b + 1);");
    fs.writeFileSync(path.join(dir, "index.ts"), modified);

    const summary = buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(summary.updated).toBe(1);
    expect(summary.unchanged).toBeGreaterThanOrEqual(1);

    const addAfter = db.prepare(`SELECT hash FROM chunks WHERE symbol_name = ?`).get("add") as {
      hash: string;
    };
    const greetAfter = db.prepare(`SELECT hash FROM chunks WHERE symbol_name = ?`).get("greet") as {
      hash: string;
    };

    expect(addAfter.hash).not.toBe(addBefore.hash);
    expect(greetAfter.hash).toBe(greetBefore.hash);
  });

  it("deletes rows for a symbol that was removed", () => {
    buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM chunks WHERE symbol_name = 'greet'`).get(),
    ).toEqual({ n: 1 });

    const withoutGreet = FIXTURE.replace(/export function greet[\s\S]*?\n}\n/, "");
    fs.writeFileSync(path.join(dir, "index.ts"), withoutGreet);

    const summary = buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(summary.deleted).toBeGreaterThanOrEqual(1);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM chunks WHERE symbol_name = 'greet'`).get(),
    ).toEqual({ n: 0 });
  });

  it("clears all rows when the file is deleted", () => {
    buildOrUpdateFileChunks(db, dir, "index.ts");
    fs.rmSync(path.join(dir, "index.ts"));
    const summary = buildOrUpdateFileChunks(db, dir, "index.ts");
    expect(summary.deleted).toBeGreaterThan(0);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM chunks WHERE file_path = 'index.ts'`).get(),
    ).toEqual({ n: 0 });
  });
});

describe("retrieval", () => {
  it("searchChunks finds by symbol name", () => {
    buildOrUpdateProjectIndex(db, dir);
    const results = searchChunks(db, "greet");
    expect(results.some((r) => r.symbol_name === "greet")).toBe(true);
  });

  it("getSignatures returns one-line signatures", () => {
    buildOrUpdateProjectIndex(db, dir);
    const sigs = getSignatures(db, ["add", "missing"]);
    expect(sigs.add).toContain("function add");
    expect(sigs.missing).toBeUndefined();
  });

  it("removeFileChunks drops a file's rows", () => {
    buildOrUpdateProjectIndex(db, dir);
    expect(removeFileChunks(db, "index.ts")).toBeGreaterThan(0);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM chunks`).get()).toEqual({ n: 0 });
  });
});
