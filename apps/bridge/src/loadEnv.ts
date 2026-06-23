import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the repo-root `.env` into `process.env` for local dev runs.
 *
 * `pnpm dev` starts the bridge with cwd = `apps/bridge`, so it cannot rely on
 * the shell having exported the dev secrets that `scripts/dev-bootstrap.ts`
 * writes to the repo-root `.env`. This mirrors the loader already present in
 * `scripts/dev-seed.ts` so the bridge and the seed script agree on the same
 * configuration.
 *
 * Existing `process.env` values always win, so Docker / CI (which inject env
 * directly and ship no `.env` file) are unaffected.
 */
export function loadEnvFromRepoRoot(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}
