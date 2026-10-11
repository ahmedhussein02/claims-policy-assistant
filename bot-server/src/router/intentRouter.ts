/**
 * Intent router: decides WHICH data source a message may use. It never decides WHO the user is or what they may see:
 * it only receives message text, and CLAIM_QUERY merely triggers a call to the Claims API with the user's own token,
 * where ownership is enforced. Deterministic rules run first (free, fast, testable); an LLM classifier is used only
 * for messages the rules can't settle, and low-confidence results become a clarification, never a guess.
 */
export type Intent = "POLICY_QUERY" | "CLAIM_QUERY" | "UNSUPPORTED";
export type UnsupportedReason =
  | "greeting" | "injection" | "other_user_data" | "write_action" | "needs_clarification";
export const CLAIM_STATUSES = ["Submitted", "In Review", "Action Required", "Approved", "Rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface RouteDecision {
  intent: Intent;
  method: "rules" | "llm" | "default";
  reason: string; // short machine-readable explanation, safe to log
  claimId?: string; // CLM-001 form; extracted by regex, never by the LLM
  claimStatus?: ClaimStatus; // optional filter for "show my approved claims"
  unsupportedReason?: UnsupportedReason;
  confidence?: number;
}

export type Classifier = (message: string) => Promise<{ intent: Intent; confidence: number }>;
export const LLM_MIN_CONFIDENCE = 0.7;

const GREETING = /^\s*(hi|hello|hey|hiya|yo|thanks|thank you|thx|ok|okay|good (morning|afternoon|evening)|bye|goodbye)\b[\s!.,?]*$/i;
const INJECTION =
  /(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|your)\s+(instructions?|rules?|prompt|guidelines)|system\s+prompt|developer\s+(message|mode)|reveal\s+(your|the)\s+(prompt|instructions)|jailbreak|you\s+are\s+now\s|pretend\s+(to\s+be|you)/i;
const OTHER_USER = [
  /\b(all|every|each|other|another|any)\s+(customers?|users?|policyholders?|people|clients?)'?s?\s+(\w+\s+){0,2}claims?\b/i,
  /\b(?!my\b|what\b|that\b|it\b|there\b|here\b|who\b|how\b|where\b|let\b)[a-z]{2,}'s\s+(claims?|policy|policies)\b/i,
  /\buser\s*(id\s*)?#?\d+\b/i,
  /\ball\s+(the\s+)?claims\b/i,
  /\b(dump|export)\b.*\b(database|table|users|claims)\b/i,
];
const WRITE_ACTION =
  /^\s*(please\s+)?(can you\s+|could you\s+|i\s+(want|need|would like|'d like)\s+to\s+)?(file|submit|cancel|withdraw|update|change|edit|delete|upload|pay|reopen|close|escalate|approve|reject)\b/i;
const PERSONAL = /\b(my|mine|i have(?! to)|i've|i filed|i submitted)\b/i; // "do I have to appeal" is not possession
const CLAIM_WORD = /\bclaims?\b/i;
const DATA_CUES =
  /\b(status|update|updates|progress|where|pending|approved|rejected|denied|declined|in review|under review|action required|submitted|list|show|see|view|check|any|open|how many|next step|what'?s happening|missing|outstanding|latest|recent)\b/i;
const POLICY_LEXICON =
  /\b(coverage|covered|covers?|deductible|premium|limits?|exclusions?|excluded|policy|policies|appeals?|deadlines?|time limit|file a claim|submit a claim|how (do|can|to) i (file|submit|make|report)|required documents?|documents? (do i need|are required|needed|required)|what does .{1,40} mean|waiting period|beneficiary|adjuster|processing time|how long|how many days|reimburse\w*|payouts?|payments?)\b/i;

const STATUS_KEYWORDS: [RegExp, ClaimStatus][] = [
  [/\bapproved\b/i, "Approved"],
  [/\b(rejected|denied|declined)\b/i, "Rejected"],
  [/\b(in review|under review)\b/i, "In Review"],
  [/\baction required\b/i, "Action Required"],
  [/\bsubmitted\b/i, "Submitted"],
];

const normalize = (m: string) => m.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();

export function extractClaimIds(message: string): string[] {
  const ids = new Set<string>();
  for (const m of message.matchAll(/\bclm[-\s_]?(\d{3,6})\b/gi)) ids.add(`CLM-${m[1].padStart(3, "0")}`);
  return [...ids];
}

function extractStatus(message: string): ClaimStatus | undefined {
  const hits = STATUS_KEYWORDS.filter(([re]) => re.test(message)).map(([, s]) => s);
  return hits.length === 1 ? hits[0] : undefined; // only when unambiguous
}

const unsupported = (reason: UnsupportedReason, why: string, method: RouteDecision["method"] = "rules"): RouteDecision =>
  ({ intent: "UNSUPPORTED", method, reason: why, unsupportedReason: reason });

export async function routeIntent(rawMessage: string, classify?: Classifier): Promise<RouteDecision> {
  const message = normalize(rawMessage);
  if (!message) return unsupported("needs_clarification", "empty_message");

  if (GREETING.test(message)) return unsupported("greeting", "greeting");
  if (INJECTION.test(message)) return unsupported("injection", "prompt_injection_pattern");
  if (OTHER_USER.some((re) => re.test(message))) return unsupported("other_user_data", "other_user_or_bulk_data_request");
  if (WRITE_ACTION.test(message)) return unsupported("write_action", "write_action_requested");

  const ids = extractClaimIds(message);
  if (ids.length > 1) return unsupported("needs_clarification", "multiple_claim_ids");
  if (ids.length === 1) return { intent: "CLAIM_QUERY", method: "rules", reason: "claim_id_present", claimId: ids[0] };

  if (PERSONAL.test(message) && CLAIM_WORD.test(message) && DATA_CUES.test(message)) {
    return { intent: "CLAIM_QUERY", method: "rules", reason: "personal_claim_data_request", claimStatus: extractStatus(message) };
  }
  if (POLICY_LEXICON.test(message)) return { intent: "POLICY_QUERY", method: "rules", reason: "policy_terms" };

  // Rules can't settle it (e.g. other phrasing/languages): ask the classifier, trust only confident answers.
  if (classify) {
    try {
      const { intent, confidence } = await classify(message);
      if (confidence < LLM_MIN_CONFIDENCE) {
        return { ...unsupported("needs_clarification", "low_confidence", "llm"), confidence };
      }
      return {
        intent, method: "llm", reason: "llm_classification", confidence,
        ...(intent === "CLAIM_QUERY" ? { claimStatus: extractStatus(message) } : {}),
        ...(intent === "UNSUPPORTED" ? { unsupportedReason: "needs_clarification" as const } : {}),
      };
    } catch {
      // Classifier down: fall back to the lowest-risk path (public policy docs, protected data untouched).
    }
  }
  return { intent: "POLICY_QUERY", method: "default", reason: "classifier_unavailable_default" };
}
