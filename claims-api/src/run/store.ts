import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

export function untrackedSnapshotPath(ticketId: string): string {
  return path.join(runsDirectory(), `${ticketId}.untracked-before.json`);
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

/**
 * Records which non-ignored untracked files existed before a run started, so
 * demo reset can later remove exactly the files a droid run created without
 * touching pre-existing user files.
 */
export function writeUntrackedSnapshot(ticketId: string, files: string[]): void {
  mkdirSync(runsDirectory(), { recursive: true });
  writeFileSync(untrackedSnapshotPath(ticketId), `${JSON.stringify({ files }, null, 2)}\n`, "utf8");
}

export interface UntrackedSnapshot {
  ticketId: string;
  files: string[];
}

/** Reads every recorded pre-run untracked manifest. Malformed files yield an empty manifest. */
export function readUntrackedSnapshots(): UntrackedSnapshot[] {
  const dir = runsDirectory();
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".untracked-before.json"))
    .map((entry) => {
      const ticketId = entry.replace(/\.untracked-before\.json$/, "");
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, entry), "utf8")) as { files?: unknown };
        const files = Array.isArray(parsed.files) ? parsed.files.filter((x): x is string => typeof x === "string") : [];
        return { ticketId, files };
      } catch {
        return { ticketId, files: [] };
      }
    });
}

/** Removes every Ticketdroid run artifact (runs directory is Ticketdroid-owned). */
export function clearRunArtifacts(): void {
  const dir = runsDirectory();
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    rmSync(path.join(dir, entry), { force: true });
  }
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
