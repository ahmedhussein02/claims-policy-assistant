import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import sql from "mssql";
import { ZodError } from "zod";
import { AuthError, authErrorResponse } from "../middleware/auth";

/** An error whose message is safe to show to the client. */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function toErrorResponse(err: unknown, ctx: InvocationContext): HttpResponseInit {
  const auth = authErrorResponse(err);
  if (auth) return auth;

  if (err instanceof ApiError) {
    return { status: err.status, jsonBody: { error: err.code, message: err.message } };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      jsonBody: {
        error: "invalid_request",
        message: "One or more request parameters are invalid.",
        details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };
  }

  // Log server-side only (never tokens, never connection strings); return a generic message.
  const e = err as any;
  ctx.error(`Unhandled error [${ctx.invocationId}]: ${e?.name ?? "Error"} ${e?.code ?? ""} ${e?.message ?? ""}`);
  if (err instanceof sql.MSSQLError) {
    return {
      status: 503,
      jsonBody: { error: "service_unavailable", message: "The data service is temporarily unavailable. Please retry.", requestId: ctx.invocationId },
    };
  }
  return {
    status: 500,
    jsonBody: { error: "internal_error", message: "An unexpected error occurred.", requestId: ctx.invocationId },
  };
}

/** Wraps a handler with uniform error mapping and security headers. */
export function withApi(fn: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>): HttpHandler {
  return async (req, ctx) => {
    let res: HttpResponseInit;
    try {
      res = await fn(req, ctx);
    } catch (err) {
      res = toErrorResponse(err, ctx);
    }
    return { ...res, headers: { ...SECURITY_HEADERS, ...(res.headers as Record<string, string> | undefined) } };
  };
}

export { AuthError };
