import { lstatSync, readFileSync } from "node:fs";
import type { WorkspaceState } from "./certify.js";

const BUGGY_BINDING = /ACTIVE_STRATEGY\s*(?::[^=]+)?=\s*perAttemptStrategy\b/;
const PATCHED_BINDING = /ACTIVE_STRATEGY\s*(?::[^=]+)?=\s*stableClaimStrategy\b/;

/**
 * Classifies the workspace by reading the single active-strategy binding that
 * the TICKET-1042 patch flips. Missing, symlinked, or non-regular files are
 * `unknown`; an unrecognized binding is `dirty`.
 */
export function resolveWorkspaceState(activeStrategyPath: string): WorkspaceState {
  let stats;
  try {
    stats = lstatSync(activeStrategyPath);
  } catch {
    return "unknown";
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    return "unknown";
  }

  let source: string;
  try {
    source = readFileSync(activeStrategyPath, "utf8");
  } catch {
    return "unknown";
  }

  const isBuggy = BUGGY_BINDING.test(source);
  const isPatched = PATCHED_BINDING.test(source);
  if (isBuggy && !isPatched) {
    return "buggy";
  }
  if (isPatched && !isBuggy) {
    return "patched";
  }
  return "dirty";
}
