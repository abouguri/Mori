"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";
import { api, ApiError, type ImportJob, type ImportStats } from "@/lib/api/client";

const MAX_BATCH_FILES = 20;
const MAX_FILE_BYTES = 500 * 1024 * 1024;
const POLL_INTERVAL_MS = 1000;

type ImportPhase = "ready" | "uploading" | "processing" | "done" | "failed";

interface ImportItem {
  key: string;
  file: File;
  phase: ImportPhase;
  job: ImportJob | null;
  error: string | null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function progressFor(item: ImportItem): number {
  if (item.phase === "done" || item.phase === "failed") return 100;
  if (item.phase === "uploading") return 3;
  return item.job?.progress ?? 0;
}

function statusFor(item: ImportItem): string {
  if (item.phase === "ready") return "Ready";
  if (item.phase === "uploading") return "Uploading";
  if (item.phase === "done") return "Complete";
  if (item.phase === "failed") return "Failed";
  if (item.job?.status === "parsing") return "Reading package";
  if (item.job?.status === "importing") return "Importing";
  return "Waiting";
}

function sumStats(items: ImportItem[]): ImportStats {
  return items.reduce<ImportStats>(
    (total, item) => {
      if (!item.job?.stats) return total;
      total.notes += item.job.stats.notes;
      total.cards += item.job.stats.cards;
      total.media += item.job.stats.media;
      total.skipped += item.job.stats.skipped;
      return total;
    },
    { notes: 0, cards: 0, media: 0, skipped: 0 },
  );
}

export default function ImportPage() {
  const router = useRouter();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    api.me().catch((error) => {
      if (error instanceof ApiError && error.status === 401) router.push("/login");
    });
  }, [router]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  function updateItem(key: string, update: Partial<ImportItem>) {
    if (cancelledRef.current) return;
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );
  }

  function handleSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setSelectionError(null);

    if (selected.length > MAX_BATCH_FILES) {
      setItems([]);
      setSelectionError(`Choose up to ${MAX_BATCH_FILES} decks at a time.`);
      return;
    }

    const valid: File[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      if (!file.name.toLowerCase().endsWith(".apkg")) {
        rejected.push(`${file.name} is not an .apkg file`);
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is over 500 MB`);
      } else {
        valid.push(file);
      }
    }

    setItems(
      valid.map((file, index) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        phase: "ready",
        job: null,
        error: null,
      })),
    );

    if (rejected.length > 0) {
      setSelectionError(`Skipped ${rejected.join("; ")}.`);
    }
  }

  async function importOne(item: ImportItem) {
    updateItem(item.key, { phase: "uploading", error: null });

    let created: ImportJob | null = null;
    try {
      created = await api.createImport(item.file);
      updateItem(item.key, { phase: "processing", job: created });

      let latest = created;
      while (
        !cancelledRef.current &&
        latest.status !== "done" &&
        latest.status !== "failed"
      ) {
        await wait(POLL_INTERVAL_MS);
        if (cancelledRef.current) return;
        latest = await api.getImport(latest.id);
        updateItem(item.key, { job: latest });
      }

      if (cancelledRef.current) return;
      updateItem(item.key, {
        phase: latest.status === "done" ? "done" : "failed",
        job: latest,
        error: latest.status === "failed" ? latest.error_detail : null,
      });
    } catch (error) {
      const message =
        created === null
          ? error instanceof ApiError
            ? error.message
            : "Couldn’t upload this deck."
          : "Progress tracking was interrupted. The import may still finish in the background.";
      updateItem(item.key, { phase: "failed", job: created, error: message });
    }
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    const queued = items.filter((item) => item.phase === "ready");
    if (queued.length === 0 || batchRunning) return;

    setBatchRunning(true);
    for (const item of queued) {
      if (cancelledRef.current) break;
      await importOne(item);
    }
    if (!cancelledRef.current) setBatchRunning(false);
  }

  const completeCount = items.filter((item) => item.phase === "done").length;
  const failedCount = items.filter((item) => item.phase === "failed").length;
  const settledCount = completeCount + failedCount;
  const batchFinished = items.length > 0 && settledCount === items.length;
  const totals = sumStats(items);
  const overallProgress =
    items.length === 0
      ? 0
      : Math.round(items.reduce((total, item) => total + progressFor(item), 0) / items.length);

  return (
    <MoriPatternPage
      variant="card-cascade"
      patternStyle={{ "--mori-pattern-opacity": 0.15 }}
    >
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
          <div className="flex items-center gap-3">
            <MoriMark
              className="h-6 text-[var(--color-chalk)]"
              nodeFill="var(--color-depth)"
            />
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
              Import decks
            </h1>
          </div>
          <Link
            href="/decks"
            className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--color-chalk)]"
          >
            ← decks
          </Link>
        </div>

        <p id="import-help" className="mb-6 text-[var(--color-muted)]">
          Select up to {MAX_BATCH_FILES} Anki <code className="font-mono">.apkg</code> files.
          Mori imports them one at a time so every deck gets clear progress and errors.
        </p>

        <label
          htmlFor="deck-files"
          className="mb-2 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]"
        >
          Deck packages
        </label>
        <form onSubmit={handleUpload} className="mb-6 flex flex-col gap-2 sm:flex-row">
          <input
            id="deck-files"
            type="file"
            accept=".apkg,application/zip"
            multiple
            disabled={batchRunning}
            aria-describedby="import-help import-selection-message"
            onChange={handleSelection}
            className="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-good)] file:px-3 file:py-1 file:text-[var(--color-depth)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={items.length === 0 || batchRunning || batchFinished}
            className="min-h-11 rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
          >
            {batchRunning
              ? `Importing ${Math.min(settledCount + 1, items.length)} of ${items.length}`
              : `Import ${items.length || "selected"} ${items.length === 1 ? "deck" : "decks"}`}
          </button>
        </form>

        <div id="import-selection-message" aria-live="polite">
          {selectionError && (
            <p className="mb-4 text-sm text-[var(--color-again)]">{selectionError}</p>
          )}
        </div>

        {items.length > 0 && (
          <section aria-labelledby="batch-progress-title" aria-busy={batchRunning}>
            <div className="mb-4 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <h2
                  id="batch-progress-title"
                  className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--color-chalk)]"
                >
                  Batch progress
                </h2>
                <span className="font-mono text-xs text-[var(--color-muted)]" aria-live="polite">
                  {settledCount} / {items.length} finished
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[var(--color-slate)]"
                role="progressbar"
                aria-label="Overall import progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={overallProgress}
              >
                <div
                  className="h-full rounded-full bg-[var(--color-lime)] transition-[width] duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              {batchFinished && (
                <p className="mt-3 text-sm text-[var(--color-muted)]" aria-live="polite">
                  {completeCount} imported · {failedCount} failed · {totals.notes} notes ·{" "}
                  {totals.cards} cards
                </p>
              )}
            </div>

            <ul className="grid list-none gap-3 p-0">
              {items.map((item) => {
                const failed = item.phase === "failed";
                const progress = progressFor(item);
                return (
                  <li
                    key={item.key}
                    className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
                  >
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                          {item.file.name}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)]">
                          {formatBytes(item.file.size)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] ${failed ? "text-[var(--color-again)]" : "text-[var(--color-muted)]"}`}
                      >
                        {statusFor(item)}
                      </span>
                    </div>

                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-slate)]"
                      role="progressbar"
                      aria-label={`${item.file.name} import progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${progress}%`,
                          background: failed ? "var(--color-again)" : "var(--color-good)",
                        }}
                      />
                    </div>

                    {item.phase === "done" && item.job?.stats && (
                      <p className="mt-4 font-mono text-xs text-[var(--color-chalk)]">
                        {item.job.stats.notes} notes · {item.job.stats.cards} cards ·{" "}
                        {item.job.stats.media} media · {item.job.stats.skipped} skipped
                      </p>
                    )}

                    {failed && item.error && (
                      <p className="mt-4 text-sm text-[var(--color-again)]">{item.error}</p>
                    )}
                  </li>
                );
              })}
            </ul>

            {batchFinished && completeCount > 0 && (
              <Link
                href="/decks"
                className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-good)] px-4 py-2 text-sm font-medium text-[var(--color-depth)]"
              >
                View imported decks
              </Link>
            )}
          </section>
        )}
      </main>
    </MoriPatternPage>
  );
}
