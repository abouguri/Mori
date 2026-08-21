import { renderClozeField } from "./cloze";
import { stripTags } from "./html-utils";

type Node =
  | { kind: "text"; value: string }
  | { kind: "tag"; filters: string[]; name: string }
  | { kind: "section"; name: string; negate: boolean; children: Node[] }
  | { kind: "frontside" };

export interface RenderContext {
  fields: Record<string, string>;
  tags?: string[];
  noteTypeName?: string;
  deckName?: string;
  subdeckName?: string;
  cardName?: string;
  cardFlag?: string;
  /** The active cloze number for this card, if the note type is Cloze. */
  clozeNumber?: number;
  /** Which side is being rendered — the `{{cloze:Field}}` tag reveals differently on each. */
  side?: "question" | "answer";
  /** Only set on the answer template — the already-rendered question HTML. */
  frontSideHtml?: string;
}

const SPECIAL_FIELDS = new Set(["Tags", "Type", "Deck", "Subdeck", "Card", "CardFlag"]);
const KNOWN_FILTERS = new Set(["text", "hint", "cloze", "type"]);

// Tag contents never contain literal braces, so splitting on the {{...}}
// delimiter with a non-greedy match is safe — unlike cloze spans embedded in
// field content (see cloze.ts), template tags don't nest.
const TAG_RE = /\{\{(.*?)\}\}/g;

function tokenize(template: string): Array<{ type: "text"; value: string } | { type: "tag"; raw: string }> {
  const tokens: Array<{ type: "text"; value: string } | { type: "tag"; raw: string }> = [];
  let lastIndex = 0;
  for (const match of template.matchAll(TAG_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ type: "text", value: template.slice(lastIndex, index) });
    tokens.push({ type: "tag", raw: match[1] ?? "" });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < template.length) tokens.push({ type: "text", value: template.slice(lastIndex) });
  return tokens;
}

export function parseTemplate(template: string): Node[] {
  const tokens = tokenize(template);
  const root: Node[] = [];
  const stack: Array<{ name: string; negate: boolean; children: Node[] }> = [];

  const currentChildren = () => (stack.length === 0 ? root : stack[stack.length - 1]!.children);

  for (const token of tokens) {
    if (token.type === "text") {
      currentChildren().push({ kind: "text", value: token.value });
      continue;
    }

    const raw = token.raw;
    if (raw.startsWith("#") || raw.startsWith("^")) {
      const name = raw.slice(1);
      stack.push({ name, negate: raw.startsWith("^"), children: [] });
      continue;
    }
    if (raw.startsWith("/")) {
      const name = raw.slice(1);
      const openIndex = [...stack.keys()].reverse().find((i) => stack[i]!.name === name);
      if (openIndex === undefined) {
        // Unmatched close tag — render literally rather than dropping content.
        currentChildren().push({ kind: "text", value: `{{${raw}}}` });
        continue;
      }
      while (stack.length > openIndex) {
        const closed = stack.pop();
        if (!closed) break;
        const parent = stack.length === 0 ? root : stack[stack.length - 1]!.children;
        parent.push({ kind: "section", name: closed.name, negate: closed.negate, children: closed.children });
      }
      continue;
    }
    if (raw === "FrontSide") {
      currentChildren().push({ kind: "frontside" });
      continue;
    }

    const parts = raw.split(":");
    const name = parts[parts.length - 1] ?? "";
    const filters = parts.slice(0, -1);
    currentChildren().push({ kind: "tag", filters, name });
  }

  // Any sections still open at the end of the template are unterminated —
  // treat their content as if the section tags were never there.
  while (stack.length > 0) {
    const open = stack.pop();
    if (!open) break;
    const parent = stack.length === 0 ? root : stack[stack.length - 1]!.children;
    parent.push(...open.children);
  }

  return root;
}

function isNonEmpty(name: string, ctx: RenderContext): boolean {
  if (name === "Tags") return (ctx.tags ?? []).length > 0;
  if (SPECIAL_FIELDS.has(name)) return resolveSpecial(name, ctx).trim().length > 0;
  return (ctx.fields[name] ?? "").trim().length > 0;
}

function resolveSpecial(name: string, ctx: RenderContext): string {
  switch (name) {
    case "Tags":
      return (ctx.tags ?? []).join(" ");
    case "Type":
      return ctx.noteTypeName ?? "";
    case "Deck":
      return ctx.deckName ?? "";
    case "Subdeck":
      return ctx.subdeckName ?? "";
    case "Card":
      return ctx.cardName ?? "";
    case "CardFlag":
      return ctx.cardFlag ?? "";
    default:
      return "";
  }
}

function applyFilter(filterName: string, value: string, fieldName: string, ctx: RenderContext): string {
  switch (filterName) {
    case "text":
      return stripTags(value);
    case "hint":
      // Anki uses an inline onclick handler; our cards render with no script
      // execution allowed (§09.4), so <details> gets the same click-to-reveal
      // UX natively. A deliberate, documented difference.
      return `<details class="hint"><summary>${fieldName}</summary>${value}</details>`;
    case "cloze":
      if (ctx.clozeNumber === undefined) return value;
      return renderClozeField(value, ctx.clozeNumber, ctx.side ?? "question");
    case "type":
      // Real typed-answer comparison needs interactive state the review
      // session (M4) owns; M3 renders the static structure only.
      return `<input type="text" class="type-answer" disabled>`;
    default:
      return value;
  }
}

function renderTag(node: Extract<Node, { kind: "tag" }>, ctx: RenderContext): string {
  const { filters, name } = node;

  // {{type:cloze:Field}} is Anki's own special combined tag, not generic
  // chaining of "type" then "cloze".
  if (filters.length === 2 && filters[0] === "type" && filters[1] === "cloze") {
    return `<input type="text" class="type-answer" disabled>`;
  }

  for (const filter of filters) {
    if (!KNOWN_FILTERS.has(filter)) return `unknown filter: ${filter}`;
  }

  const raw = SPECIAL_FIELDS.has(name) ? resolveSpecial(name, ctx) : (ctx.fields[name] ?? "");
  return filters.reduceRight((value, filter) => applyFilter(filter, value, name, ctx), raw);
}

export function renderNodes(nodes: Node[], ctx: RenderContext): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return node.value;
        case "frontside":
          return ctx.frontSideHtml ?? "";
        case "tag":
          return renderTag(node, ctx);
        case "section": {
          const active = node.negate ? !isNonEmpty(node.name, ctx) : isNonEmpty(node.name, ctx);
          return active ? renderNodes(node.children, ctx) : "";
        }
      }
    })
    .join("");
}

export function render(template: string, ctx: RenderContext): string {
  return renderNodes(parseTemplate(template), ctx);
}
