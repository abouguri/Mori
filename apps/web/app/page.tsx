"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

export default function Home() {
  const router = useRouter();
  // undefined: still checking · null: confirmed signed out (render the
  // marketing page) — never renders the marketing page for a signed-in
  // visitor, even briefly, since this previously showed "signed out" at /
  // regardless of session state (confirmed directly: /decks loaded fine,
  // no re-auth needed, right after / claimed to be logged out).
  const [signedOut, setSignedOut] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(() => router.replace("/decks"))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setSignedOut(true);
        } else {
          // Backend unreachable etc. — fall back to the marketing page
          // rather than a blank screen forever.
          setSignedOut(true);
        }
      });
  }, [router]);

  if (!signedOut) {
    return (
      <MoriPatternPage variant="recall-current">
        <main className="flex min-h-screen items-center justify-center px-6">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Finding your review path…
          </p>
        </main>
      </MoriPatternPage>
    );
  }

  return (
    <MoriPatternPage
      variant="synapse-river"
      patternStyle={{ "--mori-pattern-opacity": 0.22, "--mori-pattern-scale": 1.06 }}
    >
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
        <MoriMark
          className="mb-6 h-10 text-[var(--color-chalk)]"
          nodeFill="var(--color-depth)"
          terminalFill="var(--color-lime)"
        />
        <h1 className="m-0 font-[family-name:var(--font-display)] text-7xl font-extrabold tracking-[-0.045em] text-[var(--color-chalk)]">
          Mori<span className="text-[var(--color-lime)]">.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg text-[var(--color-ink)]">
          Everything you learn is decaying right now. This is the intervention.
        </p>
        <Link
          href="/login"
          className="mt-8 w-fit rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)]"
        >
          Sign in
        </Link>
      </main>
    </MoriPatternPage>
  );
}
