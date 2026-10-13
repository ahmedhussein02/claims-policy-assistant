import { config } from "../config";

export class ClaimsApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(`Claims API ${status} ${code}`); }
}

export interface ClaimSummary { claimId: string; claimType: string; status: string; submittedDate: string }
export interface ClaimDetail extends ClaimSummary { requiredDocuments: string[]; nextStep: string; updatedAt: string }
export interface ClaimsPage { items: ClaimSummary[]; totalItems: number; page: number; totalPages: number }

/** Calls the secured Claims API with the USER's token: ownership is enforced there, never in the bot or the LLM. */
async function call<T>(token: string, path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000) // a paused serverless database can take a while to resume;
  try {
    const res = await fetch(`${config.CLAIMS_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ClaimsApiError(res.status, body.error ?? "error");
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ClaimsApiError) throw e;
    throw new ClaimsApiError(0, "unreachable"); // network/timeout
  } finally {
    clearTimeout(timer);
  }
}

export const listClaims = (token: string, opts: { status?: string; pageSize?: number } = {}) => {
  const qs = new URLSearchParams({ page: "1", pageSize: String(opts.pageSize ?? 10) });
  if (opts.status) qs.set("status", opts.status);
  return call<ClaimsPage>(token, `/claims?${qs}`);
};
export const getClaim = (token: string, claimId: string) => call<ClaimDetail>(token, `/claims/${encodeURIComponent(claimId)}`);
