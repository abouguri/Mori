import { escapeHtml } from "./html-utils";

const LATEX_TAG_RE = /\[latex]([\s\S]*?)\[\/latex]/g;
const LATEX_DISPLAY_RE = /\[\$\$]([\s\S]*?)\[\$\$]/g;
const LATEX_INLINE_RE = /\[\$]([\s\S]*?)\[\$]/g;

function wrap(kind: "inline" | "block", tex: string, pre: string, post: string): string {
  const source = `${pre}${tex}${post}`;
  const cls = kind === "inline" ? "latex-inline" : "latex-block";
  // Raw TeX source lives as escaped text content, not markup — the host
  // component (apps/web) reads .textContent and hands it to KaTeX
  // client-side (§09.3: Anki renders LaTeX to images server-side, we
  // deliberately don't).
  return `<span class="${cls}">${escapeHtml(source)}</span>`;
}

/**
 * Wraps `[latex]...[/latex]`, `[$$]...[$$]`, and `[$]...[$]` spans in the
 * note type's `latex_pre`/`latex_post`, ready for client-side KaTeX hydration.
 */
export function rewriteLatex(html: string, latexPre: string, latexPost: string): string {
  return html
    .replace(LATEX_TAG_RE, (_m, tex: string) => wrap("block", tex, latexPre, latexPost))
    .replace(LATEX_DISPLAY_RE, (_m, tex: string) => wrap("block", tex, latexPre, latexPost))
    .replace(LATEX_INLINE_RE, (_m, tex: string) => wrap("inline", tex, latexPre, latexPost));
}
