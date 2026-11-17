// db.ts
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import { getUserDataPath } from "../paths/paths";
import log from "electron-log";

const logger = log.scope("db");

// Database connection factory
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the database path based on the current environment.
 * Uses `soloman.db`, automatically migrating from legacy `sqlite.db` or `database.sqlite`
 * if found in the userData directory.
 */
export function getDatabasePath(): string {
  const userData = getUserDataPath();
  const primaryDbPath = path.join(userData, "soloman.db");
  const legacySqliteDbPath = path.join(userData, "sqlite.db");
  const legacyDatabaseSqlitePath = path.join(userData, "database.sqlite");

  // If primary db already exists, return it
  if (fs.existsSync(primaryDbPath)) {
    return primaryDbPath;
  }

  // Check if legacy sqlite.db exists and migrate it
  const legacyToMigrate = fs.existsSync(legacySqliteDbPath)
    ? legacySqliteDbPath
    : fs.existsSync(legacyDatabaseSqlitePath)
      ? legacyDatabaseSqlitePath
      : null;

  if (legacyToMigrate) {
    try {
      logger.info(`Migrating legacy database from ${legacyToMigrate} to ${primaryDbPath}`);
      fs.copyFileSync(legacyToMigrate, primaryDbPath);

      // Also copy WAL and SHM if present
      for (const ext of ["-wal", "-shm"]) {
        const legacyAux = `${legacyToMigrate}${ext}`;
        const newAux = `${primaryDbPath}${ext}`;
        if (fs.existsSync(legacyAux)) {
          fs.copyFileSync(legacyAux, newAux);
        }
      }
      return primaryDbPath;
    } catch (err) {
      logger.warn("Failed to copy legacy database file, falling back to legacy path:", err);
      return legacyToMigrate;
    }
  }

  return primaryDbPath;
}

export function getDatabaseFilePaths(): string[] {
  const dbPath = getDatabasePath();
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

/**
 * Initialize the database connection
 */
export function initializeDatabase(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (_db) return _db as any;

  const dbPath = getDatabasePath();
  logger.log("Initializing database at:", dbPath);

  // Check if the database file exists and remove it if it has issues
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      if (stats.size < 100) {
        logger.log("Database file exists but may be corrupted. Removing it...");
        fs.unlinkSync(dbPath);
      }
    }
  } catch (error) {
    logger.error("Error checking database file:", error);
  }

  fs.mkdirSync(getUserDataPath(), { recursive: true });

  const sqlite = new Database(dbPath, { timeout: 10000 });
  sqlite.pragma("foreign_keys = ON");

  try {
    sqlite.pragma("journal_mode = WAL");
  } catch (error) {
    logger.warn("Could not enable WAL mode, falling back to default journal mode:", error);
  }

  _db = drizzle(sqlite, { schema });

  try {
    const migrationsFolder = path.join(__dirname, "..", "..", "drizzle");
    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found: ${migrationsFolder}`);
    }
    logger.log("Running migrations from:", migrationsFolder);
    migrate(_db, { migrationsFolder });
  } catch (error) {
    logger.error("Migration error:", error);
    _db = null;
    sqlite.close();
    throw error;
  }

  return _db as any;
}

export function closeDatabase(): void {
  if (!_db) {
    return;
  }

  const database = _db as BetterSQLite3Database<typeof schema> & {
    $client: Database.Database;
  };
  _db = null;
  database.$client.close();
}

/**
 * Replaces the database instance resolved by the `db` proxy. Test-only seam
 * so unit tests can point handlers at an in-memory database (see
 * `src/testing/test_db.ts`). Pass null to clear the override.
 */
export function setDatabaseForTesting(
  database: (BetterSQLite3Database<typeof schema> & { $client: Database.Database }) | null,
): void {
  _db = database;
}

/**
 * Get the database instance (throws if not initialized)
 */
export function getDb(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  if (!_db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return _db as any;
}

export const db = new Proxy({} as any, {
  get(target, prop) {
    const database = getDb();
    return database[prop as keyof typeof database];
  },
}) as BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};
