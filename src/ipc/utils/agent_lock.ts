import Database from "better-sqlite3";

/**
 * The single concurrency primitive for the shared index/metadata SQLite DB
 * (Octopus-Studio Implementation Guide v1.1, §14 / rule 8).
 *
 * Source files are isolated via git worktrees, NOT these locks. This primitive
 * guards only the one resource genuinely mutated concurrently by multiple
 * agents: the shared SQLite index/metadata (WAL mode). A `write` lock takes an
 * `BEGIN IMMEDIATE` transaction (excludes other writers); a `read` lock takes a
 * plain `BEGIN` (allows concurrent readers). Multiple readers coexist; writers
 * exclude writers.
 */

export type LockType = "read" | "write";

export function withResourceLock<T>(
  db: Database.Database,
  lockType: LockType,
  fn: () => T,
): T {
  db.exec(lockType === "write" ? "BEGIN IMMEDIATE" : "BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Rollback can fail if the connection already errored; the original
      // error is what matters.
    }
    throw error;
  }
}
