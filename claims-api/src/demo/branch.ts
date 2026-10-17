import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEMO_BRANCH_PREFIX = "pulsedesk/";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export class LocalBranchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalBranchError";
  }
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new LocalBranchError("branch_operation_failed", "The local demo branch operation failed.");
  }
}

export function demoBranchName(ticketId: string): string {
  return `${DEMO_BRANCH_PREFIX}${ticketId}`;
}

function isDemoBranch(name: string): boolean {
  return name.startsWith(DEMO_BRANCH_PREFIX);
}

function demoBranches(root: string): string[] {
  return git(root, ["branch", "--list", `${DEMO_BRANCH_PREFIX}*`])
    .split("\n")
    .map((line) => line.trim().replace(/^\*\s*/, ""))
    .filter(isDemoBranch);
}

function currentBranch(root: string): string {
  return git(root, ["branch", "--show-current"]).trim();
}

/**
 * Creates a per-ticket allowlisted local demo branch (`pulsedesk/<TICKET-ID>`)
 * without contacting a remote. Refuses when the working tree is not clean, so
 * the run never starts on top of uncommitted user work and reset can always
 * restore main safely.
 */
export function createLocalDemoBranch(ticketId: string, root: string = REPOSITORY_ROOT): string {
  if (currentBranch(root) !== "main") {
    throw new LocalBranchError(
      "branch_base_required",
      "The demo run must start from the local main branch.",
    );
  }
  if (git(root, ["status", "--porcelain"]).trim() !== "") {
    throw new LocalBranchError(
      "workspace_blocked",
      "The workspace has local edits; commit or stash them before a demo run.",
    );
  }
  if (demoBranches(root).length > 0) {
    throw new LocalBranchError(
      "branch_exists",
      "A local demo branch already exists; reset the demo before starting another run.",
    );
  }
  const name = demoBranchName(ticketId);
  git(root, ["switch", "-c", name]);
  return name;
}

/**
 * Returns the local checkout to main and removes every PulseDesk demo branch,
 * discarding any uncommitted run edits left on those branches. It never pushes,
 * deletes a remote branch, or touches another local branch.
 */
export function resetLocalDemoBranch(root: string = REPOSITORY_ROOT): void {
  const branch = currentBranch(root);
  if (branch !== "main" && !isDemoBranch(branch)) {
    throw new LocalBranchError(
      "branch_reset_blocked",
      "The demo reset can only clean the PulseDesk demo branch.",
    );
  }

  if (branch !== "main") {
    git(root, ["switch", "-f", "main"]);
  }
  for (const name of demoBranches(root)) {
    git(root, ["branch", "-D", name]);
  }
}
