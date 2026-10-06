/**
 * Deterministic, structure-aware Markdown chunker.
 *  - H1 = document title. H2/H3 headings define sections; a chunk never crosses a section boundary.
 *  - Each chunk is prefixed with "<title> — <section path>" so the heading context is embedded with the text.
 *  - Oversized sections are split on line/sentence boundaries and packed up to the size limit,
 *    with a word-aligned overlap carried between consecutive pieces of the SAME section.
 *  - Size is estimated at ~4 characters per token (no tokenizer dependency, fully deterministic).
 */
export interface ChunkOptions {
  chunkSizeTokens: number;
  overlapTokens: number;
}

export interface Chunk {
  id: string; // e.g. "appeals-002" (stable across runs)
  documentId: string; // file name without extension
  documentTitle: string; // from the H1
  sourceFile: string; // e.g. "appeals.md"
  section: string; // e.g. "Appeals > How to appeal"
  chunkIndex: number;
  content: string; // heading prefix + text (this is what gets embedded)
}

const CHARS_PER_TOKEN = 4;
export const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

interface Section { path: string; body: string }

function parseSections(markdown: string): { title: string; sections: Section[] } {
  let title = "";
  const stack: string[] = [];
  const sections: Section[] = [];
  let current: string[] = [];
  let path = "Overview";
  let inFence = false;

  const flush = () => {
    const body = current.join("\n").trim();
    if (body) sections.push({ path, body });
    current = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (/^```/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (!m) { current.push(line); continue; }

    const level = Math.max(m[1].length, 2);
    if (m[1].length === 1 && !title) { title = m[2].trim(); continue; }
    flush();
    stack.length = level - 2; // drop deeper headings
    stack[level - 2] = m[2].trim();
    path = stack.filter(Boolean).join(" > ");
  }
  flush();
  return { title, sections };
}

/** Break text into pieces no longer than maxChars, preferring lines, then sentences. */
function shrink(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  if (lines.length > 1) return lines.flatMap((l) => shrink(l, maxChars));
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) return sentences.flatMap((s) => shrink(s, maxChars));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
}

function tailForOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return overlapChars <= 0 ? "" : text;
  const tail = text.slice(-overlapChars);
  const firstSpace = tail.indexOf(" ");
  return (firstSpace >= 0 ? tail.slice(firstSpace + 1) : tail).trim();
}

function splitSection(body: string, opts: ChunkOptions): string[] {
  const maxChars = opts.chunkSizeTokens * CHARS_PER_TOKEN;
  if (body.length <= maxChars) return [body];

  const pieces = body.split(/\n{2,}/).flatMap((p) => shrink(p.trim(), maxChars)).filter(Boolean);
  const packed: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 1 > maxChars) { packed.push(buf); buf = piece; }
    else buf = buf ? `${buf}\n${piece}` : piece;
  }
  if (buf) packed.push(buf);

  const overlapChars = opts.overlapTokens * CHARS_PER_TOKEN;
  return packed.map((text, i) => {
    if (i === 0) return text;
    const overlap = tailForOverlap(packed[i - 1], overlapChars);
    return overlap ? `${overlap}\n${text}` : text;
  });
}

export function chunkMarkdown(sourceFile: string, markdown: string, opts: ChunkOptions): Chunk[] {
  const documentId = sourceFile.replace(/\.[^.]+$/, "");
  const { title, sections } = parseSections(markdown);
  const documentTitle = title || documentId;
  const chunks: Chunk[] = [];

  for (const section of sections) {
    for (const text of splitSection(section.body, opts)) {
      const chunkIndex = chunks.length;
      chunks.push({
        id: `${documentId}-${String(chunkIndex).padStart(3, "0")}`,
        documentId,
        documentTitle,
        sourceFile,
        section: section.path,
        chunkIndex,
        content: `${documentTitle} — ${section.path}\n\n${text}`,
      });
    }
  }
  return chunks;
}
