/**
 * Normalises user text BEFORE routing/validation so obfuscation can't dodge the rules:
 * NFKC folds look-alike forms (e.g. full-width letters); zero-width/bidi/control characters are removed
 * ("ig\u200Bnore previous instructions" becomes a plain, detectable phrase); whitespace is collapsed.
 */
export function sanitizeMessage(input: string): string {
  return input
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
