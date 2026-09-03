const RECENT_DECK_KEY = "mori:recent-deck";
const RECENT_DECK_EVENT = "mori:recent-deck-change";

export interface RecentDeckUsage {
  id: string;
  usedAt: string;
}

export function rememberRecentDeck(id: string): void {
  const usage: RecentDeckUsage = { id, usedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(RECENT_DECK_KEY, JSON.stringify(usage));
  } catch {
    // Storage may be unavailable in a hardened/private browser context. The
    // API timestamp remains the durable fallback in that case.
  }
  // The native storage event only fires in other tabs. This event keeps a
  // cached decks route in the current tab synchronized as well.
  window.dispatchEvent(new Event(RECENT_DECK_EVENT));
}

export function recentDeckSnapshot(): string | null {
  try {
    return window.localStorage.getItem(RECENT_DECK_KEY);
  } catch {
    return null;
  }
}

export function recentDeckServerSnapshot(): null {
  return null;
}

export function subscribeToRecentDeck(onChange: () => void): () => void {
  window.addEventListener(RECENT_DECK_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RECENT_DECK_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function parseRecentDeck(snapshot: string | null): RecentDeckUsage | null {
  if (!snapshot) return null;
  try {
    const value: unknown = JSON.parse(snapshot);
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "usedAt" in value &&
      typeof value.usedAt === "string"
    ) {
      return { id: value.id, usedAt: value.usedAt };
    }
  } catch {
    // Ignore malformed or legacy local values and fall back to the API.
  }
  return null;
}
