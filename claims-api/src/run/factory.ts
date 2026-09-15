import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AutonomyLevel, OutputFormatType, run as runDroid } from "@factory/droid-sdk/node";
import type { WorkspaceState } from "../gate/certify.js";
import { resolveWorkspaceState } from "../gate/state.js";
import { activeStrategyPath } from "../gate/run-tests.js";
import { loadTickets } from "../http/tickets.js";
import {
  RunError,
  type DiffResult,
  type PrSummary,
  type RcaDocument,
  type RegressionAssertionEvidence,
  type RunStep,
  type TestRunEvidence,
  type TicketRunResult,
} from "./types.js";

/** Repository root the droid session works in (the whole Ticketdroid workspace). */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export interface FactorySessionInvokerArgs {
  prompt: string;
  /** Working directory for the droid session, normally the repository root. */
  cwd: string;
  /** Text appended to Droid's default system prompt. */
  appendSystemPrompt: string;
  /** JSON Schema the droid's final structured output must satisfy. */
  schema: unknown;
  signal?: AbortSignal;
}

export interface FactorySessionOutcome {
  /** Validated structured output from the droid, or null when the run omitted it. */
  structuredOutput: unknown;
  /** Wall-clock duration of the droid session, in milliseconds. */
  durationMs: number;
  /** Identifier of the Factory session created for the ticket. */
  sessionId: string;
}

export type FactorySessionInvoker = (args: FactorySessionInvokerArgs) => Promise<FactorySessionOutcome>;

export interface FactoryRunOptions {
  /** Repository root the droid works in. Defaults to the real Ticketdroid root. */
  root?: string;
  /** Local-only branch created for this run, shown in the PR view. */
  branchName?: string;
  /** Hard cap on one droid session, in milliseconds. */
  timeoutMs?: number;
  /** Injectable droid invoker for deterministic tests. */
  invoke?: FactorySessionInvoker;
  now?: () => number;
  /** Workspace classification gate override for deterministic tests. */
  workspaceState?: WorkspaceState;
}

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

/** Wraps the project guardrails that every Ticketdroid droid session must honor. */
export const SYSTEM_PROMPT_APPEND = [
  "You are Ticketdroid running an on-call investigation for a revenue-cycle demo.",
  "Follow the repository's AGENTS.md, and the ticket-analysis and pr-narrative skills in .factory/skills/.",
  "Synthetic demo only: never invent or use real patient data, MRNs, PHI, secrets, or production URLs.",
  "Revenue-cycle/billing context only. Do not introduce clinical or patient-safety scenarios.",
  "Never push, merge, or deploy. The demo ends at a reviewable PR that a human approves.",
].join(" ");

/**
 * Invokes a real Factory droid session through the Droid TypeScript SDK. The
 * SDK starts the local `droid` CLI (and its stored login) as a subprocess, so
 * the session is a genuine Factory session; the agent works in the repository
 * and returns structured output that satisfies the requested JSON Schema.
 */
