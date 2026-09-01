"use client";

import Link from "next/link";
import type { DeckNode } from "@/lib/api/client";

export function DeckTree({
  decks,
  depth = 0,
  onDelete,
}: {
  decks: DeckNode[];
  depth?: number;
  onDelete: (deck: DeckNode) => void;
}) {
  if (decks.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {decks.map((deck) => (
        <li key={deck.id}>
          <div
            className="group flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 hover:bg-[var(--color-slate)]"
            style={{ paddingLeft: `${depth * 20 + 12}px` }}
          >
            <Link
              href={`/decks/${deck.id}`}
              className="flex items-center gap-2 font-[family-name:var(--font-ui)] text-[var(--color-ink)] hover:text-[var(--color-good)]"
            >
              {deck.name}
              {subtreeDueCount(deck) > 0 && (
                <span className="rounded-full bg-[var(--color-lime)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-good)]">
                  {subtreeDueCount(deck)} due
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => onDelete(deck)}
              className="font-mono text-xs text-[var(--color-muted)] opacity-0 hover:text-[var(--color-again)] group-hover:opacity-100"
            >
              delete
            </button>
          </div>
          <DeckTree decks={deck.children} depth={depth + 1} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}

/** Cards in this deck plus every descendant's — deleting a deck cascades to
 * its children (§06: decks.parent_id and cards.deck_id are both ON DELETE
 * CASCADE), so the confirmation copy needs the whole subtree's count, not
 * just this node's own card_count. */
export function subtreeCardCount(deck: DeckNode): number {
  return deck.card_count + deck.children.reduce((sum, child) => sum + subtreeCardCount(child), 0);
}

/** Studying a parent deck pulls from its whole subtree (queue_builder.py's
 * subtree_deck_ids), so "due" at the parent level should read the same way —
 * summed across children, not just this deck's own due_count. */
function subtreeDueCount(deck: DeckNode): number {
  return deck.due_count + deck.children.reduce((sum, child) => sum + subtreeDueCount(child), 0);
}
