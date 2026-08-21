// The card iframe has no allow-scripts, so KaTeX's CSS + fonts must be
// served as plain static assets it can request directly (§09.3/§09.4) —
// this copies them into public/ where Next.js serves static files as-is.
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(require.resolve("katex/package.json"), "..", "dist");
const dest = path.join(__dirname, "..", "public", "katex");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(path.join(src, "katex.min.css"), path.join(dest, "katex.min.css"));
fs.cpSync(path.join(src, "fonts"), path.join(dest, "fonts"), { recursive: true });

console.log(`copied KaTeX assets to ${dest}`);
