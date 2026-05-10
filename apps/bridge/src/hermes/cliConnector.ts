import { spawn } from "node:child_process";
import type { HermesConnector } from "./connector.js";
import type { HermesRunInput, HermesRunResult } from "./types.js";

export type CliConnectorConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  inheritEnv?: boolean;
  outputFormat?: "text" | "json";
  killSignal?: NodeJS.Signals;
};

type ResolvedConfig = Required<
  Pick<
    CliConnectorConfig,
    "command" | "args" | "timeoutMs" | "inheritEnv" | "outputFormat" | "killSignal"
  >
> &
  Pick<CliConnectorConfig, "cwd" | "env">;

const ALLOWED_KILL_SIGNALS: ReadonlySet<NodeJS.Signals> = new Set([
  "SIGTERM",
  "SIGKILL",
  "SIGINT",
  "SIGHUP",
  "SIGQUIT",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
}

function asConfig(raw: unknown): ResolvedConfig {
  const o = raw as Partial<CliConnectorConfig> | null | undefined;
  if (!o || typeof o.command !== "string" || o.command.length === 0) {
    throw new Error("invalid cli config: command (non-empty string) is required");
  }

  let timeoutMs = 120_000;
  if (o.timeoutMs !== undefined) {
    if (
      typeof o.timeoutMs !== "number" ||
      !Number.isFinite(o.timeoutMs) ||
      !Number.isInteger(o.timeoutMs) ||
      o.timeoutMs <= 0
    ) {
      throw new Error("invalid cli config: timeoutMs must be a positive integer (ms)");
    }
    timeoutMs = o.timeoutMs;
  }

  let env: Record<string, string> | undefined;
  if (o.env !== undefined) {
    if (!isPlainObject(o.env)) {
      throw new Error("invalid cli config: env must be a plain object of string values");
    }
    const validated: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.env)) {
      if (typeof v !== "string") {
        throw new Error(`invalid cli config: env.${k} must be a string (got ${typeof v})`);
      }
      validated[k] = v;
    }
    env = validated;
  }

  let killSignal: NodeJS.Signals = "SIGTERM";
  if (o.killSignal !== undefined) {
    if (
      typeof o.killSignal !== "string" ||
      !ALLOWED_KILL_SIGNALS.has(o.killSignal as NodeJS.Signals)
    ) {
      throw new Error(
        `invalid cli config: killSignal must be one of ${Array.from(ALLOWED_KILL_SIGNALS).join(", ")}`,
      );
    }
    killSignal = o.killSignal;
  }

  return {
    command: o.command,
    args: Array.isArray(o.args) ? o.args.map(String) : [],
    cwd: typeof o.cwd === "string" ? o.cwd : undefined,
    timeoutMs,
    env,
    inheritEnv: o.inheritEnv ?? true,
    outputFormat: o.outputFormat === "json" ? "json" : "text",
    killSignal,
  };
}

const STDERR_TAIL = 400;

export function cliConnector(rawConfig: unknown): HermesConnector {
  const config = asConfig(rawConfig);
  return {
    type: "cli",
    async run(input: HermesRunInput): Promise<HermesRunResult> {
      const env: NodeJS.ProcessEnv = {
        ...(config.inheritEnv ? process.env : {}),
        ...(config.env ?? {}),
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(config.command, config.args, {
          cwd: config.cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e) {
        return { ok: false, error: `spawn failed: ${(e as Error).message}` };
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
      child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

      let timedOut = false;
      let aborted = false;
      let killError: Error | undefined;

      const safeKill = () => {
        try {
          child.kill(config.killSignal);
        } catch (e) {
          killError = e as Error;
        }
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        safeKill();
      }, config.timeoutMs);

      const onAbort = () => {
        aborted = true;
        safeKill();
      };
      input.signal.addEventListener("abort", onAbort, { once: true });

      try {
        if (child.stdin) {
          child.stdin.on("error", () => {
            // Ignore EPIPE from early child exit
          });
          child.stdin.end(input.prompt);
        }
      } catch {
        // best-effort write; swallow and let exit handle the rest
      }

      const exitInfo = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
        spawnError?: Error;
      }>((resolve) => {
        child.once("error", (err) => resolve({ code: null, signal: null, spawnError: err }));
        child.once("close", (code, signal) => resolve({ code, signal }));
      });

      clearTimeout(timeout);
      input.signal.removeEventListener("abort", onAbort);

      if (exitInfo.spawnError) {
        return { ok: false, error: `spawn failed: ${exitInfo.spawnError.message}` };
      }

      if (aborted) {
        return {
          ok: false,
          error: killError ? `aborted (kill failed: ${killError.message})` : "aborted",
        };
      }
      if (timedOut) {
        return {
          ok: false,
          error: killError
            ? `timeout after ${config.timeoutMs}ms (kill failed: ${killError.message})`
            : `timeout after ${config.timeoutMs}ms`,
        };
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");

      if (exitInfo.code !== 0) {
        const tail = stderr.slice(-STDERR_TAIL);
        const codeStr =
          exitInfo.code === null ? `signal ${exitInfo.signal ?? "?"}` : String(exitInfo.code);
        return {
          ok: false,
          error: `cli exit ${codeStr}: ${tail || "(no stderr)"}`,
        };
      }

      let summary: string;
      let events: unknown[] = [];
      if (config.outputFormat === "json") {
        try {
          const parsed = JSON.parse(stdout) as { summary?: unknown; events?: unknown };
          summary = typeof parsed.summary === "string" ? parsed.summary : stdout.trim();
          events = Array.isArray(parsed.events) ? parsed.events : [];
        } catch (e) {
          return { ok: false, error: `cli output not valid JSON: ${(e as Error).message}` };
        }
      } else {
        summary = stdout.trim();
      }

      return {
        ok: true,
        output: { summary, events },
        hermesSessionKey: input.hermesSessionKey ?? "cli_session",
      };
    },
  };
}
