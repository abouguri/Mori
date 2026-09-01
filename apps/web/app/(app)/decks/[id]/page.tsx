"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardFrame } from "@/components/CardFrame";
import { api, ApiError, type MediaUrl, type PreviewCard } from "@/lib/api/client";

export default function DeckPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [cards, setCards] = useState<PreviewCard[] | null>(null);
  const [media, setMedia] = useState<MediaUrl[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.previewDeckCards(params.id), api.listMedia()])
      .then(([cardList, mediaList]) => {
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
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
          Preview
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
        <p className="text-[var(--color-muted)]">No cards in this deck yet.</p>
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
  );
}
