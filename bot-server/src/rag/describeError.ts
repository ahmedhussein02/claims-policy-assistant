/** Flattens an error and its `cause` chain, e.g. "Connection error. <- ENOTFOUND getaddrinfo ENOTFOUND api.openai.com". */
export function describeError(e: unknown): string {
  const err = e as { message?: string; cause?: unknown; status?: number };
  const parts: string[] = [err?.status ? `[HTTP ${err.status}] ${err.message ?? ""}`.trim() : err?.message ?? String(e)];
  let cause = err?.cause as { code?: string; name?: string; message?: string; cause?: unknown } | undefined;
  for (let depth = 0; cause && depth < 5; depth++) {
    parts.push(`${cause.code ?? cause.name ?? ""} ${cause.message ?? ""}`.trim());
    cause = cause.cause as typeof cause;
  }
  return parts.join(" <- ");
}
