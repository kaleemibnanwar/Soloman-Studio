import type { Config } from "drizzle-kit";
import path from "path";

const devUserDataDir = (
  process.env.SOLOMAN_DEV_USER_DATA_DIR || process.env.OCTOPUS_STUDIO_DEV_USER_DATA_DIR
)?.trim();
const userDataPath = devUserDataDir ? path.resolve(devUserDataDir) : path.resolve("./userData");
const dbPath = path.join(userDataPath, "sqlite.db");

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
