import { certifyGate } from "./certify.js";
import { REGRESSION_CONTRACT } from "./contract.js";
import { activeStrategyPath, claimsApiRoot, runRawClaimsTests } from "./run-tests.js";
import { resolveWorkspaceState } from "./state.js";

const TEST_TIMEOUT_MS = 120_000;
const STALE_THRESHOLD_MS = 600_000;

async function main(): Promise<void> {
  const state = resolveWorkspaceState(activeStrategyPath());
  const run = await runRawClaimsTests({ cwd: claimsApiRoot(), timeoutMs: TEST_TIMEOUT_MS });
  const decision = certifyGate(state, run, REGRESSION_CONTRACT, {
    now: Date.now(),
    staleThresholdMs: STALE_THRESHOLD_MS,
  });

  if (decision.ok) {
    process.stdout.write(
      `${JSON.stringify({
        gate: "pass",
        state: decision.state,
        certification: decision.certification,
        reason: decision.reason,
      })}\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `${JSON.stringify({
      gate: "fail",
      state: decision.state,
      code: decision.code,
      reason: decision.reason,
    })}\n`,
  );
  process.exit(1);
}

void main();
