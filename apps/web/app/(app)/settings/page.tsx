"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type OptimizeJob } from "@/lib/api/client";

// Mirrors MIN_REVIEWS_FOR_OPTIMIZATION in services/api/app/services/fsrs_optimize.py.
const MIN_REVIEWS_FOR_OPTIMIZATION = 400;

export default function SettingsPage() {
  const router = useRouter();
  const [job, setJob] = useState<OptimizeJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.me().catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.push("/login");
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleOptimize() {
    setError(null);
    try {
      const created = await api.createOptimizeJob();
      setJob(created);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.getOptimizeJob(created.id);
          setJob(updated);
          if (updated.status !== "queued" && updated.status !== "running") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start tuning.");
    }
  }

  const busy = job !== null && (job.status === "queued" || job.status === "running");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-card)]">
          Settings
        </h1>
        <Link href="/decks" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--color-chalk)]">
          ← decks
        </Link>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-slate)] p-5">
        <h2 className="mb-2 font-medium text-[var(--color-chalk)]">Tune your review schedule</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Mori starts everyone on the same FSRS parameters. Once you have at least{" "}
          {MIN_REVIEWS_FOR_OPTIMIZATION} reviews, it can fit parameters to how you personally
          forget and remember — usually tighter, more accurate intervals than the defaults.
        </p>

        <button
          type="button"
          onClick={handleOptimize}
          disabled={busy}
          className="rounded-[var(--radius-control)] bg-[var(--color-good)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
        >
          {busy ? "Tuning…" : "Tune my review schedule"}
        </button>

        {error && <p className="mt-4 text-sm text-[var(--color-again)]">{error}</p>}

        {job && job.status === "insufficient_data" && (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            You have {job.review_count ?? 0} reviews so far — come back after{" "}
            {MIN_REVIEWS_FOR_OPTIMIZATION}. Your schedule is still using the default parameters,
            which is normal this early on.
          </p>
        )}

        {job && job.status === "done" && (
          <p className="mt-4 text-sm text-[var(--color-chalk)]">
            Done — your review schedule now uses parameters fit to your own history.
          </p>
        )}

        {job && job.status === "failed" && (
          <p className="mt-4 text-sm text-[var(--color-again)]">{job.error_detail}</p>
        )}
      </div>
    </main>
  );
}
