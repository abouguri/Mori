export interface ClozeSpan {
  number: number;
  answer: string;
  hint?: string;
}

export type ClozeToken = { type: "text"; value: string } | { type: "cloze"; span: ClozeSpan };

/**
 * Scans a field's raw text for `{{cN::answer}}` / `{{cN::answer::hint}}` spans.
 *
 * Hand-written rather than a single regex: a regex anchored on the next `}}`
 * breaks the moment an answer contains a literal `::` or a nested `{{...}}`
 * (e.g. a typo, or a second cloze deletion accidentally typed inside the
 * first). This tracks brace depth so a nested `{{` only closes at its
 * matching `}}`, not the first one encountered.
 */
export function tokenizeCloze(field: string): ClozeToken[] {
  const tokens: ClozeToken[] = [];
  const n = field.length;
  let i = 0;
  let textStart = 0;

  while (i < n) {
    if (field.startsWith("{{c", i)) {
      let j = i + 3;
      const numStart = j;
      while (j < n && field.charAt(j) >= "0" && field.charAt(j) <= "9") j++;

      if (j > numStart && field.startsWith("::", j)) {
        const number = Number.parseInt(field.slice(numStart, j), 10);
        const contentStart = j + 2;

        let depth = 1;
        let k = contentStart;
        while (k < n && depth > 0) {
          if (field.startsWith("{{", k)) {
            depth++;
            k += 2;
          } else if (field.startsWith("}}", k)) {
            depth--;
            if (depth === 0) break;
            k += 2;
          } else {
            k++;
          }
        }

        if (depth === 0) {
          const inner = field.slice(contentStart, k);
          // The format has no escape for a literal "::" inside an answer —
          // the first remaining "::" is always read as the hint separator.
          const sep = inner.indexOf("::");
          const answer = sep === -1 ? inner : inner.slice(0, sep);
          const hint = sep === -1 ? undefined : inner.slice(sep + 2);

          if (textStart < i) tokens.push({ type: "text", value: field.slice(textStart, i) });
          tokens.push({ type: "cloze", span: { number, answer, hint } });

          i = k + 2;
          textStart = i;
          continue;
        }
      }
    }
    i++;
  }

  if (textStart < n) tokens.push({ type: "text", value: field.slice(textStart) });
  return tokens;
}

/** Distinct cloze numbers referenced across a note's fields, in ascending order. */
export function clozeNumbers(fields: string[]): number[] {
  const seen = new Set<number>();
  for (const field of fields) {
    for (const token of tokenizeCloze(field)) {
      if (token.type === "cloze") seen.add(token.span.number);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Renders one field's cloze content for a specific card's active cloze number.
 * The target number shows as `[...]`/`[hint]` on the question side or its
 * answer on the answer side, both wrapped in `<span class="cloze">`. Every
 * other cloze number renders as plain answer text (per §09.2).
 */
export function renderClozeField(
  field: string,
  targetNumber: number,
  side: "question" | "answer",
): string {
  return tokenizeCloze(field)
    .map((token) => {
      if (token.type === "text") return token.value;
      const { number, answer, hint } = token.span;
      if (number !== targetNumber) return answer;
      if (side === "answer") return `<span class="cloze">${answer}</span>`;
      return `<span class="cloze">[${hint ?? "..."}]</span>`;
    })
    .join("");
}
