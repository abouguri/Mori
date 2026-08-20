import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
        M1 · auth &amp; decks
      </p>
      <h1 className="m-0 font-[family-name:var(--font-display)] text-7xl font-extrabold tracking-[-0.045em] text-[var(--color-card)]">
        MORI<span className="text-[var(--color-good)]">.</span>
      </h1>
      <p className="mt-5 max-w-md font-[family-name:var(--font-body)] text-lg text-[var(--color-chalk)]">
        Everything you learn is decaying right now. This is the intervention.
      </p>
      <Link
        href="/login"
        className="mt-8 w-fit rounded-[var(--radius-control)] bg-[var(--color-good)] px-4 py-2 text-sm font-medium text-[var(--color-depth)]"
      >
        Sign in
      </Link>
    </main>
  );
}
