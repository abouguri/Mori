import Link from "next/link";
import { MoriMark } from "@/components/MoriMark";
import { MoriPatternPage } from "@/components/MoriPattern";

export default function NotFound() {
  return (
    <MoriPatternPage
      variant="growth"
      patternStyle={{ "--mori-pattern-opacity": 0.05, "--mori-pattern-rotation": "-4deg" }}
    >
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <MoriMark
          className="mb-8 h-8 text-[var(--color-chalk)]"
          nodeFill="var(--color-depth)"
          terminalFill="var(--color-lime)"
        />
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
          404 / Path interrupted
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.95] tracking-[-0.05em] text-[var(--color-chalk)]">
          This memory path ends here.
        </h1>
        <p className="mt-5 max-w-md text-[var(--color-muted)]">
          The page may have moved, faded, or never existed.
        </p>
        <Link
          href="/"
          className="mt-8 w-fit rounded-[var(--radius-control)] bg-[var(--color-chalk)] px-4 py-2.5 text-sm font-medium text-[var(--color-depth)]"
        >
          Return to Mori
        </Link>
      </main>
    </MoriPatternPage>
  );
}
