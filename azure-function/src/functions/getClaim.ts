import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { authenticate } from "../middleware/auth";
import { getClaimForUser, resolveUserId } from "../services/claimsService";
import { ApiError, withApi } from "../utils/http";

const CLAIM_ID_PATTERN = /^CLM-\d{3,6}$/;

export async function getClaim(req: HttpRequest): Promise<HttpResponseInit> {
  const auth = await authenticate(req);

  const claimId = (req.params.claimId ?? "").toUpperCase();
  if (!CLAIM_ID_PATTERN.test(claimId)) {
    throw new ApiError(400, "invalid_claim_id", "Claim ID must look like CLM-001.");
  }

  const userId = await resolveUserId(auth.oid);
  if (userId === null) {
    throw new ApiError(403, "no_customer_profile", "No customer profile is linked to this account.");
  }

  const claim = await getClaimForUser(userId, claimId); // WHERE claim_id AND user_id
  if (!claim) {
    // Same response whether the claim belongs to someone else or doesn't exist,
    // so callers cannot probe which claim IDs exist.
    throw new ApiError(403, "access_denied", "Access denied.");
  }

  return { status: 200, jsonBody: claim };
}

app.http("getClaim", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "claims/{claimId}",
  handler: withApi(getClaim),
});
