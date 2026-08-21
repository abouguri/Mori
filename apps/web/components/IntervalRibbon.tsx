"use client";

import { formatInterval, previewIntervals } from "@/lib/render/intervalRibbon";
import type { PreviewCard } from "@/lib/api/client";

const MIN_MS = 60_000; // 1 minute
const MAX_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const RATING_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--color-again)",
  2: "var(--color-hard)",
  3: "var(--color-good)",
  4: "var(--color-easy)",
};

const GRIDLINES = [
  { ms: 24 * 60 * 60 * 1000, label: "1d" },
  { ms: 7 * 24 * 60 * 60 * 1000, label: "1w" },
  { ms: 30 * 24 * 60 * 60 * 1000, label: "1mo" },
  { ms: 365 * 24 * 60 * 60 * 1000, label: "1y" },
];

function logPosition(ms: number): number {
  const clamped = Math.min(Math.max(ms, MIN_MS), MAX_MS);
  return (Math.log(clamped) - Math.log(MIN_MS)) / (Math.log(MAX_MS) - Math.log(MIN_MS));
}

/** §10.3's signature element — a log-scale ruler previewing where each rating would land the card. */
export function IntervalRibbon({
  card,
  hoveredRating,
}: {
  card: PreviewCard;
  hoveredRating: 1 | 2 | 3 | 4 | null;
}) {
  const previews = previewIntervals(card);

  return (
    <div className="mb-2">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-slate)]" />
        {GRIDLINES.map((g) => (
          <div
            key={g.label}
            className="absolute top-0 h-full w-px bg-[var(--color-slate)] opacity-50"
            style={{ left: `${logPosition(g.ms) * 100}%` }}
          />
        ))}
        {previews.map(({ rating, intervalMs }) => {
          const active = hoveredRating === rating;
          const size = active ? 10 : 6;
          return (
            <div
              key={rating}
              className="absolute top-1/2 rounded-full transition-transform motion-reduce:transition-none"
              style={{
                left: `${logPosition(intervalMs) * 100}%`,
                width: size,
                height: size,
                marginLeft: -size / 2,
                marginTop: -size / 2,
                background: RATING_COLOR[rating],
                transitionDuration: "120ms",
                transitionTimingFunction: "ease-out",
                transform: active ? "scale(1.15)" : "scale(1)",
              }}
            />
          );
        })}
      </div>
      <div className="relative h-4 font-mono text-[10px] text-[var(--color-muted)]">
        {previews.map(({ rating, intervalMs }) => (
          <span
            key={rating}
            className="absolute -translate-x-1/2"
            style={{ left: `${logPosition(intervalMs) * 100}%` }}
          >
            {formatInterval(intervalMs)}
          </span>
        ))}
      </div>
    </div>
  );
}
