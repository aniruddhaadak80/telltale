/**
 * One error envelope for every API surface, so the UI, curl and the agent all
 * receive the same shape. Internal detail never leaks: stack traces and
 * environment values are never serialised.
 */

import { ValidationError } from "./validation";

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "gone"
  | "rate_limited"
  | "source_unavailable"
  | "idempotency_conflict"
  | "integrity_failed"
  | "internal";

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    details?: Record<string, string>;
  };
}

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  not_found: 404,
  conflict: 409,
  gone: 410,
  rate_limited: 429,
  source_unavailable: 502,
  idempotency_conflict: 409,
  integrity_failed: 409,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly field?: string;
  readonly details?: Record<string, string>;

  constructor(code: ErrorCode, message: string, field?: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.field = field;
    this.details = details;
  }

  static notFound(message = "resource not found"): ApiError {
    return new ApiError("not_found", message);
  }

  static conflict(message: string): ApiError {
    return new ApiError("conflict", message);
  }

  static badRequest(message: string, field?: string): ApiError {
    return new ApiError("bad_request", message, field);
  }

  static integrity(message: string): ApiError {
    return new ApiError("integrity_failed", message);
  }

  toEnvelope(): ErrorEnvelope {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.field ? { field: this.field } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ValidationError) {
    return new ApiError("validation_failed", error.message, error.field, error.details);
  }
  // Logged server-side so an operator can diagnose it. Nothing about the message
  // reaches the client.
  console.error("[telltale:api] unhandled error:", error);
  return new ApiError("internal", "an unexpected error occurred");
}

export function errorResponse(error: unknown): Response {
  const apiError = toApiError(error);
  return Response.json(apiError.toEnvelope(), {
    status: apiError.status,
    headers: { "cache-control": "no-store" },
  });
}