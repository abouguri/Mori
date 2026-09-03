"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardFrame } from "@/components/CardFrame";
import { IntervalRibbon } from "@/components/IntervalRibbon";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { MoriPatternPage } from "@/components/MoriPattern";
import { api, ApiError, type MediaUrl, type PreviewCard, type QueueCounts } from "@/lib/api/client";
import {
  getCachedQueue,
  loadOfflineMediaUrls,
  pendingAnswerCount,
  prefetchSession,
  queueAnswer,
  removeCachedCard,
  replayBufferedAnswers,
  revokeOfflineMediaUrls,
} from "@/lib/db/offline";
import type { CachedCard } from "@/lib/db/schema";

type Side = "question" | "answer";

const RATING_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
const RATING_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--color-again)",
  2: "var(--color-hard)",
  3: "var(--color-good)",
  4: "var(--color-easy)",
};
// Again/Hard/Good sit dark enough for light text; Easy is lime (light), so
// it needs dark text instead — can't use one text color for all four the
// way a uniform dark-background theme could.
const RATING_TEXT: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--color-depth)",
  2: "var(--color-depth)",
  3: "var(--color-depth)",
  4: "var(--color-good)",
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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [outOfCachedCards, setOutOfCachedCards] = useState(false);

  const shownAtRef = useRef<number>(Date.now());
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const offlineQueueRef = useRef<CachedCard[]>([]);
  const offlineMediaRef = useRef<Map<string, string>>(new Map());

  const refreshPendingCount = useCallback(() => {
    void pendingAnswerCount().then(setPendingCount);
  }, []);

  const sync = useCallback(async () => {
    const { remaining } = await replayBufferedAnswers();
    setPendingCount(remaining);
    if (remaining === 0) {
      // Fully caught up — resync with the live session and a fresh
      // prefetch (offline-answered cards are now server-confirmed).
      try {
        const session = await api.startStudySession(deckId);
        setCard(session.card);
        setQueue(session.queue);
        setNextDue(session.next_due);
        setOutOfCachedCards(false);
        await prefetchSession(deckId);
        offlineQueueRef.current = await getCachedQueue(deckId);
      } catch {
        // Reconnected just long enough to replay, then dropped again — fine,
        // we'll try a full resync next time 'online' fires.
      }
    }
  }, [deckId]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    function onOnline() {
      setIsOnline(true);
      void sync();
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [sync]);

  useEffect(() => {
    api
      .startStudySession(deckId)
      .then(async (session) => {
        setCard(session.card);
        setQueue(session.queue);
        setNextDue(session.next_due);
        shownAtRef.current = Date.now();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        // Opened this page while already offline — fall back to whatever's
        // cached from a previous session's prefetch.
        setIsOnline(false);
      });

    api.listMedia().then(setMedia).catch(() => {});

    void prefetchSession(deckId)
      .then(() => getCachedQueue(deckId))
      .then((cached) => {
        offlineQueueRef.current = cached;
      })
      .catch(() => {});
    void loadOfflineMediaUrls().then((urls) => {
      offlineMediaRef.current = urls;
    });
    refreshPendingCount();

    return () => revokeOfflineMediaUrls(offlineMediaRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, router]);

  const mediaByFilename = useMemo(() => new Map(media.map((m) => [m.filename, m.url])), [media]);
  const resolveMedia = useCallback(
    (filename: string) =>
      mediaByFilename.get(filename) ?? offlineMediaRef.current.get(filename) ?? filename,
    [mediaByFilename],
  );
  const [mediaOrigin, setMediaOrigin] = useState("");
  useEffect(() => {
    setMediaOrigin(media[0] ? new URL(media[0].url).origin : window.location.origin);
  }, [media]);

  const reveal = useCallback(() => {
    if (side === "question" && card) setSide("answer");
  }, [side, card]);

  const advanceFromOfflineQueue = useCallback((answeredCardId: string) => {
    offlineQueueRef.current = offlineQueueRef.current.filter((c) => c.id !== answeredCardId);
    const next = offlineQueueRef.current[0];
    setOutOfCachedCards(next === undefined);
    return next?.data ?? null;
  }, []);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (side !== "answer" || !card || busy) return;
      setBusy(true);
      const durationMs = Date.now() - shownAtRef.current;
      const answeredCard = card;
      const idempotencyKey = idempotencyKeyRef.current;

      if (navigator.onLine) {
        try {
          const response = await api.answerCard(
            answeredCard.id,
            deckId,
            rating,
            durationMs,
            idempotencyKey,
          );
          idempotencyKeyRef.current = crypto.randomUUID();
          setLastAnswered(answeredCard);
          setSide("question");
          shownAtRef.current = Date.now();
          void removeCachedCard(answeredCard.id);
          offlineQueueRef.current = offlineQueueRef.current.filter((c) => c.id !== answeredCard.id);

          if (response.next === null) {
            const session = await api.startStudySession(deckId);
            setCard(session.card);
            setQueue(session.queue);
            setNextDue(session.next_due);
          } else {
            setCard(response.next);
            setQueue(response.queue);
          }
          setBusy(false);
          return;
        } catch {
          // Network call genuinely failed — fall through to the offline path.
        }
      }

      // Offline (or the live call just failed): buffer the answer and
      // advance using the locally prefetched queue instead of the server's.
      await queueAnswer({
        idempotencyKey,
        cardId: answeredCard.id,
        deckId,
        rating,
        durationMs,
        answeredAt: new Date().toISOString(),
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      void removeCachedCard(answeredCard.id);
      setIsOnline(false);
      refreshPendingCount();

      setQueue((q) => {
        if (answeredCard.state === 0) return { ...q, new: Math.max(0, q.new - 1) };
        if (answeredCard.state === 1 || answeredCard.state === 3) {
          return { ...q, learning: Math.max(0, q.learning - 1) };
        }
        return { ...q, due: Math.max(0, q.due - 1) };
      });
      setCard(advanceFromOfflineQueue(answeredCard.id));
      setSide("question");
      shownAtRef.current = Date.now();
      setBusy(false);
    },
    [side, card, busy, deckId, advanceFromOfflineQueue, refreshPendingCount],
  );

  const undo = useCallback(async () => {
    if (!lastAnswered || busy || !isOnline) return;
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
  }, [lastAnswered, busy, deckId, isOnline]);

  const suspend = useCallback(async () => {
    if (!card || busy || !isOnline) return;
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
  }, [card, busy, deckId, isOnline]);

  const bury = useCallback(async () => {
    if (!card || busy || !isOnline) return;
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
  }, [card, busy, deckId, isOnline]);

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
      <MoriPatternPage variant="temporal-orbits">
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="animate-pulse text-[var(--color-muted)]">Loading…</p>
      </main>
      </MoriPatternPage>
    );
  }

  return (
    <MoriPatternPage variant="temporal-orbits" patternStyle={{ "--mori-pattern-opacity": 0.15 }}>
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between font-mono text-xs text-[var(--color-muted)]">
        <button type="button" onClick={() => router.push("/decks")} className="hover:text-[var(--color-chalk)]">
          ← Esc
        </button>
        <div className="flex items-center gap-3">
          <OfflineIndicator isOnline={isOnline} pendingCount={pendingCount} />
          <span>
            {queue.new} new · {queue.learning} learning · {queue.due} due
          </span>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--color-again)]">{error}</p>}

      {card === null ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="mori-empty-state text-center">
            {!isOnline && outOfCachedCards
              ? "Nothing left cached for offline study."
              : "Nothing due."}
            {isOnline && nextDue && <> Next card in {timeUntil(nextDue)}.</>}
          </p>
        </div>
      ) : (
        <div key={card.id} className="animate-card-enter flex flex-1 flex-col justify-center">
          <CardFrame card={card} side={side} resolveMedia={resolveMedia} mediaOrigin={mediaOrigin} />

          {side === "question" ? (
            <button
              type="button"
              onClick={reveal}
              className="mt-6 w-full rounded-[var(--radius-control)] bg-[var(--color-slate)] py-3 font-mono text-sm text-[var(--color-ink)]"
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
                    className="rounded-[var(--radius-control)] py-3 text-sm font-medium disabled:opacity-50"
                    style={{ background: RATING_COLOR[rating], color: RATING_TEXT[rating] }}
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
    </MoriPatternPage>
  );
}
