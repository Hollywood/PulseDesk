import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDemoBranch, demoBranchName } from "./branch.js";
import { resetDemo, ResetError } from "./reset.js";

const tempDirs: string[] = [];

function runGit(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ticketdroid-reset-"));
  tempDirs.push(dir);
  runGit(dir, ["init", "-q", "-b", "main"]);
  runGit(dir, ["config", "user.email", "test@example.invalid"]);
  runGit(dir, ["config", "user.name", "Ticketdroid Test"]);
  writeFileSync(path.join(dir, "tracked.ts"), "let v = 1;\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "base"]);
  return dir;
}

function branch(dir: string): string {
  return runGit(dir, ["branch", "--show-current"]).trim();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resetDemo", () => {
  it("returns to main, deletes the demo branch, and removes files the run created", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1038", repo);
    expect(branch(repo)).toBe(demoBranchName("TICKET-1038"));

    // A droid-created untracked file and an uncommitted tracked edit.
    mkdirSync(path.join(repo, "scheduling-api"), { recursive: true });
    writeFileSync(path.join(repo, "scheduling-api", "main.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(repo, "tracked.ts"), "let v = 2;\n", "utf8");

    const clearArtifacts = vi.fn();
    const verify = vi.fn(() => true);
    const result = resetDemo({
      root: repo,
      verifyBuggy: verify,
      readSnapshots: () => [],
      clearArtifacts,
    });

    expect(result.status).toBe("reset");
    expect(result.ticketId).toBe("TICKET-1042");
    expect(branch(repo)).toBe("main");
    expect(existsSync(path.join(repo, "scheduling-api", "main.ts"))).toBe(false);
    expect(readFileSync(path.join(repo, "tracked.ts"), "utf8")).toBe("let v = 1;\n");
    expect(verify).toHaveBeenCalledOnce();
    expect(clearArtifacts).toHaveBeenCalledOnce();
  });

  it("only removes untracked files that were not present before the run", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1029", repo);

    // User file created while the run was in flight; run-created file.
    writeFileSync(path.join(repo, "keep.txt"), "user file\n", "utf8");
    writeFileSync(path.join(repo, "droid-created.txt"), "run file\n", "utf8");

    resetDemo({
      root: repo,
      verifyBuggy: () => true,
      readSnapshots: () => ["keep.txt"],
      clearArtifacts: vi.fn(),
    });

    expect(existsSync(path.join(repo, "keep.txt"))).toBe(true);
    expect(existsSync(path.join(repo, "droid-created.txt"))).toBe(false);
  });

  it("refuses to start a run on a tree with pre-existing untracked files", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "user-scratch.txt"), "user file\n", "utf8");
    expect(() => createLocalDemoBranch("TICKET-1042", repo)).toThrowError(
      expect.objectContaining({ code: "workspace_blocked" }),
    );
  });

  it("is safe to run when no demo branch exists", () => {
    const repo = makeRepo();
    resetDemo({ root: repo, verifyBuggy: () => true, readSnapshots: () => [], clearArtifacts: vi.fn() });
    expect(branch(repo)).toBe("main");
  });

  it("reports reset_branch_failed when on a foreign branch", () => {
    const repo = makeRepo();
    runGit(repo, ["switch", "-c", "someone-elses-branch"]);
    expect(() =>
      resetDemo({ root: repo, verifyBuggy: () => true, readSnapshots: () => [], clearArtifacts: vi.fn() }),
    ).toThrowError(expect.objectContaining({ code: "reset_branch_failed" }));
  });

  it("rejects when the workspace is not verified back to the planted state", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1042", repo);
    expect(() =>
      resetDemo({ root: repo, verifyBuggy: () => false, readSnapshots: () => [], clearArtifacts: vi.fn() }),
    ).toThrowError(ResetError);
  });
});
