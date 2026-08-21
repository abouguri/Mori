"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardFrame } from "@/components/CardFrame";
import { IntervalRibbon } from "@/components/IntervalRibbon";
import { api, ApiError, type MediaUrl, type PreviewCard, type QueueCounts } from "@/lib/api/client";

type Side = "question" | "answer";

const RATING_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
const RATING_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--color-again)",
  2: "var(--color-hard)",
  3: "var(--color-good)",
  4: "var(--color-easy)",
};

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function StudyPage() {
  const router = useRouter();
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;

  const [card, setCard] = useState<PreviewCard | null | undefined>(undefined);
  const [queue, setQueue] = useState<QueueCounts>({ new: 0, learning: 0, due: 0 });
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("question");
  const [hoveredRating, setHoveredRating] = useState<1 | 2 | 3 | 4 | null>(null);
  const [media, setMedia] = useState<MediaUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAnswered, setLastAnswered] = useState<PreviewCard | null>(null);

  const shownAtRef = useRef<number>(Date.now());
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    Promise.all([api.listMedia(), api.startStudySession(deckId)])
      .then(([mediaList, session]) => {
        setMedia(mediaList);
        setCard(session.card);
        setQueue(session.queue);
        setNextDue(session.next_due);
        shownAtRef.current = Date.now();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/login");
        else setError("Couldn't load this study session.");
      });
  }, [deckId, router]);

  const mediaByFilename = useMemo(() => new Map(media.map((m) => [m.filename, m.url])), [media]);
  const resolveMedia = useCallback(
    (filename: string) => mediaByFilename.get(filename) ?? filename,
    [mediaByFilename],
  );
  const [mediaOrigin, setMediaOrigin] = useState("");
  useEffect(() => {
    setMediaOrigin(media[0] ? new URL(media[0].url).origin : window.location.origin);
  }, [media]);

  const reveal = useCallback(() => {
    if (side === "question" && card) setSide("answer");
  }, [side, card]);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (side !== "answer" || !card || busy) return;
      setBusy(true);
      const durationMs = Date.now() - shownAtRef.current;
      const answeredCard = card;
      try {
        const response = await api.answerCard(
          answeredCard.id,
          deckId,
          rating,
          durationMs,
          idempotencyKeyRef.current,
        );
        idempotencyKeyRef.current = crypto.randomUUID();
        setLastAnswered(answeredCard);
        setSide("question");
        shownAtRef.current = Date.now();

        if (response.next === null) {
          // AnswerResponse has no next_due — re-fetch so the empty state
          // can say "Next card in 3 hours" instead of a bare "nothing due".
          const session = await api.startStudySession(deckId);
          setCard(session.card);
          setQueue(session.queue);
          setNextDue(session.next_due);
        } else {
          setCard(response.next);
          setQueue(response.queue);
        }
      } catch {
        setError("Couldn't save that answer. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [side, card, busy, deckId],
  );

  const undo = useCallback(async () => {
    if (!lastAnswered || busy) return;
    setBusy(true);
    try {
      const response = await api.undoAnswer(lastAnswered.id, deckId);
      setCard(lastAnswered);
      setQueue(response.queue);
      setSide("question");
      setLastAnswered(null);
      shownAtRef.current = Date.now();
    } catch {
      setError("Nothing to undo.");
    } finally {
      setBusy(false);
    }
  }, [lastAnswered, busy, deckId]);

  const suspend = useCallback(async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await api.suspendCard(card.id);
      const session = await api.startStudySession(deckId);
      setCard(session.card);
      setQueue(session.queue);
      setNextDue(session.next_due);
      setSide("question");
      shownAtRef.current = Date.now();
    } finally {
      setBusy(false);
    }
  }, [card, busy, deckId]);

  const bury = useCallback(async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await api.buryCard(card.id);
      const session = await api.startStudySession(deckId);
      setCard(session.card);
      setQueue(session.queue);
      setNextDue(session.next_due);
      setSide("question");
      shownAtRef.current = Date.now();
    } finally {
      setBusy(false);
    }
  }, [card, busy, deckId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          reveal();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          void rate(Number(e.key) as 1 | 2 | 3 | 4);
          break;
        case "u":
          void undo();
          break;
        case "*":
          void suspend();
          break;
        case "-":
          void bury();
          break;
        case "Escape":
          router.push("/decks");
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reveal, rate, undo, suspend, bury, router]);

  if (card === undefined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="text-[var(--color-muted)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between font-mono text-xs text-[var(--color-muted)]">
        <button type="button" onClick={() => router.push("/decks")} className="hover:text-[var(--color-chalk)]">
          ← Esc
        </button>
        <span>
          {queue.new} new · {queue.learning} learning · {queue.due} due
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--color-again)]">{error}</p>}

      {card === null ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-[var(--color-muted)]">
            Nothing due.
            {nextDue && <> Next card in {timeUntil(nextDue)}.</>}
          </p>
        </div>
      ) : (
        <div key={card.id} className="animate-card-enter flex flex-1 flex-col justify-center">
          <CardFrame card={card} side={side} resolveMedia={resolveMedia} mediaOrigin={mediaOrigin} />

          {side === "question" ? (
            <button
              type="button"
              onClick={reveal}
              className="mt-6 w-full rounded-[var(--radius-control)] bg-[var(--color-slate)] py-3 font-mono text-sm text-[var(--color-chalk)]"
            >
              Space / Enter to reveal
            </button>
          ) : (
            <div className="mt-6">
              <IntervalRibbon card={card} hoveredRating={hoveredRating} />
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    disabled={busy}
                    onMouseEnter={() => setHoveredRating(rating)}
                    onMouseLeave={() => setHoveredRating(null)}
                    onClick={() => rate(rating)}
                    className="rounded-[var(--radius-control)] py-3 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
                    style={{ background: RATING_COLOR[rating] }}
                  >
                    {RATING_LABELS[rating]}
                    <span className="ml-1.5 font-mono text-xs opacity-70">{rating}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
