import { describe, expect, it } from "vitest";
import { REGRESSION_CONTRACT } from "../gate/contract.js";
import { buildDemoStatus } from "./status.js";

const FORBIDDEN = ["/Users/", "\\", "sha256", "git apply", "at Object.", "Error:", ".ts:"];

function assertNoDisclosure(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const needle of FORBIDDEN) {
    expect(serialized.includes(needle)).toBe(false);
  }
}

describe("buildDemoStatus", () => {
  it("classifies buggy state as expected red naming the manifest regression", () => {
    const status = buildDemoStatus("buggy");
    expect(status.workspace).toBe("buggy");
    expect(status.gate).toBe("expected_red");
    expect(status.mutationAllowed).toBe(true);
    expect(status.reviewReady).toBe(false);
    expect(status.runState).toBe("idle");
    expect(status.regression).toBe(REGRESSION_CONTRACT.fullName);
    assertNoDisclosure(status);
  });

  it("classifies patched state without claiming review-ready or deployed", () => {
    const status = buildDemoStatus("patched");
    expect(status.workspace).toBe("patched");
    expect(status.gate).toBe("patched_green");
    expect(status.mutationAllowed).toBe(false);
    expect(status.reviewReady).toBe(false);
    assertNoDisclosure(status);
  });

  it("reports a bounded blocked classification for dirty state", () => {
    const status = buildDemoStatus("dirty");
    expect(status.workspace).toBe("dirty");
    expect(status.gate).toBe("blocked");
    expect(status.mutationAllowed).toBe(false);
    expect(status.reviewReady).toBe(false);
    assertNoDisclosure(status);
  });

  it("reports a bounded blocked classification for unknown state", () => {
    const status = buildDemoStatus("unknown");
    expect(status.workspace).toBe("unknown");
    expect(status.gate).toBe("blocked");
    expect(status.mutationAllowed).toBe(false);
    expect(status.reviewReady).toBe(false);
    assertNoDisclosure(status);
  });
});
