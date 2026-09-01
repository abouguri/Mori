"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type DailyCount, type DeckStats } from "@/lib/api/client";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A native `title` tooltip here was easy to miss — it needs a held hover
// with no mouse movement, and the empty-day bars are only 1-2px tall,
// which made them hard to even land the pointer on (confirmed directly:
// hovering a bar showed nothing). A visible on-hover label plus a max/
// date-range caption gives the same information without depending on that.
function BarChart({ data, color }: { data: DailyCount[]; color: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) return null;

  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = data.reduce((best, d) => (d.count > best.count ? d : best));
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const hoveredDay = hovered !== null ? data[hovered] : undefined;

  return (
    <div>
      <div className="relative flex h-24 items-end gap-[2px]">
        {hovered !== null && hoveredDay && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-2 py-1 font-mono text-[11px] text-[var(--color-depth)]"
            style={{ left: `${((hovered + 0.5) / data.length) * 100}%` }}
          >
            {formatDate(hoveredDay.date)}: {hoveredDay.count}
          </div>
        )}
        {data.map((d, i) => (
          <div
            key={d.date}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${(d.count / max) * 100}%`,
              minHeight: 4,
              background: d.count > 0 ? color : "var(--color-slate)",
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[var(--color-muted)]">
        <span>{formatDate(first.date)}</span>
        <span>
          peak {peak.count} · {formatDate(peak.date)}
        </span>
        <span>{formatDate(last.date)}</span>
      </div>
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

      {stats === null && !error && (
        <p className="animate-pulse text-[var(--color-muted)]">Loading…</p>
      )}

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
