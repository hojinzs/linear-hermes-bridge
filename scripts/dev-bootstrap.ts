#!/usr/bin/env node
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const envPath = resolve(repoRoot, ".env");
const envExamplePath = resolve(repoRoot, ".env.example");
const dataDir = resolve(repoRoot, "data");

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] ${msg}`);
}

if (!existsSync(envExamplePath)) {
  console.error("[bootstrap] .env.example missing — abort");
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(envExamplePath, envPath);
  log(".env created from .env.example");
}

let env = readFileSync(envPath, "utf8");
function ensureKey(key: string, generator: () => string): void {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = env.match(re);
  const empty = !m || (m[1] ?? "").trim() === "";
  if (empty) {
    const value = generator();
    if (m) env = env.replace(re, `${key}=${value}`);
    else env = `${env.trimEnd()}\n${key}=${value}\n`;
    log(`generated dev ${key} (saved to .env)`);
  }
}

ensureKey("ENCRYPTION_KEY", () => randomBytes(32).toString("base64"));
ensureKey("APP_SECRET", () => randomBytes(24).toString("hex"));
writeFileSync(envPath, env);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  log(`created ${dataDir}`);
}

log("running migrations…");
execSync("pnpm --filter @lhb/bridge run db:migrate", { stdio: "inherit", cwd: repoRoot });
log("migrations applied");
