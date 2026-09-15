import { rmSync } from "node:fs";
import path from "node:path";
import { activeStrategyPath } from "../gate/run-tests.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { listIgnoredFiles, listUntrackedFiles } from "../run/factory.js";
import { clearRunArtifacts, readUntrackedSnapshots } from "../run/store.js";
import { LocalBranchError, REPOSITORY_ROOT, resetLocalDemoBranch } from "./branch.js";

export interface DemoResetResult {
  status: "reset";
  ticketId: "TICKET-1042";
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

export interface ResetDemoOptions {
  /** Repository root to restore. Defaults to the real Ticketdroid root. */
  root?: string;
  /** Verifies the workspace is back to the planted state. Defaults to the real gate check. */
  verifyBuggy?: () => boolean;
  /** Reads file lists that existed before any run (injectable for tests). */
  readSnapshots?: () => Array<{ files: string[]; ignored: string[]; legacy?: boolean }>;
  /** Removes recorded run artifacts (injectable for tests). */
  clearArtifacts?: () => void;
}

function resetBranch(root: string): void {
  try {
    resetLocalDemoBranch(root);
  } catch (error) {
    if (error instanceof LocalBranchError) {
      throw new ResetError("reset_branch_failed", "Demo reset could not return the workspace to main.");
    }
    throw error;
  }
}

function removeNewOtherFiles(root: string, before: Set<string>): void {
  const after = [...listUntrackedFiles(root), ...listIgnoredFiles(root)];
  const removed: string[] = [];
  for (const file of after) {
    if (before.has(file)) {
      continue;
    }
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new ResetError("reset_blocked", "Demo reset is blocked by an untrusted cleanup path.");
    }
    rmSync(resolved, { force: true });
    removed.push(file);
  }
  // Prune directories the run left behind (empty only; never recursive).
  const dirs = [...new Set(removed.map((file) => path.dirname(file)))].sort(
    (a, b) => b.split("/").length - a.split("/").length,
  );
  for (const dir of dirs) {
    try {
      rmSync(path.resolve(root, dir), { recursive: false, force: false });
    } catch {
      // Not empty or not removable; leave it.
    }
  }
}

/**
 * Restores the pre-run state entirely through git: returns to main, deletes
 * every Ticketdroid demo branch, removes exactly the untracked files a droid
 * run created (never pre-existing user files), drops all recorded run
 * artifacts, and verifies the planted bug is back on main. Runs never touch
 * main directly, so main always holds the planted state after reset.
 */
export function resetDemo(options: ResetDemoOptions = {}): DemoResetResult {
  const root = options.root ?? REPOSITORY_ROOT;
  const verifyBuggy = options.verifyBuggy ?? (() => resolveWorkspaceState(activeStrategyPath()) === "buggy");
  const readSnapshots =
    options.readSnapshots ?? (() => readUntrackedSnapshots().map(({ files, ignored, legacy }) => ({ files, ignored, legacy })));
  const clearArtifacts = options.clearArtifacts ?? clearRunArtifacts;

  const snapshots = readSnapshots();
  // File cleanup is only safe when every manifest comes from a real run with
  // the full untracked+ignored capture. Legacy or malformed manifests cannot
  // prove which files pre-existed, so deleting by difference is unsafe (it
  // could remove pre-existing ignored files such as node_modules).
  const resolvable = snapshots.length > 0 && snapshots.every((snapshot) => !snapshot.legacy);
  const before = new Set(snapshots.flatMap((snapshot) => [...snapshot.files, ...snapshot.ignored]));

  resetBranch(root);

  if (resolvable) {
    removeNewOtherFiles(root, before);
  }

  clearArtifacts();

  if (!verifyBuggy()) {
    throw new ResetError(
      "reset_verification_failed",
      "Demo reset could not verify the planted-bug workspace after restoration.",
    );
  }

  return {
    status: "reset",
    ticketId: "TICKET-1042",
    detail: "Demo reset complete: restored the TICKET-1042 planted bug on main and removed the run branch and artifacts.",
  };
}
