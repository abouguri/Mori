"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type DeckNode } from "@/lib/api/client";
import { DeckTree, subtreeCardCount } from "@/components/DeckTree";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

export default function DecksPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckNode[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeckNode | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setEmail(user.email);
        return api.listDecks();
      })
      .then(setDecks)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
        }
      });
  }, [router]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.createDeck(name);
      setName("");
      setDecks(await api.listDecks());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that deck.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteDeck(pendingDelete.id);
      setDecks(await api.listDecks());
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that deck.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  if (decks === null) {
    return (
      <MoriPatternPage variant="lattice">
        <main className="flex min-h-screen items-center justify-center px-6">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Loading your decks…</p>
        </main>
      </MoriPatternPage>
    );
  }

  const pendingCount = pendingDelete ? subtreeCardCount(pendingDelete) : 0;

  return (
    <MoriPatternPage variant="lattice">
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-center gap-3">
          <MoriMark className="h-6 text-[var(--color-chalk)]" nodeFill="var(--color-depth)" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-chalk)]">
            Decks
          </h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-[var(--color-muted)]">
          <Link href="/import" className="hover:text-[var(--color-chalk)]">
            import
          </Link>
          <Link href="/settings" className="hover:text-[var(--color-chalk)]">
            settings
          </Link>
          <span>{email}</span>
          <button type="button" onClick={handleLogout} className="hover:text-[var(--color-chalk)]">
            sign out
          </button>
        </div>
      </div>

      <label htmlFor="new-deck-name" className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">
        New deck path — use <code>::</code> to nest, e.g. Parent::Child
      </label>
      <form onSubmit={handleCreate} className="mb-8 flex gap-2">
        <input
          id="new-deck-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Japanese::N5::Verbs"
          required
          className="flex-1 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-good)]"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2 text-sm font-medium text-[var(--color-depth)]"
        >
          New deck
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-[var(--color-again)]">{error}</p>}

      {decks.length === 0 ? (
        <p className="mori-empty-state">
          No decks yet.{" "}
          <Link href="/import" className="underline decoration-[var(--color-muted)]/40 underline-offset-4">
            Import an .apkg file
          </Link>{" "}
          to get started, or create one above using <code className="font-mono">::</code> to nest
          — e.g. <code className="font-mono">Parent::Child</code>.
        </p>
      ) : (
        <DeckTree decks={decks} onDelete={setPendingDelete} />
      )}

      {pendingDelete && (
        <div
          className="mori-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-6 text-[var(--color-ink)]">
              Delete &ldquo;{pendingDelete.name}&rdquo;
              {pendingCount > 0 && <> and its {pendingCount.toLocaleString()} card{pendingCount === 1 ? "" : "s"}</>}?
              This can&rsquo;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded-[var(--radius-control)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-chalk)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-[var(--radius-control)] bg-[var(--color-again)] px-3 py-1.5 text-sm font-medium text-[var(--color-depth)] disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </MoriPatternPage>
  );
}
