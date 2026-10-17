import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GateRunResult } from "./certify.js";
import { parseVitestReport } from "./report.js";

const require = createRequire(import.meta.url);

function resolveVitestEntry(): string {
  const pkgPath = require.resolve("vitest/package.json");
  return path.join(path.dirname(pkgPath), "vitest.mjs");
}

export interface RunTestsOptions {
  cwd: string;
  timeoutMs: number;
}

/**
 * Runs the raw claims suite in a fresh child process with the JSON reporter,
 * bounded by a timeout, and returns a normalized result. Uses argument-array
 * execution only; no shell string interpolation.
 */
export async function runRawClaimsTests(options: RunTestsOptions): Promise<GateRunResult> {
  const reportDir = mkdtempSync(path.join(tmpdir(), "pulsedesk-gate-"));
  const reportFile = path.join(reportDir, "vitest-report.json");
  const vitestEntry = resolveVitestEntry();

  const cleanup = (): void => {
    try {
      rmSync(reportDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  };

  return new Promise<GateRunResult>((resolve) => {
    let settled = false;
    let timedOut = false;

    const child = spawn(
      process.execPath,
      [vitestEntry, "run", "--reporter=json", `--outputFile=${reportFile}`],
      { cwd: options.cwd, stdio: ["ignore", "ignore", "ignore"] },
    );

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    const finish = (result: GateRunResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    child.on("error", () => {
      finish({
        spawn: "spawn_error",
        timedOut: false,
        signal: null,
        exitCode: null,
        report: null,
        reportError: "missing",
      });
    });

    child.on("close", (code, signal) => {
      if (timedOut) {
        finish({
          spawn: "ok",
          timedOut: true,
          signal: signal ?? null,
          exitCode: code,
          report: null,
          reportError: "missing",
        });
        return;
      }
      if (signal) {
        finish({
          spawn: "ok",
          timedOut: false,
          signal,
          exitCode: code,
          report: null,
          reportError: "missing",
        });
        return;
      }

      if (!existsSync(reportFile)) {
        finish({
          spawn: "ok",
          timedOut: false,
          signal: null,
          exitCode: code,
          report: null,
          reportError: "missing",
        });
        return;
      }

      const raw = readFileSync(reportFile, "utf8");
      const parsed = parseVitestReport(raw);
      finish({
        spawn: "ok",
        timedOut: false,
        signal: null,
        exitCode: code,
        report: parsed.report,
        reportError: parsed.error,
      });
    });
  });
}

export function claimsApiRoot(): string {
  return fileURLToPath(new URL("../..", import.meta.url));
}

export function activeStrategyPath(): string {
  return fileURLToPath(new URL("../domain/active-strategy.ts", import.meta.url));
}