export async function invokeDroidViaSdk(args: FactorySessionInvokerArgs): Promise<FactorySessionOutcome> {
  let result;
  try {
    result = await runDroid(args.prompt, {
      cwd: args.cwd,
      systemPrompt: { type: "preset", preset: "droid", append: args.appendSystemPrompt },
      outputFormat: { type: OutputFormatType.JsonSchema, schema: args.schema as Record<string, unknown> },
      autonomyLevel: AutonomyLevel.High,
      autoRejectPermissionRequests: true,
      abortSignal: args.signal,
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    if (timedOut) {
      throw new RunError(
        "factory_timeout",
        `The Factory droid session exceeded its time limit and was stopped. Try the run again.`,
      );
    }
    throw new RunError(
      "factory_unavailable",
      "Could not reach Factory to start a droid session. Start the Factory app (or authenticate the droid CLI once), then retry.",
    );
  }

  if (!result.success) {
    const message =
      result.structuredOutputError?.message ??
      result.error?.message ??
      `The Factory droid session did not complete (${result.subtype}).`;
    throw new RunError("factory_run_failed", message);
  }

  return {
    structuredOutput: result.structuredOutput ?? null,
    durationMs: Math.max(0, result.durationMs),
    sessionId: result.sessionId,
  };
}

/** The exact four-step Ticketdroid timeline, in execution order. */
const STEP_IDS = ["intake", "code_search", "hypothesis", "patch"] as const;

const TEST_EVIDENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["total", "passed", "failed", "regression", "regressionPassed", "certification"],
  properties: {
    total: { type: "number" },
    passed: { type: "number" },
    failed: { type: "number" },
    regression: {
      type: "object",
      additionalProperties: false,
      required: ["name", "expected", "actual"],
      properties: {
        name: { type: "string" },
        expected: { type: "number" },
        actual: { type: ["number", "null"] },
      },
    },
    regressionPassed: { type: "boolean" },
    certification: { type: "string", enum: ["expected_red", "patched_green"] },
  },
} as const;

/** JSON Schema the Ticketdroid run output must satisfy, mirroring run/types.ts. */
export const FACTORY_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["steps", "rca", "testsBefore", "testsAfter", "pr"],
  properties: {
    steps: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail"],
        properties: {
          id: { type: "string", enum: STEP_IDS },
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    rca: {
      type: "object",
      additionalProperties: false,
      required: [
        "signal",
        "customerImpact",
        "hypothesis",
        "filesToInspect",
        "blastRadius",
        "testsThatMustPass",
        "humanVerification",
      ],
      properties: {
        signal: { type: "string" },
        customerImpact: { type: "string" },
        hypothesis: { type: "string" },
        filesToInspect: { type: "array", items: { type: "string" } },
        blastRadius: { type: "string" },
        testsThatMustPass: { type: "array", items: { type: "string" } },
        humanVerification: { type: "array", items: { type: "string" } },
      },
    },
    testsBefore: TEST_EVIDENCE_SCHEMA,
    testsAfter: TEST_EVIDENCE_SCHEMA,
    pr: {
      type: "object",
      additionalProperties: false,
      required: ["title", "why", "whatChanged", "tests", "riskAndRollback", "humanVerification"],
      properties: {
        title: { type: "string" },
        why: { type: "string" },
        whatChanged: { type: "array", items: { type: "string" } },
        tests: { type: "array", items: { type: "string" } },
        riskAndRollback: { type: "string" },
        humanVerification: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

/** Shape of the droid's structured output after normalization. */
export interface FactoryOutput {
  steps: Array<{ id: RunStep["id"]; title: string; detail: string }>;
  rca: RcaDocument;
  testsBefore: TestRunEvidence;
  testsAfter: TestRunEvidence;
  pr: PrSummary;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRegression(value: unknown): value is RegressionAssertionEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isString(record.name) &&
    typeof record.expected === "number" &&
    (typeof record.actual === "number" || record.actual === null)
  );
}

function isTestEvidence(value: unknown): value is TestRunEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.total === "number" &&
    typeof record.passed === "number" &&
    typeof record.failed === "number" &&
    isRegression(record.regression) &&
    typeof record.regressionPassed === "boolean" &&
    (record.certification === "expected_red" || record.certification === "patched_green")
  );
}

function isRca(value: unknown): value is RcaDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isString(record.signal) &&
    isString(record.customerImpact) &&
    isString(record.hypothesis) &&
    isStringArray(record.filesToInspect) &&
    isString(record.blastRadius) &&
    isStringArray(record.testsThatMustPass) &&
    isStringArray(record.humanVerification)
  );
}

function isPr(value: unknown): value is PrSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isString(record.title) &&
    isString(record.why) &&
    isStringArray(record.whatChanged) &&
    isStringArray(record.tests) &&
    isString(record.riskAndRollback) &&
    isStringArray(record.humanVerification)
  );
}

