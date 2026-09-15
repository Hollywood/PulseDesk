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

/** Repo with a tracked file, a .gitignore, and one pre-existing ignored file. */
function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ticketdroid-reset-"));
  tempDirs.push(dir);
  runGit(dir, ["init", "-q", "-b", "main"]);
  runGit(dir, ["config", "user.email", "test@example.invalid"]);
  runGit(dir, ["config", "user.name", "Ticketdroid Test"]);
  writeFileSync(path.join(dir, "tracked.ts"), "let v = 1;\n", "utf8");
  writeFileSync(path.join(dir, ".gitignore"), "pre.txt\nignored-out.txt\nnode_modules/\n", "utf8");
  writeFileSync(path.join(dir, "pre.txt"), "pre-existing ignored\n", "utf8");
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
  it("returns to main, deletes the demo branch, and removes tracked/untracked/ignored run files", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1038", repo);
    expect(branch(repo)).toBe(demoBranchName("TICKET-1038"));

    // The droid's work: an untracked service file, an ignored build output,
    // an ignored nested cache under a fresh node_modules, and an uncommitted
    // tracked edit.
    mkdirSync(path.join(repo, "scheduling-api", "node_modules", ".vite", "vitest"), { recursive: true });
    writeFileSync(path.join(repo, "scheduling-api", "main.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(repo, "scheduling-api", "node_modules", ".vite", "vitest", "cache"), "", "utf8");
    writeFileSync(path.join(repo, "ignored-out.txt"), "build output\n", "utf8");
    writeFileSync(path.join(repo, "tracked.ts"), "let v = 2;\n", "utf8");

    const clearArtifacts = vi.fn();
    const verify = vi.fn(() => true);
    const result = resetDemo({
      root: repo,
      verifyBuggy: verify,
      readSnapshots: () => [{ files: [], ignored: ["pre.txt"] }],
      clearArtifacts,
    });

    expect(result.status).toBe("reset");
    expect(result.ticketId).toBe("TICKET-1042");
    expect(branch(repo)).toBe("main");
    expect(existsSync(path.join(repo, "scheduling-api"))).toBe(false);
    expect(existsSync(path.join(repo, "ignored-out.txt"))).toBe(false);
    expect(readFileSync(path.join(repo, "tracked.ts"), "utf8")).toBe("let v = 1;\n");
    // Pre-existing ignored user file survives.
    expect(existsSync(path.join(repo, "pre.txt"))).toBe(true);
    expect(verify).toHaveBeenCalledOnce();
    expect(clearArtifacts).toHaveBeenCalledOnce();
  });

  it("removes a service the run committed on the demo branch, including its ignored leftovers", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1038", repo);

    // The droid commits the new service on the demo branch, then its test run
    // leaves an ignored cache file and an empty cache directory behind.
    mkdirSync(path.join(repo, "scheduling-api", "src"), { recursive: true });
    writeFileSync(path.join(repo, "scheduling-api", "src", "scheduler.ts"), "export {};\n", "utf8");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "fix: deduplicate reschedules"]);
    mkdirSync(path.join(repo, "scheduling-api", "node_modules", ".vite", "vitest", "run"), { recursive: true });
    writeFileSync(path.join(repo, "scheduling-api", "node_modules", ".vite", "vitest", "results.json"), "{}\n", "utf8");
    mkdirSync(path.join(repo, "scheduling-api", "node_modules", ".cache"), { recursive: true });

    resetDemo({
      root: repo,
      verifyBuggy: () => true,
      readSnapshots: () => [{ files: [], ignored: ["pre.txt"] }],
      clearArtifacts: vi.fn(),
    });

    expect(branch(repo)).toBe("main");
    expect(existsSync(path.join(repo, "scheduling-api"))).toBe(false);
  });

  it("never deletes ignored files inside a top-level directory that pre-dates the run", () => {
    const repo = makeRepo();
    // A shared dependency store the run did not create. git's ignored listing
    // is not a faithful superset of its contents, so difference-based cleanup
    // must not reach inside it.
    mkdirSync(path.join(repo, "node_modules", ".pnpm", "vitest", "dist"), { recursive: true });
    writeFileSync(path.join(repo, "node_modules", ".pnpm", "vitest", "package.json"), "{}\n", "utf8");
    writeFileSync(path.join(repo, "node_modules", ".pnpm", "vitest", "dist", "index.js"), "", "utf8");
    createLocalDemoBranch("TICKET-1038", repo);

    resetDemo({
      root: repo,
      verifyBuggy: () => true,
      // The manifest only proves node_modules existed, not each file in it.
      readSnapshots: () => [{ files: [], ignored: ["node_modules/.pnpm/vitest/package.json", "pre.txt"] }],
      clearArtifacts: vi.fn(),
    });

    expect(existsSync(path.join(repo, "node_modules", ".pnpm", "vitest", "dist", "index.js"))).toBe(true);
    expect(existsSync(path.join(repo, "node_modules", ".pnpm", "vitest", "package.json"))).toBe(true);
  });

  it("only removes files that were not present before the run", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1029", repo);

    // User file created while the run was in flight; run-created file.
    writeFileSync(path.join(repo, "keep.txt"), "user file\n", "utf8");
    writeFileSync(path.join(repo, "droid-created.txt"), "run file\n", "utf8");

    resetDemo({
      root: repo,
      verifyBuggy: () => true,
      readSnapshots: () => [{ files: ["keep.txt"], ignored: ["pre.txt"] }],
      clearArtifacts: vi.fn(),
    });

    expect(existsSync(path.join(repo, "keep.txt"))).toBe(true);
    expect(existsSync(path.join(repo, "droid-created.txt"))).toBe(false);
  });

  it("is safe to run when no demo branch exists and no manifest was recorded", () => {
    const repo = makeRepo();
    resetDemo({ root: repo, verifyBuggy: () => true, readSnapshots: () => [], clearArtifacts: vi.fn() });
    expect(branch(repo)).toBe("main");
    expect(existsSync(path.join(repo, "pre.txt"))).toBe(true);
  });

  it("skips file cleanup when a legacy manifest cannot prove pre-existing files", () => {
    const repo = makeRepo();
    createLocalDemoBranch("TICKET-1042", repo);
    writeFileSync(path.join(repo, "run-file.txt"), "run file\n", "utf8");

    resetDemo({
      root: repo,
      verifyBuggy: () => true,
      readSnapshots: () => [{ files: [], ignored: [], legacy: true }],
      clearArtifacts: vi.fn(),
    });

    // Conservative: no difference-based deletion when the manifest is unreliable.
    expect(existsSync(path.join(repo, "run-file.txt"))).toBe(true);
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

  it("refuses to start a run on a tree with pre-existing untracked files", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "user-scratch.txt"), "user file\n", "utf8");
    expect(() => createLocalDemoBranch("TICKET-1042", repo)).toThrowError(
      expect.objectContaining({ code: "workspace_blocked" }),
    );
  });
});
