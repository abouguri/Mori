import Dexie, { type Table } from "dexie";
import type { PreviewCard } from "@/lib/api/client";

/** One prefetched card, in queue order, for a specific deck's session. */
export interface CachedCard {
  id: string; // card id — primary key
  deckId: string;
  position: number; // order within the prefetched batch
  data: PreviewCard;
}

/** A media file's bytes, cached so CardFrame can render fully offline. */
export interface CachedMedia {
  filename: string; // primary key
  blob: Blob;
}

/**
 * An answer the user gave while offline (or while a live call failed),
 * waiting to be replayed. `idempotencyKey` is generated client-side at
 * answer time and reused verbatim on replay — the server dedupes on it
 * (§08.2), so a replay that partially succeeds and gets retried can't
 * double-score a card.
 */
export interface BufferedAnswer {
  idempotencyKey: string; // primary key
  cardId: string;
  deckId: string;
  rating: 1 | 2 | 3 | 4;
  durationMs: number;
  answeredAt: string;
  createdAt: number; // Date.now() — replay order
}

class MoriDB extends Dexie {
  cards!: Table<CachedCard, string>;
  media!: Table<CachedMedia, string>;
  answerBuffer!: Table<BufferedAnswer, string>;

  constructor() {
    super("mori");
    this.version(1).stores({
      cards: "id, deckId, position",
      media: "filename",
      answerBuffer: "idempotencyKey, createdAt",
    });
  }
}

export const db = new MoriDB();
