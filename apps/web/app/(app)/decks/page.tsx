"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type DeckNode } from "@/lib/api/client";
import { DeckTree } from "@/components/DeckTree";

export default function DecksPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckNode[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  async function handleDelete(id: string) {
    await api.deleteDeck(id);
    setDecks(await api.listDecks());
  }

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  if (decks === null) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-card)]">
          Decks
        </h1>
        <div className="flex items-center gap-4 font-mono text-xs text-[var(--color-muted)]">
          <span>{email}</span>
          <button type="button" onClick={handleLogout} className="hover:text-[var(--color-chalk)]">
            sign out
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="mb-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Japanese::N5::Verbs"
          className="flex-1 rounded-[var(--radius-control)] border border-[var(--color-slate)] bg-[var(--color-slate)] px-3 py-2 font-mono text-sm text-[var(--color-chalk)] outline-none focus:border-[var(--color-good)]"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-control)] bg-[var(--color-good)] px-4 py-2 text-sm font-medium text-[var(--color-depth)]"
        >
          New deck
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-[var(--color-again)]">{error}</p>}

      {decks.length === 0 ? (
        <p className="text-[var(--color-muted)]">
          No decks yet. Create one above, using <code className="font-mono">::</code> to nest — e.g.{" "}
          <code className="font-mono">Parent::Child</code>.
        </p>
      ) : (
        <DeckTree decks={decks} onDelete={handleDelete} />
      )}
    </main>
  );
}
