"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ImportJob } from "@/lib/api/client";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
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

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);

    try {
      const created = await api.createImport(file);
      setJob(created);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.getImport(created.id);
          setJob(updated);
          if (updated.status === "done" || updated.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the import.");
    }
  }

  const busy = job !== null && job.status !== "done" && job.status !== "failed";

  return (
    <MoriPatternPage variant="resurface" patternStyle={{ "--mori-pattern-opacity": 0.055 }}>
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-center gap-3">
          <MoriMark className="h-6 text-[var(--color-chalk)]" nodeFill="var(--color-depth)" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
            Import a deck
          </h1>
        </div>
        <Link href="/decks" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--color-chalk)]">
          ← decks
        </Link>
      </div>

      <p className="mb-6 text-[var(--color-muted)]">
        Upload an <code className="font-mono">.apkg</code> file exported from Anki. Its notes,
        note types, cards, and media import into your account.
      </p>

      <form onSubmit={handleUpload} className="mb-6 flex gap-2">
        <input
          type="file"
          accept=".apkg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-good)] file:px-3 file:py-1 file:text-[var(--color-depth)]"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
        >
          Import deck
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-[var(--color-again)]">{error}</p>}

      {job && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] p-5">
          <div className="mb-3 flex items-center justify-between font-mono text-xs text-[var(--color-muted)]">
            <span>{job.filename}</span>
            <span>{job.status}</span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-slate)]">
            <div
              className="h-full rounded-full bg-[var(--color-good)] transition-[width] duration-300"
              style={{ width: `${job.status === "failed" ? 100 : job.progress}%`, background: job.status === "failed" ? "var(--color-again)" : undefined }}
            />
          </div>

          {job.status === "done" && job.stats && (
            <p className="mt-4 font-mono text-sm text-[var(--color-chalk)]">
              {job.stats.notes} notes · {job.stats.cards} cards · {job.stats.media} media ·{" "}
              {job.stats.skipped} skipped
            </p>
          )}

          {job.status === "failed" && (
            <p className="mt-4 text-sm text-[var(--color-again)]">{job.error_detail}</p>
          )}

          {job.status === "done" && (
            <Link
              href="/decks"
              className="mt-4 inline-block rounded-[var(--radius-control)] bg-[var(--color-good)] px-3 py-1.5 text-sm font-medium text-[var(--color-depth)]"
            >
              View decks
            </Link>
          )}
        </div>
      )}
    </main>
    </MoriPatternPage>
  );
}
