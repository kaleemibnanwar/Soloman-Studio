import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

describe("fresh database migrations", () => {
  let tempDirectory: string | null = null;

  afterEach(() => {
    if (tempDirectory) {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
      tempDirectory = null;
    }
  });

  it("creates the core schema from an empty database", () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "soloman-fresh-db-"));
    const databasePath = path.join(tempDirectory, "soloman.db");
    const sqlite = new Database(databasePath);

    try {
      const database = drizzle(sqlite);
      migrate(database, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });

      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toEqual(
        expect.arrayContaining(["apps", "chats", "messages", "chat_search_dirty_chats"]),
      );
    } finally {
      sqlite.close();
    }
  });
});
