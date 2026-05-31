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

/** The model is (deterministically) refusing — surfaced as a 500. */
export class ModelError extends AppError {
  constructor(message: string, requestId?: string) {
    super("model_error", message, 500, requestId);
    this.name = "ModelError";
  }
}

/** The model is (deterministically) overloaded — surfaced as a 429. */
export class ModelOverloadedError extends AppError {
  constructor(message: string, requestId?: string) {
    super("model_overloaded", message, 429, requestId);
    this.name = "ModelOverloadedError";
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
