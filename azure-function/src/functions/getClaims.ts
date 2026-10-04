import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { CLAIM_STATUSES, listClaims, resolveUserId } from "../services/claimsService";
import { ApiError, withApi } from "../utils/http";
import { getConfig } from "../utils/config";

function listQuerySchema() {
  const cfg = getConfig();
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(cfg.MAX_PAGE_SIZE).default(cfg.DEFAULT_PAGE_SIZE),
    // Accept any casing ("in review"), normalise to the canonical value.
    status: z.preprocess(
      (v) => (typeof v === "string" ? CLAIM_STATUSES.find((s) => s.toLowerCase() === v.toLowerCase()) ?? v : v),
      z.enum(CLAIM_STATUSES).optional()
    ),
  });
}

export async function getClaims(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = await authenticate(req); // 401/403 thrown here
  const query = listQuerySchema().parse(Object.fromEntries(req.query.entries())); // 400 thrown here

  // Identity comes from the validated token only; no user id is ever read from the request.
  const userId = await resolveUserId(auth.oid);
  if (userId === null) {
    throw new ApiError(403, "no_customer_profile", "No customer profile is linked to this account.");
  }

  return { status: 200, jsonBody: await listClaims(userId, query) };
}

app.http("getClaims", {
  methods: ["GET"],
  authLevel: "anonymous", // we validate the Entra JWT ourselves; Function keys are not used
  route: "claims",
  handler: withApi(getClaims),
});
