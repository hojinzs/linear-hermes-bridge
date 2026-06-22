import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

// Resolve a relative `file:` DATABASE_URL against the repo root rather than the
// process cwd. `pnpm dev` runs the bridge with cwd = apps/bridge while
// scripts/dev-seed runs with cwd = repo root; without this they would open two
// different SQLite files. Absolute paths (Docker uses file:/app/data/...) and
// the in-memory database (":memory:") are left untouched.
function resolveDbPath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  if (raw === ":memory:" || isAbsolute(raw)) return raw;
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  return resolve(repoRoot, raw);
}

export function createDb(databaseUrl: string): { db: DbClient; close: () => void } {
  const path = resolveDbPath(databaseUrl);
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, close: () => sqlite.close() };
}

export { schema };
