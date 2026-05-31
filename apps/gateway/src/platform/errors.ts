import type { ErrorResponse } from "@obs/contracts";

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504;

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

/** 401 — missing or invalid bearer token. */
export class UnauthorizedError extends AppError {
  constructor(message = "missing or invalid bearer token", requestId?: string) {
    super("unauthorized", message, 401, requestId);
    this.name = "UnauthorizedError";
  }
}

/** 429 — tenant token bucket exhausted. */
export class RateLimitedError extends AppError {
  constructor(message = "rate limit exceeded", requestId?: string) {
    super("rate_limited", message, 429, requestId);
    this.name = "RateLimitedError";
  }
}

/** 504 — an upstream call exceeded UPSTREAM_TIMEOUT_MS. */
export class UpstreamTimeoutError extends AppError {
  constructor(message = "upstream request timed out", requestId?: string) {
    super("upstream_timeout", message, 504, requestId);
    this.name = "UpstreamTimeoutError";
  }
}

/** 429 — the model-proxy reported it is overloaded; propagate verbatim. */
export class ModelOverloadedError extends AppError {
  constructor(message = "model is overloaded", requestId?: string) {
    super("model_overloaded", message, 429, requestId);
    this.name = "ModelOverloadedError";
  }
}

/** 502 — any other upstream non-2xx or network failure. */
export class UpstreamError extends AppError {
  constructor(message = "upstream request failed", requestId?: string) {
    super("upstream_error", message, 502, requestId);
    this.name = "UpstreamError";
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
