// @vitest-environment node
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { withResourceLock } from "./agent_lock";

describe("withResourceLock", () => {
  it("commits work under a write lock", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    withResourceLock(db, "write", () => {
      db.prepare("INSERT INTO t (id, v) VALUES (1, 'a')").run();
    });
    const row = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    expect(row.v).toBe("a");
  });

  it("rolls back on error", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    expect(() =>
      withResourceLock(db, "write", () => {
        db.prepare("INSERT INTO t (id, v) VALUES (1, 'a')").run();
        throw new Error("boom");
      }),
    ).toThrow("boom");
    const row = db.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("holds an exclusive write transaction (nested write is rejected)", () => {
    const db = new Database(":memory:");
    expect(() =>
      withResourceLock(db, "write", () => {
        db.exec("BEGIN IMMEDIATE"); // already inside a transaction → throws
      }),
    ).toThrow();
  });
});
