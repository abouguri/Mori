const SRC_ATTR_RE = /(<(?:img|audio|video|source)\b[^>]*?\bsrc=)(["'])([^"']*)\2/gi;
const SOUND_TAG_RE = /\[sound:([^\]]+)]/g;
const CSS_URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

function isExternal(ref: string): boolean {
  return /^([a-z]+:)?\/\//i.test(ref) || ref.startsWith("data:");
}

/**
 * Rewrites `<img src>`/`<audio src>`/`<video src>`/`<source src>` and
 * `[sound:file]` tags to resolved media URLs. `[sound:]` becomes a native
 * `<audio controls>` element rather than a scripted play button — the card
 * renders inside a `sandbox` iframe with no `allow-scripts` (§09.4), so
 * native controls are what "a play button" can mean here.
 */
export function rewriteMedia(html: string, resolve: (filename: string) => string): string {
  const withSrc = html.replace(SRC_ATTR_RE, (match, prefix, quote, filename) => {
    if (isExternal(filename)) return match;
    return `${prefix}${quote}${resolve(filename)}${quote}`;
  });
  return withSrc.replace(SOUND_TAG_RE, (_match, filename) => {
    return `<audio controls src="${resolve(filename)}"></audio>`;
  });
}

/** Rewrites `url(...)` references inside a note type's CSS to resolved media URLs. */
export function rewriteCss(css: string, resolve: (filename: string) => string): string {
  return css.replace(CSS_URL_RE, (match, quote: string, filename: string) => {
    if (isExternal(filename)) return match;
    return `url(${quote}${resolve(filename)}${quote})`;
  });
}
