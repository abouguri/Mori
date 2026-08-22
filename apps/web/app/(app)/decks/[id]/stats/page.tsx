"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type DailyCount, type DeckStats } from "@/lib/api/client";

function BarChart({ data, color }: { data: DailyCount[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-24 items-end gap-[2px]">
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count}`}
          className="flex-1 rounded-t-sm"
          style={{
            height: `${(d.count / max) * 100}%`,
            minHeight: d.count > 0 ? 2 : 1,
            background: d.count > 0 ? color : "var(--color-slate)",
          }}
        />
      ))}
    </div>
  );
}

export default function DeckStatsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .deckStats(params.id)
      .then(setStats)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push("/login");
        else setError("Couldn't load stats for this deck.");
      });
  }, [params.id, router]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
          Stats
        </h1>
        <Link
          href={`/decks/${params.id}`}
          className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--color-chalk)]"
        >
          ← deck
        </Link>
      </div>

      {error && <p className="text-sm text-[var(--color-again)]">{error}</p>}

      {stats && (
        <div className="flex flex-col gap-10">
          <section>
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Retention
            </p>
            <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--color-chalk)]">
              {stats.retention_rate === null
                ? "—"
                : `${Math.round(stats.retention_rate * 100)}%`}
            </p>
            {stats.retention_rate === null && (
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Not enough review history yet — answer a few due cards to see this.
              </p>
            )}
          </section>

          <section>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Reviews · last 30 days
            </p>
            <BarChart data={stats.reviews_per_day} color="var(--color-good)" />
          </section>

          <section>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Due · next 30 days
            </p>
            <BarChart data={stats.due_forecast} color="var(--color-easy)" />
          </section>
        </div>
      )}
    </main>
  );
}
