"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type OptimizeJob, type User } from "@/lib/api/client";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

// Mirrors MIN_REVIEWS_FOR_OPTIMIZATION in services/api/app/services/fsrs_optimize.py.
const MIN_REVIEWS_FOR_OPTIMIZATION = 400;

function AccountSection({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const [timezone, setTimezone] = useState(user.timezone);
  const [dayStartHour, setDayStartHour] = useState(user.day_start_hour);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The exact set the browser's Intl implementation supports — pulled live
  // rather than hand-maintained, since it needs to stay in sync with what
  // the backend actually accepts (zoneinfo.available_timezones(), the same
  // underlying IANA database). Falls back to just the user's current value
  // if the browser doesn't support the API (Baseline widely available, but
  // no need to hard-fail on something this optional).
  //
  // "UTC" is conspicuously absent from supportedValuesOf's list (confirmed
  // directly) even though it's a fully valid, common choice the backend
  // accepts — and it's every new account's default. Without adding it back,
  // a fresh account's <select> silently falls back to whatever's
  // alphabetically first, showing something other than the account's real
  // saved timezone, and there'd be no way to pick UTC again once you'd
  // moved off it.
  const timezones = useMemo(() => {
    try {
      const supported = Intl.supportedValuesOf("timeZone");
      return supported.includes("UTC") ? supported : ["UTC", ...supported];
    } catch {
      return [user.timezone];
    }
  }, [user.timezone]);

  const dirty = timezone !== user.timezone || dayStartHour !== user.day_start_hour;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateMe({ timezone, day_start_hour: dayStartHour });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your account settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-line)] p-5">
      <h2 className="mb-2 font-medium text-[var(--color-chalk)]">Account</h2>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Your timezone and day-start hour decide when &ldquo;today&rdquo; rolls over — that&rsquo;s
        when new cards become available and daily limits reset.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 text-sm text-[var(--color-muted)]">
          Timezone
          <select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setSaved(false);
            }}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-good)]"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-[var(--color-muted)]">
          Day starts at
          <select
            value={dayStartHour}
            onChange={(e) => {
              setDayStartHour(Number(e.target.value));
              setSaved(false);
            }}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-good)]"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || saving}
        className="mt-4 rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>

      {saved && !dirty && <p className="mt-3 text-sm text-[var(--color-good)]">Saved.</p>}
      {error && <p className="mt-3 text-sm text-[var(--color-again)]">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [job, setJob] = useState<OptimizeJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((err) => {
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
    <MoriPatternPage variant="grid" patternStyle={{ "--mori-pattern-opacity": 0.05 }}>
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-center gap-3">
          <MoriMark className="h-6 text-[var(--color-chalk)]" nodeFill="var(--color-depth)" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
            Settings
          </h1>
        </div>
        <Link href="/decks" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--color-chalk)]">
          ← decks
        </Link>
      </div>

      {user && <AccountSection user={user} onSaved={setUser} />}

      <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] p-5">
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
          className="rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
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
    </MoriPatternPage>
  );
}
