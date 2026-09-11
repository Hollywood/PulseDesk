import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { activeStrategyPath } from "../gate/run-tests.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { resetLocalDemoBranch, LocalBranchError } from "./branch.js";
import { baselineSnapshotPath, runArtifactPath } from "../run/store.js";

const DEMO_TICKET_ID = "TICKET-1042";
const BUGGY_BINDING = /ACTIVE_STRATEGY\s*(?::[^=]+)?=\s*perAttemptStrategy\b/;
const PATCHED_BINDING = /ACTIVE_STRATEGY\s*(?::[^=]+)?=\s*stableClaimStrategy\b/;

export interface DemoResetResult {
  status: "reset";
  ticketId: typeof DEMO_TICKET_ID;
  detail: string;
}

export class ResetError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResetError";
  }
}

function sourceIsBuggy(source: string): boolean {
  return BUGGY_BINDING.test(source) && !PATCHED_BINDING.test(source);
}

function sourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function resetBranch(): void {
  try {
    resetLocalDemoBranch();
  } catch (error) {
    if (error instanceof LocalBranchError) {
      throw new ResetError("reset_branch_failed", "Demo reset could not return the workspace to main.");
    }
    throw error;
  }
}

/**
 * Restores the pre-run state using only the baseline snapshot created by the
 * run orchestrator and removes the generated run artifacts for TICKET-1042.
 * It refuses dirty or unknown workspaces rather than overwriting user edits.
 */
export function resetDemo(): DemoResetResult {
  const activePath = activeStrategyPath();
  const artifactPath = runArtifactPath(DEMO_TICKET_ID);
  const snapshotPath = baselineSnapshotPath(DEMO_TICKET_ID);
  const workspace = resolveWorkspaceState(activePath);

  if (workspace === "buggy") {
    rmSync(artifactPath, { force: true });
    rmSync(snapshotPath, { force: true });
    resetBranch();
    return {
      status: "reset",
      ticketId: DEMO_TICKET_ID,
      detail: "Planted TICKET-1042 bug restored; local demo branch removed and main checked out.",
    };
  }

  if (workspace !== "patched") {
    throw new ResetError(
      "reset_blocked",
      "Demo reset is blocked because the workspace has unexpected local edits.",
    );
  }

  if (!existsSync(snapshotPath)) {
    throw new ResetError(
      "reset_unavailable",
      "Demo reset is unavailable because the pre-run baseline was not recorded.",
    );
  }

  const baseline = readFileSync(snapshotPath, "utf8");
  if (!sourceIsBuggy(baseline)) {
    throw new ResetError(
      "reset_baseline_invalid",
      "Demo reset is blocked because the recorded baseline is not the planted bug.",
    );
  }

  const expectedHash = sourceHash(baseline);
  writeFileSync(activePath, baseline, "utf8");
  const restored = readFileSync(activePath, "utf8");
  if (sourceHash(restored) !== expectedHash || resolveWorkspaceState(activePath) !== "buggy") {
    throw new ResetError(
      "reset_verification_failed",
      "Demo reset could not verify the planted-bug source after restoration.",
    );
  }

  rmSync(artifactPath, { force: true });
  rmSync(snapshotPath, { force: true });
  resetBranch();
  return {
    status: "reset",
    ticketId: DEMO_TICKET_ID,
    detail: "Planted TICKET-1042 bug restored; local demo branch removed and main checked out.",
  };
}
