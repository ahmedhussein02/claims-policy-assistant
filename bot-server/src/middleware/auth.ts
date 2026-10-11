import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config";

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) { super(message); }
}
/** Identity from a VALIDATED token only. `token` is kept solely to forward to the Claims API on the user's behalf. */
export interface AuthInfo { oid: string; token: string }

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function authenticate(authorization: string | undefined): Promise<AuthInfo> {
  const [scheme, token] = (authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) throw new AuthError(401, "Missing bearer token");

  jwks ??= createRemoteJWKSet(new URL(config.ENTRA_JWKS_URI));
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.ENTRA_ISSUER.split(",").map((i) => i.trim()).filter(Boolean),
      audience: [config.ENTRA_AUDIENCE, `api://${config.ENTRA_AUDIENCE}`],
      algorithms: ["RS256"],
      clockTolerance: 30,
    });
    const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
    if (typeof payload.oid !== "string" || !scopes.includes(config.ENTRA_REQUIRED_SCOPE)) {
      throw new AuthError(403, "Insufficient permissions");
    }
    return { oid: payload.oid, token };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(401, "Invalid or expired token"); // generic on purpose
  }
}
