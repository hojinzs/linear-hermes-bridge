import { defineConfig, devices } from "@playwright/test";

const BRIDGE_PORT = 8787;
const WEB_PORT = 5173;

const e2eEnv = {
  PUBLIC_BASE_URL: `http://localhost:${WEB_PORT}`,
  PORT: String(BRIDGE_PORT),
  DATABASE_URL: "file:./.evidences/_e2e/bridge.db",
  ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  APP_SECRET: "test-app-secret-1234567890abcdef",
  LINEAR_LIVE: "false",
  LOG_LEVEL: "error",
};

export default defineConfig({
  testDir: ".evidences",
  testMatch: "**/playwright/**/*.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".evidences/_playwright-report", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `rm -rf .evidences/_e2e && mkdir -p .evidences/_e2e && pnpm --filter @lhb/bridge dev`,
      url: `http://127.0.0.1:${BRIDGE_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: e2eEnv,
    },
    {
      command: `pnpm --filter @lhb/web dev`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
