import { execFileSync } from "node:child_process";
import { RunError } from "./types.js";

function listFiles(root: string, args: string[]): string[] {
  try {
    const output = execFileSync("git", ["ls-files", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.split("\0").filter(Boolean);
  } catch {
    throw new RunError("workspace_read_failed", "Could not read the workspace files from git.");
  }
}

/** Non-ignored untracked files in the working tree, NUL-safe. */
export function listUntrackedFiles(root: string): string[] {
  return listFiles(root, ["--others", "--exclude-standard", "-z"]);
}

/** Gitignored files in the working tree (for example node_modules), NUL-safe. */
export function listIgnoredFiles(root: string): string[] {
  return listFiles(root, ["--others", "--ignored", "--exclude-standard", "-z"]);
}

/** Files git tracks in the current index, NUL-safe. */
export function listTrackedFiles(root: string): string[] {
  return listFiles(root, ["--cached", "-z"]);
}
