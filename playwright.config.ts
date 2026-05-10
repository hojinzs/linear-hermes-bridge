import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const BRIDGE_PORT = 8787;
const WEB_PORT = 5173;

const REPO_ROOT = fileURLToPath(new URL(".", import.meta.url));
// e2e bridge DB lives under the OS temp dir so it never pollutes the repo
const E2E_TMP_DIR = mkdtempSync(join(tmpdir(), "lhb-e2e-"));
const E2E_DB_PATH = join(E2E_TMP_DIR, "bridge.db");

const e2eEnv = {
  PUBLIC_BASE_URL: `http://localhost:${WEB_PORT}`,
  PORT: String(BRIDGE_PORT),
  DATABASE_URL: `file:${E2E_DB_PATH}`,
  ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  APP_SECRET: "test-app-secret-1234567890abcdef",
  LINEAR_LIVE: "false",
  LOG_LEVEL: "error",
};

export default defineConfig({
  testDir: "apps/web/tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @lhb/bridge dev",
      cwd: REPO_ROOT,
      url: `http://127.0.0.1:${BRIDGE_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: e2eEnv,
    },
    {
      command: "pnpm --filter @lhb/web dev",
      cwd: REPO_ROOT,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
