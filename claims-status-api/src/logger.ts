import type { Writable } from "node:stream";

/** Minimal structured logger used by claims-status-api's handlers. */
export interface Logger {
  debug(payload: Record<string, unknown>, msg: string): void;
  info(payload: Record<string, unknown>, msg: string): void;
  warn(payload: Record<string, unknown>, msg: string): void;
}

export interface LoggerOptions {
  /** Destination for one JSON record per log call, terminated with a newline. */
  stream: Writable;
  service: string;
  /** Suppresses anything strictly below this level. Defaults to "info". */
  level?: "debug" | "info" | "warn";
  /**
   * Dotted payload paths whose values are replaced with "[Redacted]" before the
   * record is written. Defaults cover auth/cookie-style credentials but do NOT
   * cover member-identifying fields; the TICKET-1051 fix is to add
   * `memberId` (or equivalent) here. Identifiers in payloads are always opaque
   * synthetic IDs — never real PHI.
   */
  redactPaths?: readonly string[];
}

type Level = "debug" | "info" | "warn";
const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30 };

const DEFAULT_REDACT_PATHS: readonly string[] = ["authorization", "cookie"];

function redactPath(payload: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = path.split(".");
  const cloned: Record<string, unknown> = { ...payload };
  let cursor: Record<string, unknown> = cloned;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = cursor[segment];
    if (typeof next !== "object" || next === null) {
      return cloned;
    }
    const child = { ...(next as Record<string, unknown>) };
    cursor[segment] = child;
    cursor = child;
  }
  const leaf = segments[segments.length - 1];
  if (leaf !== undefined && leaf in cursor) {
    cursor[leaf] = "[Redacted]";
  }
  return cloned;
}

function writeRecord(
  stream: Writable,
  service: string,
  level: Level,
  payload: Record<string, unknown>,
  msg: string,
  redactPaths: readonly string[],
): void {
  let safe = payload;
  for (const path of redactPaths) {
    safe = redactPath(safe, path);
  }
  const record = {
    level: LEVEL_RANK[level],
    service,
    time: new Date().toISOString(),
    ...safe,
    msg,
  };
  stream.write(`${JSON.stringify(record)}\n`);
}

/** Creates a logger with the supplied redact list and level. */
export function createLogger(options: LoggerOptions): Logger {
  const threshold = options.level ?? "info";
  const redactPaths = options.redactPaths ?? DEFAULT_REDACT_PATHS;
  return {
    debug(payload, msg) {
      if (LEVEL_RANK[threshold] > LEVEL_RANK.debug) return;
      writeRecord(options.stream, options.service, "debug", payload, msg, redactPaths);
    },
    info(payload, msg) {
      if (LEVEL_RANK[threshold] > LEVEL_RANK.info) return;
      writeRecord(options.stream, options.service, "info", payload, msg, redactPaths);
    },
    warn(payload, msg) {
      if (LEVEL_RANK[threshold] > LEVEL_RANK.warn) return;
      writeRecord(options.stream, options.service, "warn", payload, msg, redactPaths);
    },
  };
}
