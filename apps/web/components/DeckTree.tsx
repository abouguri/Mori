"use client";

import type { DeckNode } from "@/lib/api/client";

export function DeckTree({
  decks,
  depth = 0,
  onDelete,
}: {
  decks: DeckNode[];
  depth?: number;
  onDelete: (id: string) => void;
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
            <span className="font-[family-name:var(--font-ui)] text-[var(--color-chalk)]">
              {deck.name}
            </span>
            <button
              type="button"
              onClick={() => onDelete(deck.id)}
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
