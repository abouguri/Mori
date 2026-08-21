import { api } from "@/lib/api/client";
import { db, type BufferedAnswer, type CachedCard } from "@/lib/db/schema";

const PREFETCH_LIMIT = 50;

/**
 * Fetches the next batch of cards (§M6: "Dexie prefetch of the next 50
 * cards + media") plus every referenced media file's bytes, replacing
 * whatever was previously cached for this deck. Call this while online, at
 * the start of a session — everything after that can run offline.
 */
export async function prefetchSession(deckId: string): Promise<void> {
  const [cards, mediaList] = await Promise.all([
    api.previewStudyBatch(deckId, PREFETCH_LIMIT),
    api.listMedia(),
  ]);

  await db.cards.where("deckId").equals(deckId).delete();
  await db.cards.bulkPut(
    cards.map((data, position): CachedCard => ({ id: data.id, deckId, position, data })),
  );

  const alreadyCached = new Set(await db.media.toCollection().primaryKeys());
  await Promise.all(
    mediaList
      .filter((m) => !alreadyCached.has(m.filename))
      .map(async (m) => {
        try {
          const response = await fetch(m.url);
          const blob = await response.blob();
          await db.media.put({ filename: m.filename, blob });
        } catch {
          // Best-effort — a card missing one image still renders its text.
        }
      }),
  );
}

export async function getCachedQueue(deckId: string): Promise<CachedCard[]> {
  return db.cards.where("deckId").equals(deckId).sortBy("position");
}

export async function removeCachedCard(cardId: string): Promise<void> {
  await db.cards.delete(cardId);
}

/** Object URLs for every cached media blob — call revokeOfflineMediaUrls() when done with them. */
export async function loadOfflineMediaUrls(): Promise<Map<string, string>> {
  const rows = await db.media.toArray();
  return new Map(rows.map((r) => [r.filename, URL.createObjectURL(r.blob)]));
}

export function revokeOfflineMediaUrls(urls: Map<string, string>): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

export async function queueAnswer(answer: Omit<BufferedAnswer, "createdAt">): Promise<void> {
  await db.answerBuffer.put({ ...answer, createdAt: Date.now() });
}

export async function pendingAnswerCount(): Promise<number> {
  return db.answerBuffer.count();
}

/**
 * Replays buffered answers in the order they were given. Stops early if a
 * failure looks like "still offline" (rather than retrying forever against
 * a request that will never succeed); other failures are skipped over so
 * one bad entry can't block the rest, and left in the buffer for next time.
 */
export async function replayBufferedAnswers(): Promise<{ synced: number; remaining: number }> {
  const pending = await db.answerBuffer.orderBy("createdAt").toArray();
  let synced = 0;

  for (const answer of pending) {
    try {
      await api.answerCard(
        answer.cardId,
        answer.deckId,
        answer.rating,
        answer.durationMs,
        answer.idempotencyKey,
      );
      await db.answerBuffer.delete(answer.idempotencyKey);
      synced += 1;
    } catch {
      if (!navigator.onLine) break;
      // Non-network failure (e.g. the card no longer exists) — leave it
      // buffered rather than lose it silently, but don't let it block
      // the rest of the queue.
    }
  }

  const remaining = await pendingAnswerCount();
  return { synced, remaining };
}
