import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Writes a deterministic structured trace artifact. Content is derived only
 * from pure trace data, so repeated runs produce byte-identical files.
 */
export function writeTraceEvidence(directory: string, payload: unknown): string {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "claims-trace-evidence.json");
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}
