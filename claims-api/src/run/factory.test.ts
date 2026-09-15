import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunError } from "./types.js";
import {
  buildFactoryPrompt,
  computeWorkingTreeDiff,
  evaluateExecEnvelope,
  normalizeFactoryOutput,
  parseDebugEvent,
  runTicketViaFactory,
  type FactoryOutput,
  type FactorySessionInvoker,
  type FactorySessionInvokerArgs,
} from "./factory.js";

const tempDirs: string[] = [];

function runGit(dir: string, args: string[]): string {
  const result = execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result;
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ticketdroid-factory-"));
  tempDirs.push(dir);
  runGit(dir, ["init", "-q", "-b", "main"]);
  runGit(dir, ["config", "user.email", "test@example.invalid"]);
  runGit(dir, ["config", "user.name", "Ticketdroid Test"]);
  writeFileSync(path.join(dir, "file.ts"), "let x = 1;\n", "utf8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "base"]);
  return dir;
}

function validFactoryOutput(overrides: Partial<FactoryOutput> = {}): FactoryOutput {
  return {
    steps: [
      { id: "intake", title: "Intake", detail: "Read TICKET-1042 from the fixture." },
      { id: "code_search", title: "Code search", detail: "Located active-strategy.ts." },
      { id: "hypothesis", title: "Hypothesis", detail: "Per-attempt key causes duplicate submissions." },
      { id: "patch", title: "Patch", detail: "Switched to the stable claim-scoped key; suite green." },
    ],
    rca: {
      signal: "pagerduty SEV-2: duplicate claim submission on claims-api.",
      customerImpact: "Duplicate claim flagged by the payer; revenue cycle impact only.",
      hypothesis: "The retry sends a new idempotency key per attempt.",
      filesToInspect: ["claims-api/src/domain/active-strategy.ts"],
      blastRadius: "Clearinghouse retry path for claims submissions.",
      testsThatMustPass: ["logical_submission_count regression"],
      humanVerification: ["The diff only flips the idempotency binding."],
    },
    testsBefore: {
      total: 5,
      passed: 4,
      failed: 1,
      regression: { name: "logical_submission_count", expected: 1, actual: 2 },
      regressionPassed: false,
      certification: "expected_red",
    },
    testsAfter: {
      total: 5,
      passed: 5,
      failed: 0,
      regression: { name: "logical_submission_count", expected: 1, actual: null },
      regressionPassed: true,
      certification: "patched_green",
    },
    pr: {
      title: "fix(claims-api): stable idempotency key (TICKET-1042)",
      why: "TICKET-1042 duplicate claim submission.",
      whatChanged: ["Flip the idempotency binding."],
      tests: ["logical_submission_count red before, green after."],
      riskAndRollback: "Low; flip the binding back to roll back.",
      humanVerification: ["Human approval required before merge."],
    },
    ...overrides,
  };
}

function invokeReturning(output: unknown, durationMs = 500): FactorySessionInvoker {
  return async () => ({
    structuredOutput: output,
    durationMs,
    sessionId: "test-session",
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizeFactoryOutput", () => {
  it("accepts a well-shaped droid result", () => {
    const output = validFactoryOutput();
    expect(normalizeFactoryOutput(output)).toEqual(output);
  });

  it("rejects non-object output", () => {
    expect(() => normalizeFactoryOutput(null)).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
    expect(() => normalizeFactoryOutput("nope")).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
  });

  it("rejects a timeline that is not exactly the four steps", () => {
    const output = validFactoryOutput({ steps: validFactoryOutput().steps.slice(0, 2) });
    expect(() => normalizeFactoryOutput(output)).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
  });

  it("rejects a step with an unknown id", () => {
    const output = validFactoryOutput({
      steps: [{ ...validFactoryOutput().steps[0], id: "deploy" as FactoryOutput["steps"][number]["id"] }, ...validFactoryOutput().steps.slice(1)],
    });
    expect(() => normalizeFactoryOutput(output)).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
  });

  it("rejects missing RCA fields", () => {
    const output = validFactoryOutput({ rca: { ...validFactoryOutput().rca, blastRadius: "" } });
    expect(() => normalizeFactoryOutput(output)).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
  });

  it("rejects an invalid test certification", () => {
    const output = validFactoryOutput({
      testsBefore: { ...validFactoryOutput().testsBefore, certification: "weird" as never },
    });
    expect(() => normalizeFactoryOutput(output)).toThrowError(
      expect.objectContaining({ code: "factory_output_invalid" }),
    );
  });
});

describe("buildFactoryPrompt", () => {
  it("embeds the ticket fields and the project guardrails", () => {
    const prompt = buildFactoryPrompt({
      id: "TICKET-1038",
      source: "sentry",
      severity: "SEV-3",
      status: "triggered",
      service: "scheduling-api",
      created_at: "2026-09-08T14:02:00Z",
      title: "Intermittent double-booking on appointment reschedule",
      summary: "Two appointment slots created for the same patient/provider pair.",
      alert_body: "Error: SlotConflictWarning (non-fatal)",
      wired: true,
      notes_for_demo: "",
    });
    expect(prompt).toContain("TICKET-1038");
    expect(prompt).toContain("scheduling-api");
    expect(prompt).toContain("Intermittent double-booking");
    expect(prompt).toContain("Never push, merge, or deploy.");
    expect(prompt).toContain("Do not modify web/");
  });
});

describe("evaluateExecEnvelope", () => {
  it("maps a successful CLI envelope to a session outcome", () => {
    const outcome = evaluateExecEnvelope({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 5314,
      session_id: "965c4e87",
      result: '{"a":1}',
    });
    expect(outcome.structuredOutput).toEqual({ a: 1 });
    expect(outcome.durationMs).toBe(5314);
    expect(outcome.sessionId).toBe("965c4e87");
  });

  it("surfaces a failed session as a bounded factory_run_failed error", () => {
    expect(() =>
      evaluateExecEnvelope({ type: "result", subtype: "error_during_execution", is_error: true, error: "agent failed" }),
    ).toThrowError(RunError);
  });

  it("rejects a session result that is not valid JSON", () => {
    expect(() =>
      evaluateExecEnvelope({ type: "result", subtype: "success", is_error: false, result: "not json" }),
    ).toThrowError(expect.objectContaining({ code: "factory_output_invalid" }));
  });

  it("rejects a session with no result text", () => {
    expect(() =>
      evaluateExecEnvelope({ type: "result", subtype: "success", is_error: false }),
    ).toThrowError(expect.objectContaining({ code: "factory_run_failed" }));
  });
});

describe("computeWorkingTreeDiff", () => {
  it("captures tracked edits, new untracked files, and line counts", () => {
    const repo = makeRepo();
    const baseRef = runGit(repo, ["rev-parse", "HEAD"]).trim();

    writeFileSync(path.join(repo, "file.ts"), "let x = 2;\n", "utf8");
    writeFileSync(path.join(repo, "brand-new.ts"), "export const added = true;\n", "utf8");

    const diff = computeWorkingTreeDiff(repo, baseRef);

    expect(diff.path).toContain("file.ts");
    expect(diff.path).toContain("brand-new.ts");
    expect(diff.text).toContain("let x = 2;");
    expect(diff.text).toContain("brand-new.ts");
    expect(diff.added).toBeGreaterThan(0);
    expect(diff.removed).toBeGreaterThan(0);
  });

  it("returns an empty diff when nothing changed", () => {
    const repo = makeRepo();
    const baseRef = runGit(repo, ["rev-parse", "HEAD"]).trim();
    const diff = computeWorkingTreeDiff(repo, baseRef);
    expect(diff).toEqual({ path: "", text: "", added: 0, removed: 0 });
  });
});

describe("runTicketViaFactory", () => {
  it("records the droid's real evidence and a genuine git diff", async () => {
    const repo = makeRepo();
    const invoke = vi.fn(async (args: FactorySessionInvokerArgs) => {
      writeFileSync(path.join(args.cwd, "new-service.ts"), "export const service = 1;\n", "utf8");
      return { structuredOutput: validFactoryOutput(), durationMs: 500, sessionId: "sess-1" };
    });

    const result = await runTicketViaFactory("TICKET-1042", {
      root: repo,
      invoke,
      workspaceState: "buggy",
      branchName: "ticketdroid/TICKET-1042",
      now: () => 2_000,
    });

    expect(result.ticketId).toBe("TICKET-1042");
    expect(result.branchName).toBe("ticketdroid/TICKET-1042");
    expect(result.status).toBe("complete");
    expect(result.workspaceBefore).toBe("buggy");
    expect(result.workspaceAfter).toBe("patched");
    expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);

    expect(result.steps.map((step) => step.id)).toEqual(["intake", "code_search", "hypothesis", "patch"]);
    for (const step of result.steps) {
      expect(step.finishedAt).toBeGreaterThanOrEqual(step.startedAt);
    }

    expect(result.rca.hypothesis).toContain("idempotency");
    expect(result.testsBefore.regression.actual).toBe(2);
    expect(result.testsAfter.regression.actual).toBeNull();
    expect(result.pr.title).toContain("TICKET-1042");

    expect(result.diff.text).toContain("new-service.ts");
    expect(result.diff.path).toContain("new-service.ts");
    expect(result.diff.added).toBeGreaterThan(0);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: repo, appendSystemPrompt: expect.stringContaining("Never push") }),
    );
  });

  it("refuses an unknown ticket without invoking Factory", async () => {
    const repo = makeRepo();
    const invoke = vi.fn();
    await expect(
      runTicketViaFactory("TICKET-0000", { root: repo, invoke, workspaceState: "buggy" }),
    ).rejects.toMatchObject({ code: "ticket_not_found" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a patched or dirty workspace without invoking Factory", async () => {
    const repo = makeRepo();
    const invoke = vi.fn();
    await expect(
      runTicketViaFactory("TICKET-1042", { root: repo, invoke, workspaceState: "patched" }),
    ).rejects.toMatchObject({ code: "already_patched" });
    await expect(
      runTicketViaFactory("TICKET-1042", { root: repo, invoke, workspaceState: "dirty" }),
    ).rejects.toMatchObject({ code: "workspace_blocked" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("wraps an SDK-level failure into a bounded factory_unavailable error", async () => {
    const repo = makeRepo();
    const invoke = async () => {
      throw new Error("spawn ENOENT");
    };
    await expect(
      runTicketViaFactory("TICKET-1042", { root: repo, invoke, workspaceState: "buggy" }),
    ).rejects.toMatchObject({ code: "factory_unavailable" });
  });

  it("propagates bounded RunErrors raised by the invoker", async () => {
    const repo = makeRepo();
    const invoke = async () => {
      throw new RunError("factory_run_failed", "The droid session did not complete.");
    };
    await expect(
      runTicketViaFactory("TICKET-1042", { root: repo, invoke, workspaceState: "buggy" }),
    ).rejects.toMatchObject({ code: "factory_run_failed" });
  });

  it("rejects malformed droid output as factory_output_invalid", async () => {
    const repo = makeRepo();
    const invoke = invokeReturning({ steps: [], rca: {}, pr: {} });
    await expect(
      runTicketViaFactory("TICKET-1042", { root: repo, invoke, workspaceState: "buggy" }),
    ).rejects.toMatchObject({ code: "factory_output_invalid" });
  });
});

describe("parseDebugEvent", () => {
  const at = 1_700_000_000_000;

  it("reports the Factory session id from the init event", () => {
    const line = JSON.stringify({ type: "system", subtype: "init", session_id: "5fcc2798-d0da" });
    expect(parseDebugEvent(line, at)).toEqual({ kind: "session", at, sessionId: "5fcc2798-d0da" });
  });

  it("turns a tool call into an activity with a repo-relative target", () => {
    const line = JSON.stringify({
      type: "tool_call",
      toolName: "Read",
      parameters: { file_path: "/repo/claims-api/src/domain/active-strategy.ts" },
    });
    expect(parseDebugEvent(line, at, "/repo")).toEqual({
      kind: "activity",
      at,
      tool: "Read",
      detail: "claims-api/src/domain/active-strategy.ts",
    });
  });

  it("summarizes reasoning to a single plain line", () => {
    const line = JSON.stringify({ type: "reasoning", text: "**Planning the fix**\n\nInspect the retry path next." });
    expect(parseDebugEvent(line, at)).toEqual({ kind: "thinking", at, text: "Planning the fix" });
  });

  it("keeps assistant messages and drops the prompt echoed back as a user message", () => {
    const assistant = JSON.stringify({ type: "message", role: "assistant", text: "Patch applied; running tests." });
    expect(parseDebugEvent(assistant, at)).toEqual({ kind: "message", at, text: "Patch applied; running tests." });
    expect(parseDebugEvent(JSON.stringify({ type: "message", role: "user", text: "prompt" }), at)).toBeNull();
  });

  it("ignores completion, tool results, malformed lines, and empty text", () => {
    expect(parseDebugEvent(JSON.stringify({ type: "completion", finalText: "{}" }), at)).toBeNull();
    expect(parseDebugEvent(JSON.stringify({ type: "tool_result", value: "ok" }), at)).toBeNull();
    expect(parseDebugEvent("not json", at)).toBeNull();
    expect(parseDebugEvent(JSON.stringify({ type: "reasoning", text: "   " }), at)).toBeNull();
  });

  it("never shows an absolute workspace path in the run view", () => {
    const listRoot = JSON.stringify({ type: "tool_call", toolName: "LS", parameters: { directory_path: "/repo" } });
    expect(parseDebugEvent(listRoot, at, "/repo")).toEqual({ kind: "activity", at, tool: "LS", detail: "repo root" });

    const command = JSON.stringify({
      type: "tool_call",
      toolName: "Execute",
      parameters: { command: "git -C /repo status --short" },
    });
    const event = parseDebugEvent(command, at, "/repo");
    expect(event !== null && "detail" in event && event.detail.includes("/repo")).toBe(false);
  });

  it("bounds long activity detail so a stream cannot flood the run view", () => {
    const line = JSON.stringify({ type: "tool_call", toolName: "Execute", parameters: { command: "x".repeat(400) } });
    const event = parseDebugEvent(line, at);
    expect(event?.kind).toBe("activity");
    expect(event !== null && "detail" in event && event.detail.length).toBeLessThanOrEqual(141);
  });
});
