import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, type Logger } from "./logger.js";
import { getStatus, InMemoryClaimStore } from "./status.js";

function captureLogs(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  let buffered = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffered += chunk.toString();
      const records = buffered.split("\n");
      buffered = records.pop() ?? "";
      lines.push(...records.filter(Boolean));
      callback();
    },
  });
  return { lines, stream };
}

function silentLogger(): Logger {
  return createLogger({
    stream: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    service: "claims-status-api",
  });
}

const SYNTHETIC_QUERY = { claimId: "CLM-2381", memberId: "MBR-0001" } as const;

describe("claim-status debug log hygiene (TICKET-1051 regression)", () => {
  it("does not write the member id into the debug log record", () => {
    const capture = captureLogs();
    const logger = createLogger({ stream: capture.stream, service: "claims-status-api", level: "debug" });
    const store = new InMemoryClaimStore();

    const result = getStatus(SYNTHETIC_QUERY, { logger, store });

    expect(result.claimId).toBe("CLM-2381");
    expect(result.memberId).toBe("MBR-0001");
    expect(capture.lines).toHaveLength(1);
    expect(capture.lines[0]).not.toContain("MBR-0001");
    const record = JSON.parse(capture.lines[0] ?? "{}") as Record<string, unknown>;
    expect(record).toMatchObject({
      level: 10,
      service: "claims-status-api",
      event: "claim_status_check",
      claimId: "CLM-2381",
      memberId: "[Redacted]",
      msg: "claim status lookup",
    });
  });

  it("still records the claimId and event for trace correlation", () => {
    const capture = captureLogs();
    const logger = createLogger({ stream: capture.stream, service: "claims-status-api", level: "debug" });
    const store = new InMemoryClaimStore();

    getStatus(SYNTHETIC_QUERY, { logger, store });

    expect(capture.lines[0]).toContain("CLM-2381");
    expect(capture.lines[0]).toContain("claim_status_check");
    expect(capture.lines[0]).toContain("claim status lookup");
  });
});

describe("claim-status handler", () => {
  it("returns the stored status for a known claim", () => {
    const store = new InMemoryClaimStore();
    store.upsert({ claimId: "CLM-2381", status: "accepted", ref: "CH-REF-7" });

    const result = getStatus(SYNTHETIC_QUERY, { logger: silentLogger(), store });

    expect(result).toEqual({
      claimId: "CLM-2381",
      memberId: "MBR-0001",
      status: "accepted",
      clearinghouseRef: "CH-REF-7",
      deduplicated: false,
    });
  });

  it("returns a pending status with a sentinel clearinghouse ref for unknown claims", () => {
    const store = new InMemoryClaimStore();

    const result = getStatus(SYNTHETIC_QUERY, { logger: silentLogger(), store });

    expect(result.status).toBe("pending");
    expect(result.clearinghouseRef).toBe("CH-REF-NONE");
  });
});
