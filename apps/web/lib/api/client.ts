const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.detail ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface User {
  id: string;
  email: string;
  timezone: string;
  day_start_hour: number;
}

export interface DeckNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  position: number;
  new_per_day: number;
  reviews_per_day: number;
  children: DeckNode[];
}

export interface ImportStats {
  notes: number;
  cards: number;
  media: number;
  skipped: number;
}

export interface ImportJob {
  id: string;
  filename: string;
  status: "queued" | "parsing" | "importing" | "done" | "failed";
  progress: number;
  stats: ImportStats | null;
  error_code: string | null;
  error_detail: string | null;
}

export const api = {
  register: (email: string, password: string) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<User>("/auth/me"),

  listDecks: () => request<DeckNode[]>("/decks"),

  createDeck: (name: string) =>
    request<DeckNode>("/decks", { method: "POST", body: JSON.stringify({ name }) }),

  deleteDeck: (id: string) => request<void>(`/decks/${id}`, { method: "DELETE" }),

  createImport: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<ImportJob>("/imports", { method: "POST", body });
  },

  getImport: (id: string) => request<ImportJob>(`/imports/${id}`),
};
