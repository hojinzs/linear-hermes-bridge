import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/bridge.db";
const { db, close } = createDb(databaseUrl);
try {
  migrate(db, { migrationsFolder: join(__dirname, "migrations") });
  // eslint-disable-next-line no-console
  console.log("[migrate] applied migrations from", join(__dirname, "migrations"));
} finally {
  close();
}
