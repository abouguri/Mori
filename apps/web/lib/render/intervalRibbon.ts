import { type Card as FsrsCard, createEmptyCard, fsrs, generatorParameters } from "ts-fsrs";
import type { PreviewCard } from "@/lib/api/client";

// Client-side PREVIEW only (§08.1) — the value actually written is always
// the server's. Same default weights as the server's fsrs.Scheduler(), and
// fuzz off by default in this library already, so the preview should match
// the server's real answer in the common case.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export interface RatingPreview {
  rating: 1 | 2 | 3 | 4;
  dueDate: Date;
  intervalMs: number;
}

function toFsrsCard(card: PreviewCard, now: Date): FsrsCard {
  if (card.state === 0) return createEmptyCard(now);
  return {
    due: card.due ? new Date(card.due) : now,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

export function previewIntervals(card: PreviewCard, now: Date = new Date()): RatingPreview[] {
  const result = scheduler.repeat(toFsrsCard(card, now), now);
  return ([1, 2, 3, 4] as const).map((rating) => {
    const due = result[rating].card.due;
    return { rating, dueDate: due, intervalMs: due.getTime() - now.getTime() };
  });
}

export function formatInterval(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(days / 365)}y`;
}
