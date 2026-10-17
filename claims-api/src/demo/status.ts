import type { WorkspaceState } from "../gate/certify.js";
import { REGRESSION_CONTRACT } from "../gate/contract.js";

export type DemoGate = "expected_red" | "patched_green" | "blocked";

export interface DemoStatus {
  workspace: WorkspaceState;
  gate: DemoGate;
  mutationAllowed: boolean;
  reviewReady: boolean;
  runState: "idle";
  regression: string;
  detail: string;
}

/**
 * Derives the authoritative demo status from the filesystem workspace
 * classification alone. It reports the planted state as expected red, refuses to
 * claim patched/review-ready status while buggy, and gives dirty/unknown a
 * bounded blocked classification. Every string is safe public copy: no hashes,
 * patch text, commands, stacks, source, or absolute paths.
 */
export function buildDemoStatus(workspace: WorkspaceState): DemoStatus {
  const base = {
    workspace,
    reviewReady: false as const,
    runState: "idle" as const,
    regression: REGRESSION_CONTRACT.fullName,
  };

  switch (workspace) {
    case "buggy":
      return {
        ...base,
        gate: "expected_red",
        mutationAllowed: true,
        detail: "Planted regression is red as expected; ready for a PulseDesk run.",
      };
    case "patched":
      return {
        ...base,
        gate: "patched_green",
        mutationAllowed: false,
        detail: "Workspace is patched; reset is required before a new run.",
      };
    case "dirty":
      return {
        ...base,
        gate: "blocked",
        mutationAllowed: false,
        detail: "Workspace has unexpected local edits and cannot run until restored.",
      };
    case "unknown":
      return {
        ...base,
        gate: "blocked",
        mutationAllowed: false,
        detail: "Workspace state could not be verified and cannot run until restored.",
      };
  }
}
