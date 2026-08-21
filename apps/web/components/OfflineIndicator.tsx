"use client";

export function OfflineIndicator({
  isOnline,
  pendingCount,
}: {
  isOnline: boolean;
  pendingCount: number;
}) {
  if (isOnline && pendingCount === 0) return null;

  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
      style={{
        color: isOnline ? "var(--color-hard)" : "var(--color-again)",
        border: `1px solid ${isOnline ? "var(--color-hard)" : "var(--color-again)"}`,
      }}
    >
      {isOnline ? `syncing ${pendingCount}` : "offline"}
    </span>
  );
}
