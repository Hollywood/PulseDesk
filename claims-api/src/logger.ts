import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import pino, { type DestinationStream, type Logger } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";

const SERVICE_NAME = "claims-api";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export interface LoggerOptions {
  level?: string;
  stream?: DestinationStream;
}

/** Creates the application logger with stable service metadata and secret redaction. */
export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      base: { service: SERVICE_NAME },
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "authorization",
          "cookie",
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']",
        ],
        censor: "[Redacted]",
      },
    },
    options.stream,
  );
}

function requestPath(url: string | undefined): string {
  return url?.split("?", 1)[0] ?? "";
}

/** Adds one completion log per request without recording headers or query values. */
export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    wrapSerializers: false,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const supplied = req.headers["x-request-id"];
      const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
      const requestId =
        candidate !== undefined && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
      res.setHeader("x-request-id", requestId);
      return requestId;
    },
    serializers: {
      req(req: IncomingMessage) {
        return {
          id: req.id,
          method: req.method,
          path: requestPath(req.url),
          remoteAddress: req.socket.remoteAddress,
        };
      },
      res(res: ServerResponse) {
        return { statusCode: res.statusCode };
      },
      err: pino.stdSerializers.err,
    },
    customProps: () => ({ event: "http_request_completed" }),
    customLogLevel(_req, res, error) {
      if (error !== undefined || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: () => "request completed",
    customErrorMessage: () => "request failed",
  });
}

export type { Logger };
