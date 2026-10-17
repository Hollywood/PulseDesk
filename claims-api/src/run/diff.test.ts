import { describe, expect, it } from "vitest";
import { computeRealDiff } from "./diff.js";
import { derivePatchedSource } from "./patch.js";
import { RunError } from "./types.js";

const BASELINE = [
  'import type { IdempotencyStrategy } from "./idempotency.js";',
  'import { perAttemptStrategy } from "./idempotency.js";',
  "",
  "/**",
  " * The single production idempotency binding for claim submission.",
  " */",
  "export const ACTIVE_STRATEGY: IdempotencyStrategy = perAttemptStrategy;",
  "",
].join("\n");

const RELATIVE_PATH = "claims-api/src/domain/active-strategy.ts";

describe("derivePatchedSource", () => {
  it("flips exactly the strategy import and the binding", () => {
    const patched = derivePatchedSource(BASELINE);
    expect(patched).toContain('import { stableClaimStrategy } from "./idempotency.js";');
    expect(patched).toContain("export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;");
    expect(patched).not.toContain("perAttemptStrategy");
  });

  it("rejects a baseline that is no longer the planted shape", () => {
    expect(() => derivePatchedSource('export const ACTIVE_STRATEGY = somethingElse;\n')).toThrow(RunError);
  });
});

describe("computeRealDiff", () => {
  it("returns a genuine git diff with repo-relative paths for the applied patch", () => {
    const patched = derivePatchedSource(BASELINE);
    const diff = computeRealDiff(BASELINE, patched, RELATIVE_PATH);

    expect(diff.path).toBe(RELATIVE_PATH);
    expect(diff.text).toContain(
      `diff --git a/${RELATIVE_PATH} b/${RELATIVE_PATH}`,
    );
    expect(diff.text).toContain('--- a/claims-api/src/domain/active-strategy.ts');
    expect(diff.text).toContain('+++ b/claims-api/src/domain/active-strategy.ts');
    expect(diff.text).toContain('-import { perAttemptStrategy } from "./idempotency.js";');
    expect(diff.text).toContain('+import { stableClaimStrategy } from "./idempotency.js";');
    expect(diff.text).toContain("-export const ACTIVE_STRATEGY: IdempotencyStrategy = perAttemptStrategy;");
    expect(diff.text).toContain("+export const ACTIVE_STRATEGY: IdempotencyStrategy = stableClaimStrategy;");
    // The temp workspace must never leak into the displayed diff.
    expect(diff.text).not.toContain("pulsedesk-diff-");
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
  });

  it("produces an empty diff when nothing changed", () => {
    const diff = computeRealDiff(BASELINE, BASELINE, RELATIVE_PATH);
    expect(diff.text).toBe("");
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });
});
