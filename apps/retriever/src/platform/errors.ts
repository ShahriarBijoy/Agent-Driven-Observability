import type { ErrorResponse } from "@obs/contracts";

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503;

/** Base class for errors that map cleanly onto an HTTP status + error code. */
export class AppError extends Error {
  readonly code: string;
  readonly status: HttpStatus;
  readonly requestId: string | undefined;

  constructor(code: string, message: string, status: HttpStatus = 500, requestId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, requestId?: string) {
    super("upstream_error", message, 502, requestId);
    this.name = "UpstreamError";
  }
}

/** 503 — the retriever is in a simulated outage (Phase-6 chaos control plane). */
export class ServiceUnavailableError extends AppError {
  constructor(message = "retriever is unavailable", requestId?: string) {
    super("service_unavailable", message, 503, requestId);
    this.name = "ServiceUnavailableError";
  }
}

export function toErrorResponse(err: AppError): ErrorResponse {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.requestId ? { requestId: err.requestId } : {}),
    },
  };
}
