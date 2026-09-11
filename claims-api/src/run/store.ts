import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { TicketRunResult } from "./types.js";

export function runsDirectory(): string {
  return fileURLToPath(new URL("../../artifacts/runs", import.meta.url));
}

export function runArtifactPath(ticketId: string): string {
  return path.join(runsDirectory(), `${ticketId}.json`);
}

export function baselineSnapshotPath(ticketId: string): string {
  return path.join(runsDirectory(), `${ticketId}.active-strategy.baseline.ts`);
}

/** Persists the completed run artifact and the pre-patch baseline snapshot. */
export function writeRunArtifact(ticketId: string, result: TicketRunResult): void {
  mkdirSync(runsDirectory(), { recursive: true });
  writeFileSync(runArtifactPath(ticketId), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export function writeBaselineSnapshot(ticketId: string, baseline: string): void {
  mkdirSync(runsDirectory(), { recursive: true });
  writeFileSync(baselineSnapshotPath(ticketId), baseline, "utf8");
}

/** Reads a recorded run, or null when none exists yet. Malformed files are treated as missing. */
export function readRunArtifact(ticketId: string): TicketRunResult | null {
  const file = runArtifactPath(ticketId);
  if (!existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as TicketRunResult;
  } catch {
    return null;
  }
}
