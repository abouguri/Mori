import katex from "katex";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Finds the `<span class="latex-inline/latex-block">` placeholders that
 * `@mori/renderer`'s `rewriteLatex` leaves behind and replaces each with
 * KaTeX-rendered markup — pure HTML/CSS, no script, so it's safe to hand to
 * the sandboxed card iframe afterward (§09.3/§09.4). Runs in the host page,
 * never inside the sandbox, since KaTeX itself needs to execute.
 *
 * Unparseable TeX renders its raw source in a mono error box rather than
 * being swallowed, per §09.3.
 */
export function hydrateLatex(html: string): string {
  if (!html.includes("latex-inline") && !html.includes("latex-block")) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll<HTMLElement>(".latex-inline, .latex-block").forEach((el) => {
    const tex = el.textContent ?? "";
    const displayMode = el.classList.contains("latex-block");
    try {
      el.innerHTML = katex.renderToString(tex, { throwOnError: true, displayMode });
    } catch {
      el.innerHTML = `<span class="latex-error"><pre>${escapeHtml(tex)}</pre></span>`;
    }
  });
  return doc.body.innerHTML;
}
