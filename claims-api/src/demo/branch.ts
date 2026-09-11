import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEMO_BRANCH_NAME = "ticketdroid/TICKET-1042";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export class LocalBranchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalBranchError";
  }
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new LocalBranchError("branch_operation_failed", "The local demo branch operation failed.");
  }
}

function currentBranch(): string {
  return git(["branch", "--show-current"]).trim();
}

function branchExists(): boolean {
  return git(["branch", "--list", DEMO_BRANCH_NAME]).trim().length > 0;
}

/** Creates the allowlisted local demo branch without contacting a remote. */
export function createLocalDemoBranch(): string {
  if (currentBranch() !== "main") {
    throw new LocalBranchError(
      "branch_base_required",
      "The demo run must start from the local main branch.",
    );
  }
  if (branchExists()) {
    throw new LocalBranchError(
      "branch_exists",
      "The local demo branch already exists; reset the demo before starting another run.",
    );
  }
  git(["switch", "-c", DEMO_BRANCH_NAME]);
  return DEMO_BRANCH_NAME;
}

/**
 * Returns the local checkout to main and removes only the allowlisted branch
 * created by Ticketdroid. It never pushes, deletes a remote branch, or touches
 * another local branch.
 */
export function resetLocalDemoBranch(): void {
  const branch = currentBranch();
  if (branch !== "main" && branch !== DEMO_BRANCH_NAME) {
    throw new LocalBranchError(
      "branch_reset_blocked",
      "The demo reset can only clean the Ticketdroid demo branch.",
    );
  }

  const exists = branchExists();
  if (branch === DEMO_BRANCH_NAME) {
    git(["switch", "main"]);
  }
  if (exists) {
    git(["branch", "-D", DEMO_BRANCH_NAME]);
  }
}