/** Strictly validates the droid's structured output into the fixed run shape. */
export function normalizeFactoryOutput(value: unknown): FactoryOutput {
  if (typeof value !== "object" || value === null) {
    throw new RunError(
      "factory_output_invalid",
      "The Factory droid session returned no structured run output, so Ticketdroid recorded no result.",
    );
  }
  const record = value as Record<string, unknown>;

  const stepsValue = record.steps;
  if (
    !Array.isArray(stepsValue) ||
    stepsValue.length !== 4 ||
    !stepsValue.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        isString((entry as Record<string, unknown>).title) &&
        isString((entry as Record<string, unknown>).detail) &&
        STEP_IDS.includes((entry as Record<string, unknown>).id as (typeof STEP_IDS)[number]),
    )
  ) {
    throw new RunError(
      "factory_output_invalid",
      "The Factory droid session returned a run timeline that does not match the expected Intake → Code search → Hypothesis → Patch shape.",
    );
  }

  if (!isRca(record.rca) || !isTestEvidence(record.testsBefore) || !isTestEvidence(record.testsAfter) || !isPr(record.pr)) {
    throw new RunError(
      "factory_output_invalid",
      "The Factory droid session returned incomplete RCA, test, or PR evidence, so Ticketdroid recorded no result.",
    );
  }

  return {
    steps: stepsValue.map((entry) => {
      const step = entry as Record<string, unknown>;
      return {
        id: step.id as RunStep["id"],
        title: step.title as string,
        detail: step.detail as string,
      };
    }),
    rca: record.rca as RcaDocument,
    testsBefore: record.testsBefore as TestRunEvidence,
    testsAfter: record.testsAfter as TestRunEvidence,
    pr: record.pr as PrSummary,
  };
}

/** Builds the self-contained prompt the Ticketdroid droid session is asked to follow. */
export function buildFactoryPrompt(ticket: Record<string, unknown>): string {
  const fields = [
    ["id", ticket.id],
    ["source", ticket.source],
    ["severity", ticket.severity],
    ["status", ticket.status],
    ["service", ticket.service],
    ["created_at", ticket.created_at],
    ["title", ticket.title],
    ["summary", ticket.summary],
    ["alert_body", ticket.alert_body],
  ] as const;
  const ticketBlock = fields
    .map(([key, raw]) => {
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      return `- ${key}: ${text}`;
    })
    .join("\n");

  return [
    "Process the incoming on-call ticket below for the Ticketdroid demo (revenue cycle / claims platform).",
    "",
    "TICKET:",
    ticketBlock,
    "",
    "TASK:",
    "1. Read fixtures/tickets.json, AGENTS.md, and the skills in .factory/skills/ (ticket-analysis, pr-narrative) for the RCA and PR shapes.",
    "2. Find the service named in the ticket. If it does not exist in this repository yet, create it as a new workspace directory named after the service (e.g. scheduling-api/) with a small, zero-dependency TypeScript implementation of the affected behavior, then implement the fix in it.",
    "3. Reproduce the problem with a regression test: run the suite before the fix (expected red) and after (expected green). Prefer the repository's existing vitest setup; you may add a minimal package.json for a new service.",
    "4. Do the work for real in the current working tree and commit your changes to the current branch when done; the demo shows the resulting diff.",
    "5. Finish by answering with structured JSON matching the requested schema. Every field must report real evidence from this run — no placeholder copy.",
    "",
    "GUARDRAILS:",
    "- Synthetic data only. Never use real patient names, MRNs, diagnoses, DOBs, claim numbers, secrets, or production URLs.",
    "- Do not modify web/, fixtures/tickets.json, MISSION_PROMPT.txt, SESSION_PROMPTS.md, or the documentation.",
    "- Do not touch claims-api/artifacts/ and do not run package-manager installs unless a new service genuinely needs dependencies.",
    "- Never push, merge, or deploy. End at a reviewable PR.",
  ].join("\n");
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new RunError("diff_failed", "Could not read the workspace diff from git.");
  }
}

/** Current commit the run started from, captured before the droid makes changes. */
export function baseRefForRun(root: string): string {
  return git(root, ["rev-parse", "HEAD"]).trim();
}

/** Non-ignored untracked files in the working tree, NUL-safe. */
export function listUntrackedFiles(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\0").filter(Boolean);
}

/**
 * Genuine diff of everything the droid changed since the run start: committed
 * and uncommitted tracked changes plus brand-new untracked files (registered
 * with intent-to-add so git renders them as new files in the diff).
 */
