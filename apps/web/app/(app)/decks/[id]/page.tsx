"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardFrame } from "@/components/CardFrame";
import { MoriPatternPage } from "@/components/MoriPattern";
import { api, ApiError, type Deck, type MediaUrl, type PreviewCard } from "@/lib/api/client";

function DeckLimits({ deck, onSaved }: { deck: Deck; onSaved: (d: Deck) => void }) {
  const [newPerDay, setNewPerDay] = useState(deck.new_per_day);
  const [reviewsPerDay, setReviewsPerDay] = useState(deck.reviews_per_day);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = newPerDay !== deck.new_per_day || reviewsPerDay !== deck.reviews_per_day;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateDeck(deck.id, {
        new_per_day: newPerDay,
        reviews_per_day: reviewsPerDay,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save these limits.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Daily limits
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-[var(--color-muted)]">
          New cards / day
          <input
            type="number"
            min={0}
            value={newPerDay}
            onChange={(e) => {
              setNewPerDay(Math.max(0, Number(e.target.value)));
              setSaved(false);
            }}
            className="mt-1 block w-28 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-good)]"
          />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          Reviews / day
          <input
            type="number"
            min={0}
            value={reviewsPerDay}
            onChange={(e) => {
              setReviewsPerDay(Math.max(0, Number(e.target.value)));
              setSaved(false);
            }}
            className="mt-1 block w-28 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-good)]"
          />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && <span className="text-sm text-[var(--color-good)]">Saved.</span>}
      </div>
      {error && <p className="mt-3 text-sm text-[var(--color-again)]">{error}</p>}
    </div>
  );
}

export default function DeckPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<PreviewCard[] | null>(null);
  const [media, setMedia] = useState<MediaUrl[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getDeck(params.id), api.previewDeckCards(params.id), api.listMedia()])
      .then(([deckInfo, cardList, mediaList]) => {
        setDeck(deckInfo);
        setCards(cardList);
        setMedia(mediaList);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
        } else {
          setError("Couldn't load this deck's cards.");
        }
      });
  }, [params.id, router]);

  const mediaByFilename = useMemo(() => new Map(media.map((m) => [m.filename, m.url])), [media]);
  const resolveMedia = useCallback(
    (filename: string) => mediaByFilename.get(filename) ?? filename,
    [mediaByFilename],
  );
  // window is unavailable during the server render pass for this client
  // component, so this only resolves once mounted in the browser.
  const [mediaOrigin, setMediaOrigin] = useState("");
  useEffect(() => {
    setMediaOrigin(media[0] ? new URL(media[0].url).origin : window.location.origin);
  }, [media]);

  return (
    <MoriPatternPage variant="deck">
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
          {deck ? deck.name : "Preview"}
        </h1>
        <div className="flex items-center gap-4 font-mono text-xs text-[var(--color-muted)]">
          <Link href={`/study/${params.id}`} className="text-[var(--color-good)] hover:opacity-80">
            study this deck →
          </Link>
          <Link href={`/decks/${params.id}/stats`} className="hover:text-[var(--color-chalk)]">
            stats
          </Link>
          <Link href="/decks" className="hover:text-[var(--color-chalk)]">
            ← decks
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--color-again)]">{error}</p>}

      {deck && <DeckLimits deck={deck} onSaved={setDeck} />}

      {cards === null && !error && (
        <div className="flex flex-col gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
              <div className="mb-3 h-3 w-20 animate-pulse rounded bg-[var(--color-slate)]" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-slate)]" />
                <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-slate)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {cards !== null && cards.length === 0 && (
        <p className="mori-empty-state">No cards in this deck yet.</p>
      )}

      <div className="flex flex-col gap-8">
        {cards !== null && mediaOrigin &&
          cards.map((card) => (
            <div key={card.id} className="rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
              <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">{card.template_name}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    Question
                  </p>
                  <CardFrame card={card} side="question" resolveMedia={resolveMedia} mediaOrigin={mediaOrigin} heightClassName="h-96" />
                </div>
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    Answer
                  </p>
                  <CardFrame card={card} side="answer" resolveMedia={resolveMedia} mediaOrigin={mediaOrigin} heightClassName="h-96" />
                </div>
              </div>
            </div>
          ))}
      </div>
    </main>
    </MoriPatternPage>
  );
}
