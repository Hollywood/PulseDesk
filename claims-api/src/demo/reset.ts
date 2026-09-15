import { type Dirent, readdirSync, rmdirSync, rmSync } from "node:fs";
import path from "node:path";
import { activeStrategyPath } from "../gate/run-tests.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { listIgnoredFiles, listTrackedFiles, listUntrackedFiles } from "../run/factory.js";
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

function topLevelOf(file: string): string {
  const [first = file] = file.split("/");
  return first;
}

interface BeforeState {
  /** Untracked (non-ignored) files present before the run. */
  files: Set<string>;
  /** Top-level entries that already existed before the run. */
  topLevel: Set<string>;
}

function removeNewOtherFiles(root: string, before: BeforeState): void {
  const removed: string[] = [];
  const remove = (file: string): void => {
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new ResetError("reset_blocked", "Demo reset is blocked by an untrusted cleanup path.");
    }
    rmSync(resolved, { force: true });
    removed.push(file);
  };

  // Untracked files: the run starts on a clean tree, so anything untracked that
  // the manifest did not record is the run's own output.
  for (const file of listUntrackedFiles(root)) {
    if (!before.files.has(file)) {
      remove(file);
    }
  }

  // Ignored files: only clean inside top-level entries the run created (a new
  // service directory and its node_modules). git's ignored listing is not a
  // faithful superset of what lives under a pre-existing node_modules, so
  // deleting ignored files by difference would corrupt the shared pnpm store.
  for (const file of listIgnoredFiles(root)) {
    if (!before.topLevel.has(topLevelOf(file))) {
      remove(file);
    }
  }
  // Prune every now-empty directory upward from each removed file; git ignores
  // empty directories so they would otherwise survive. rmdirSync only removes
  // empty directories (ENOTEMPTY otherwise), so pre-existing user files inside
  // any of these directories keep them alive.
  for (const file of removed) {
    let dir = path.dirname(file);
    while (dir.length > 1 && dir !== path.sep) {
      try {
        rmdirSync(path.resolve(root, dir));
      } catch {
        break; // Not empty or gone; stop climbing.
      }
      dir = path.dirname(dir);
    }
  }

  // Tooling such as vitest leaves empty cache directories behind, and git never
  // reports an empty directory, so the passes above cannot see them. Sweep them
  // out of the top-level entries the run created; nothing else is touched.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !before.topLevel.has(entry.name)) {
      pruneEmptyDirs(path.join(root, entry.name));
    }
  }
}

/** Removes `dir` and its descendants when they hold no files. Returns true when removed. */
function pruneEmptyDirs(dir: string): boolean {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    if (entry.isDirectory() && !pruneEmptyDirs(path.join(dir, entry.name))) {
      empty = false;
    } else if (!entry.isDirectory()) {
      empty = false;
    }
  }
  if (!empty) {
    return false;
  }
  try {
    rmdirSync(dir);
    return true;
  } catch {
    return false;
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
  // prove which top-level entries pre-existed, so cleaning by difference could
  // remove a directory the run never created.
  const resolvable = snapshots.length > 0 && snapshots.every((snapshot) => !snapshot.legacy);

  resetBranch(root);

  // Read tracked paths only once main is checked out: on the demo branch the
  // run's own new service is tracked, which would make cleanup skip it.
  const before: BeforeState = {
    files: new Set(snapshots.flatMap((snapshot) => snapshot.files)),
    topLevel: new Set([
      ".git",
      ...snapshots.flatMap((snapshot) => [...snapshot.files, ...snapshot.ignored].map(topLevelOf)),
      ...listTrackedFiles(root).map(topLevelOf),
    ]),
  };

  if (resolvable) {
    try {
      removeNewOtherFiles(root, before);
    } catch (error) {
      if (error instanceof ResetError) {
        throw error;
      }
      throw new ResetError(
        "reset_failed",
        "Demo reset could not remove the files created by the run.",
      );
    }
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
