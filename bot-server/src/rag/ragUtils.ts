/** Pure helpers for the RAG pipeline (no network), so they are easy to unit test. */

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  sourceFile: string;
  section: string;
  content: string;
  similarity: number; // cosine similarity between query and chunk embeddings
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Numbered context block; the numbers let the model cite which passage supports each statement. */
export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
}

/** Context numbers (1-based) that the model cited, e.g. "...30 days [2][3]" -> [2, 3]. */
export function parseCitedRefs(answer: string, max: number): number[] {
  const refs = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= max) refs.add(n);
  }
  return [...refs].sort((a, b) => a - b);
}

export const stripRefs = (answer: string) => answer.replace(/\s*\[\d+\]/g, "").trim();

/** Unique (document, section) pairs, preserving order. */
export function dedupeBySection<T extends { documentTitle: string; section: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = `${i.documentTitle}|${i.section}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export function formatSources(sources: { documentTitle: string; section: string }[]): string {
  return sources.length ? "Sources:\n" + sources.map((s) => `- ${s.documentTitle} — Section: ${s.section}`).join("\n") : "";
}
