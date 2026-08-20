"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await api.register(email, password);
      } else {
        await api.login(email, password);
      }
      router.push("/decks");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.025em] text-[var(--color-card)]">
        MORI<span className="text-[var(--color-good)]">.</span>
      </h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        {mode === "login" ? "Welcome back." : "Everything you learn is decaying right now."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-[var(--radius-control)] border border-[var(--color-slate)] bg-[var(--color-slate)] px-3 py-2 text-[var(--color-chalk)] outline-none focus:border-[var(--color-good)]"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-[var(--radius-control)] border border-[var(--color-slate)] bg-[var(--color-slate)] px-3 py-2 text-[var(--color-chalk)] outline-none focus:border-[var(--color-good)]"
        />

        {error && <p className="text-sm text-[var(--color-again)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-[var(--radius-control)] bg-[var(--color-good)] px-3 py-2 font-medium text-[var(--color-depth)] disabled:opacity-50"
        >
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-4 text-sm text-[var(--color-muted)] underline decoration-[var(--color-muted)]/40 underline-offset-4"
      >
        {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
