"use client";

import { renderAnswer, renderCardCss, renderQuestion } from "@mori/renderer";
import { useEffect, useState } from "react";
import type { PreviewCard } from "@/lib/api/client";
import { hydrateLatex } from "@/lib/render/hydrateLatex";

let katexCssCache: string | null = null;

async function loadKatexCss(selfOrigin: string): Promise<string> {
  if (katexCssCache) return katexCssCache;
  const response = await fetch("/katex/katex.min.css");
  const raw = await response.text();
  katexCssCache = raw.replace(/url\(fonts\//g, `url(${selfOrigin}/katex/fonts/`);
  return katexCssCache;
}

export function CardFrame({
  card,
  side,
  resolveMedia,
  mediaOrigin,
  heightClassName = "h-48",
}: {
  card: PreviewCard;
  side: "question" | "answer";
  resolveMedia: (filename: string) => string;
  mediaOrigin: string;
  // The sandboxed iframe (sandbox="", deliberately no allow-same-origin —
  // §09.4) can't report its real content height back to the parent: a
  // sandboxed-without-allow-same-origin iframe's contentDocument reads as
  // an empty stub from here, confirmed directly, not just assumed from the
  // spec. No auto-sizing is possible without weakening that sandbox, which
  // isn't worth trading away for a cosmetic fit. Callers that show one card
  // at a time (Study) keep the tighter default; Preview, which is for
  // skimming many cards in a row, passes a taller box instead.
  heightClassName?: string;
}) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      const selfOrigin = window.location.origin;
      const katexCss = await loadKatexCss(selfOrigin);

      const ctx = {
        fields: card.fields,
        tags: card.tags,
        latexPre: card.latex_pre,
        latexPost: card.latex_post,
        clozeNumber: card.cloze_number ?? undefined,
        resolveMedia,
      };

      const questionHtml = renderQuestion(card.question_format, ctx);
      const bodyHtmlRaw =
        side === "question" ? questionHtml : renderAnswer(card.answer_format, ctx, questionHtml);
      const bodyHtml = hydrateLatex(bodyHtmlRaw);
      const css = renderCardCss(card.css, resolveMedia);

      // §09.4's directive plus font-src widened to our own origin: KaTeX's
      // fonts are served from apps/web/public, not the media domain, and the
      // spec's original directive predates that detail.
      const csp = [
        "default-src 'none'",
        `img-src ${mediaOrigin}`,
        `media-src ${mediaOrigin}`,
        "style-src 'unsafe-inline'",
        `font-src ${selfOrigin}`,
      ].join("; ");

      // §10.5: on reveal, the divider draws left-to-right in 180ms and the
      // answer fades in behind it. The iframe's srcdoc is fully rebuilt on
      // reveal (question -> answer), so a plain load-time CSS animation on
      // the answer's own markup gives this "for free" without host<->iframe
      // messaging — the animation just plays once as the new document paints.
      const revealCss =
        side === "answer"
          ? `
  @media (prefers-reduced-motion: no-preference) {
    @keyframes divider-draw { from { width: 0; } to { width: 100%; } }
    @keyframes answer-fade { from { opacity: 0; } to { opacity: 1; } }
    hr { border: none; border-top: 1px solid currentColor; opacity: 0.25;
         width: 0; animation: divider-draw 180ms ease-out forwards; }
    body { animation: answer-fade 180ms ease-out 60ms backwards; }
  }`
          : "";

      const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${katexCss}</style>
<style>
  body { margin: 0; font-family: Arial, sans-serif; font-size: 20px; text-align: center; padding: 1.5rem; box-sizing: border-box; color: #07100A; }
  .cloze { color: #6B8F0F; font-weight: 600; }
  .hint summary { cursor: pointer; color: #003A0B; }
  .latex-error pre { color: #B23B2E; font-size: 13px; white-space: pre-wrap; }
  ${css}
  ${revealCss}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

      if (!cancelled) setSrcDoc(doc);
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [card, side, resolveMedia, mediaOrigin]);

  if (srcDoc === null) {
    return (
      <div
        className={`${heightClassName} w-full animate-pulse rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-slate)]`}
      />
    );
  }

  return (
    <iframe
      title={card.template_name}
      sandbox=""
      srcDoc={srcDoc}
      className={`${heightClassName} w-full overflow-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)]`}
    />
  );
}
