"use client";

import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <MoriPatternPage
      variant="decay"
      patternStyle={{ "--mori-pattern-opacity": 0.05, "--mori-pattern-rotation": "-5deg" }}
    >
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <MoriMark
          className="mb-8 h-8 text-[var(--color-chalk)]"
          nodeFill="var(--color-depth)"
          terminalFill="var(--color-lime)"
        />
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Review interrupted
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.95] tracking-[-0.05em] text-[var(--color-chalk)]">
          Mori lost the thread.
        </h1>
        <p className="mt-5 max-w-md text-[var(--color-muted)]">
          Your progress is safe. Try this step again to reconnect the path.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 w-fit rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2.5 text-sm font-medium text-[var(--color-depth)]"
        >
          Try again
        </button>
      </main>
    </MoriPatternPage>
  );
}