export function computeWorkingTreeDiff(root: string, baseRef: string): DiffResult {
  const untracked = listUntrackedFiles(root);
  if (untracked.length > 0) {
    try {
      execFileSync("git", ["add", "-N", "--", ...untracked], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new RunError("diff_failed", "Could not prepare the workspace diff from git.");
    }
  }

  const files = git(root, ["diff", "--name-only", "--no-color", baseRef])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (files.length === 0) {
    return { path: "", text: "", added: 0, removed: 0 };
  }

  const text = git(root, ["diff", "--no-color", "--full-index", baseRef]).trimEnd();
  const numstat = git(root, ["diff", "--numstat", "--no-color", baseRef]);
  let added = 0;
  let removed = 0;
  for (const line of numstat.split("\n")) {
    const [addedRaw, removedRaw] = line.split("\t");
    if (/^\d+$/.test(addedRaw)) {
      added += Number(addedRaw);
    }
    if (/^\d+$/.test(removedRaw)) {
      removed += Number(removedRaw);
    }
  }

  const path = files.length === 1 ? files[0] : files.join(", ");
  return { path, text, added, removed };
}

function stampSteps(
  steps: Array<{ id: RunStep["id"]; title: string; detail: string }>,
  startedAt: number,
  durationMs: number,
): RunStep[] {
  const segment = Math.max(1, Math.round(durationMs / steps.length));
  return steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    detail: step.detail,
    startedAt: startedAt + index * segment,
    finishedAt: startedAt + (index + 1) * segment,
  }));
}

/**
 * Runs one Ticketdroid run by calling back to Factory: a real droid session
 * processes the ticket, implements the fix in the repository, and returns
 * structured evidence that is recorded as the run result. The gate guards the
 * planted-bug workspace exactly like the deterministic orchestrator did.
 */
export async function runTicketViaFactory(
  ticketId: string,
  options: FactoryRunOptions = {},
): Promise<TicketRunResult> {
  const root = options.root ?? REPOSITORY_ROOT;
  const now = options.now ?? Date.now;

  const ticket = loadTickets().find((entry) => entry.id === ticketId);
  if (ticket === undefined) {
    throw new RunError("ticket_not_found", "No ticket exists with the requested id.");
  }

  const workspace = options.workspaceState ?? resolveWorkspaceState(activeStrategyPath());
  if (workspace !== "buggy") {
    const message =
      workspace === "patched"
        ? "Workspace is already patched; run the demo reset before a new run."
        : "Workspace has unexpected local edits and cannot run until restored.";
    throw new RunError(
      workspace === "patched" ? "already_patched" : "workspace_blocked",
      message,
    );
  }

  const startedAt = now();
  const baseRef = baseRefForRun(root);
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let outcome: FactorySessionOutcome;
  try {
    outcome = await (options.invoke ?? invokeDroidViaSdk)({
      prompt: buildFactoryPrompt(ticket),
      cwd: root,
      appendSystemPrompt: SYSTEM_PROMPT_APPEND,
      schema: FACTORY_OUTPUT_SCHEMA,
      signal,
    });
  } catch (error) {
    if (error instanceof RunError) {
      throw error;
    }
    throw new RunError(
      "factory_unavailable",
      "Could not reach Factory to start a droid session. Start the Factory app (or authenticate the droid CLI once), then retry.",
    );
  }

  const finishedAt = now();
  const factoryOutput = normalizeFactoryOutput(outcome.structuredOutput);
  const diff = computeWorkingTreeDiff(root, baseRef);

  return {
    ticketId,
    branchName: options.branchName,
    status: "complete",
    startedAt,
    finishedAt,
    workspaceBefore: "buggy",
    workspaceAfter: "patched",
    steps: stampSteps(factoryOutput.steps, startedAt, Math.max(1, finishedAt - startedAt)),
    rca: factoryOutput.rca,
    testsBefore: factoryOutput.testsBefore,
    testsAfter: factoryOutput.testsAfter,
    diff,
    pr: factoryOutput.pr,
  };
}
