import { MoriPatternPage } from "@/components/MoriPattern";

export default function Loading() {
  return (
    <MoriPatternPage variant="recall-current">
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <span className="mx-auto mb-4 block h-2 w-2 animate-pulse rounded-full bg-[var(--color-lime)] motion-reduce:animate-none" />
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Resurfacing…
          </p>
        </div>
      </main>
    </MoriPatternPage>
  );
}
