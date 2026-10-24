import { route as defaultRoute } from "./router/llmClassifier";
import type { RouteDecision, UnsupportedReason } from "./router/intentRouter";
import { answerPolicyQuestion, type RagResult } from "./services/ragService";
import * as claimsApi from "./services/claimsService";
import { ClaimsApiError, type ClaimDetail, type ClaimsPage } from "./services/claimsService";

export interface ChatResponse {
  conversationId: string;
  intent: RouteDecision["intent"];
  answer: string;
  sources: { documentTitle: string; section: string }[];
  fallback: boolean;
}
/** Internal trace for observability (step 10). Never sent to the client. */
export interface ChatTrace {
  intent: RouteDecision["intent"];
  routeMethod: RouteDecision["method"];
  routeReason: string;
  status: "success" | "fallback" | "error";
  errorType?: string;
  rag?: RagResult;
}
export interface ChatOutcome { response: ChatResponse; trace: ChatTrace }

export interface ChatDeps {
  route: (m: string) => Promise<RouteDecision>;
  answerPolicy: (q: string) => Promise<RagResult>;
  claims: { listClaims: typeof claimsApi.listClaims; getClaim: typeof claimsApi.getClaim };
}
export const defaultDeps: ChatDeps = { route: defaultRoute, answerPolicy: answerPolicyQuestion, claims: claimsApi };

const UNSUPPORTED_MESSAGES: Record<UnsupportedReason, string> = {
  greeting: "Hi! I can answer questions about our claims policies and show the status of your own claims. What would you like to know?",
  injection: "I can't help with that. I can answer policy questions or show your own claims.",
  other_user_data: "I can only show claims that belong to your account.",
  write_action: "I can't change or submit anything from chat. Please use the portal or contact support. I'm happy to explain how a process works.",
  off_topic: "I can help with our claims policies and with your own claims, but not with that topic. What would you like to know?",
  range_request: "I can only show claims that belong to your account, and I can't look up ranges. Ask about specific claim IDs (up to 3 at a time), or say \"show my claims\" to see your own.",
  too_many_claims: "I can look up up to 3 claims at a time. Which ones would you like to see, or say \"show my claims\" for your own list?",
  needs_clarification: "Could you clarify? Are you asking about our policies in general, or about one of your own claims (for example, \"What's the status of CLM-001?\")?",
};
const TROUBLE = "I'm having trouble answering right now. Please try again in a moment.";
const CLAIMS_TROUBLE = "I couldn't reach the claims service right now, so I can't show your claim information. Please try again in a moment.";

const formatDetail = (c: ClaimDetail) =>
  `Claim ${c.claimId} (${c.claimType}) is **${c.status}**, submitted on ${c.submittedDate}.\n` +
  `Required documents: ${c.requiredDocuments.length ? c.requiredDocuments.join(", ") : "none"}.\n` +
  `Next step: ${c.nextStep}`;

function formatList(p: ClaimsPage, status?: string): string {
  if (p.totalItems === 0) return status ? `You don't have any ${status} claims.` : "You don't have any claims on file.";
  const lines = p.items.map((c) => `- ${c.claimId} — ${c.claimType}, ${c.status}, submitted ${c.submittedDate}`);
  const more = p.totalItems > p.items.length ? `\nShowing the ${p.items.length} most recent of ${p.totalItems}.` : "";
  return `You have ${p.totalItems} ${status ? status + " " : ""}claim${p.totalItems === 1 ? "" : "s"}:\n${lines.join("\n")}${more}`;
}

async function answerClaim(token: string, d: RouteDecision, deps: ChatDeps): Promise<string> {
  try {
    if (d.claimIds && d.claimIds.length > 1) {
      // Each ID is fetched on its own, so ownership is checked per claim by the Claims API.
      const parts = await Promise.all(d.claimIds.map(async (id) => {
        try { return formatDetail(await deps.claims.getClaim(token, id)); }
        catch (e) {
          if (e instanceof ClaimsApiError && e.code === "access_denied") return `Claim ${id}: Access denied. It isn't available on your account.`;
          throw e;
        }
      }));
      return parts.join("\n\n");
    }
    if (d.claimId) return formatDetail(await deps.claims.getClaim(token, d.claimId));
    return formatList(await deps.claims.listClaims(token, { status: d.claimStatus }), d.claimStatus);
  } catch (e) {
    if (!(e instanceof ClaimsApiError)) throw e;
    if (e.status === 401) throw e; // token expired: let the endpoint return 401 so the client re-authenticates
    if (e.code === "access_denied") return "Access denied: I can only show claims that belong to your account.";
    if (e.code === "no_customer_profile") return "Your sign-in isn't linked to a customer profile yet. Please contact support.";
    throw e;
  }
}

export async function handleChat(
  input: { message: string; token: string; conversationId: string },
  deps: ChatDeps = defaultDeps
): Promise<ChatOutcome> {
  const decision = await deps.route(input.message);
  const base = { conversationId: input.conversationId, intent: decision.intent };
  const traceBase = { intent: decision.intent, routeMethod: decision.method, routeReason: decision.reason };

  try {
    if (decision.intent === "UNSUPPORTED") {
      const reason = decision.unsupportedReason ?? "needs_clarification";
      return {
        response: { ...base, answer: UNSUPPORTED_MESSAGES[reason], sources: [], fallback: true },
        trace: { ...traceBase, status: "fallback" },
      };
    }

    if (decision.intent === "CLAIM_QUERY") {
      const answer = await answerClaim(input.token, decision, deps);
      return { response: { ...base, answer, sources: [], fallback: false }, trace: { ...traceBase, status: "success" } };
    }

    const rag = await deps.answerPolicy(input.message);
    return {
      response: {
        ...base,
        answer: rag.answer,
        sources: rag.sources.map((s) => ({ documentTitle: s.documentTitle, section: s.section })),
        fallback: rag.status === "fallback",
      },
      trace: { ...traceBase, status: rag.status, rag },
    };
  } catch (e) {
    if (e instanceof ClaimsApiError && e.status === 401) throw e;
    // Upstream failure: friendly message to the user, details only in the trace/logs (no secrets, no stack to the client).
    const errorType = e instanceof ClaimsApiError ? `claims_api_${e.code}` : (e as Error)?.name ?? "Error";
    console.error(`chat error [${errorType}]`, (e as Error)?.message);
    return {
      response: { ...base, answer: e instanceof ClaimsApiError ? CLAIMS_TROUBLE : TROUBLE, sources: [], fallback: true },
      trace: { ...traceBase, status: "error", errorType },
    };
  }
}
