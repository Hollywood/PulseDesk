import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RunError, type DiffResult } from "./types.js";

/**
 * Produces a genuine unified diff between the planted baseline and the applied
 * patch using git itself. A throwaway repo is created under the OS temp dir:
 * the baseline blob is staged with plumbing commands, then `git diff` reports
 * the working-tree patch. No repository elsewhere is touched, no commit is
 * created, and no author identity is needed. The repo is removed afterwards.
 */
export function computeRealDiff(
  baselineContent: string,
  patchedContent: string,
  repoRelativePath: string,
): DiffResult {
  const root = mkdtempSync(path.join(tmpdir(), "pulsedesk-diff-"));
  try {
    const file = path.join(root, repoRelativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, baselineContent, "utf8");

    runGit(["init", "-q"], root);
    const hash = runGit(["hash-object", "-w", repoRelativePath], root).stdout.trim();
    if (hash.length !== 40) {
      throw new RunError("diff_failed", "Could not snapshot the patch baseline.");
    }
    runGit(["update-index", "--add", "--cacheinfo", `100644,${hash},${repoRelativePath}`], root);

    writeFileSync(file, patchedContent, "utf8");
    const diff = runGit(["diff", "--no-color", "--", repoRelativePath], root).stdout;

    return {
      path: repoRelativePath,
      text: diff.trimEnd(),
      added: countHunkLines(diff, "+"),
      removed: countHunkLines(diff, "-"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runGit(args: string[], cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new RunError(
      "diff_failed",
      "Could not compute the patch diff from the workspace sources.",
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

/** Counts added (+) or removed (-) content lines, ignoring hunk/header lines. */
function countHunkLines(text: string, marker: "+" | "-"): number {
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(marker) && !line.startsWith(`${marker}${marker}`)) {
      count += 1;
    }
  }
  return count;
}
