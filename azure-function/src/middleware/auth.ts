import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { getConfig } from "../utils/config";

/** Thrown for authentication (401) and authorization (403) failures. */
export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
  }
}

/** Identity derived ONLY from a validated access token. Never from client input. */
export interface AuthContext {
  oid: string; // Entra object id of the signed-in customer
  scopes: string[];
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks() {
  // jose caches keys and refreshes on key rotation (unknown kid).
  jwks ??= createRemoteJWKSet(new URL(getConfig().ENTRA_JWKS_URI));
  return jwks;
}

export async function authenticate(req: HttpRequest): Promise<AuthContext> {
  const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError(401, "Missing bearer token");
  }

  const cfg = getConfig();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: cfg.ENTRA_ISSUER.split(",").map((i) => i.trim()).filter(Boolean),
      // v2 tokens carry the API's client id as 'aud'; accept the api:// form too.
      audience: [cfg.ENTRA_AUDIENCE, `api://${cfg.ENTRA_AUDIENCE}`],
      algorithms: ["RS256"],
      clockTolerance: 30,
    }));
  } catch {
    // Deliberately generic: don't leak why validation failed.
    throw new AuthError(401, "Invalid or expired token");
  }

  if (typeof payload.oid !== "string" || payload.oid.length === 0) {
    throw new AuthError(401, "Token has no subject identity");
  }

  const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
  if (!scopes.includes(cfg.ENTRA_REQUIRED_SCOPE)) {
    throw new AuthError(403, "Insufficient scope");
  }

  return { oid: payload.oid, scopes };
}

/** Maps an AuthError to an HTTP response; returns undefined for non-auth errors. */
export function authErrorResponse(err: unknown): HttpResponseInit | undefined {
  if (!(err instanceof AuthError)) return undefined;
  return {
    status: err.status,
    headers: err.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
    jsonBody: { error: err.status === 401 ? "unauthorized" : "forbidden", message: err.message },
  };
}
