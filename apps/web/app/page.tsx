import Link from "next/link";
import { MoriMark } from "@/components/MoriMark";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <MoriMark
        className="mb-6 h-10 text-[var(--color-chalk)]"
        nodeFill="var(--color-depth)"
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
  );
}
