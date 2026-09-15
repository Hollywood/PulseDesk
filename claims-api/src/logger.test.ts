import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpLogger, createLogger } from "./logger.js";

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

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("structured logger", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("emits JSON records with stable service metadata and redacts secrets", () => {
    const capture = captureLogs();
    const logger = createLogger({ level: "info", stream: capture.stream });

    logger.info(
      { event: "credential_check", authorization: "Bearer secret", cookie: "session=secret" },
      "checked credentials",
    );

    expect(capture.lines).toHaveLength(1);
    const record = JSON.parse(capture.lines[0] ?? "{}") as Record<string, unknown>;
    expect(record).toMatchObject({
      level: 30,
      service: "claims-api",
      event: "credential_check",
      authorization: "[Redacted]",
      cookie: "[Redacted]",
      msg: "checked credentials",
    });
    expect(record.time).toEqual(expect.any(String));
  });

  it("logs request outcomes with correlation IDs but omits query values", async () => {
    const capture = captureLogs();
    const logger = createLogger({ level: "info", stream: capture.stream });
    const app = express();
    app.use(createHttpLogger(logger));
    app.get("/example", (_req, res) => res.status(200).json({ ok: true }));

    const running = await new Promise<{ server: Server; baseUrl: string }>((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
      });
    });
    servers.push(running.server);

    const response = await fetch(`${running.baseUrl}/example?token=do-not-log`, {
      headers: { "x-request-id": "readiness-test-123" },
    });
    await response.text();

    expect(response.headers.get("x-request-id")).toBe("readiness-test-123");
    expect(capture.lines).toHaveLength(1);
    const record = JSON.parse(capture.lines[0] ?? "{}") as {
      req: Record<string, unknown>;
      res: Record<string, unknown>;
      [key: string]: unknown;
    };
    expect(record).toMatchObject({
      level: 30,
      service: "claims-api",
      event: "http_request_completed",
      req: {
        id: "readiness-test-123",
        method: "GET",
        path: "/example",
      },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
      msg: "request completed",
    });
    expect(JSON.stringify(record)).not.toContain("do-not-log");
  });
});
