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

export interface PreviewCard {
  id: string;
  template_name: string;
  question_format: string;
  answer_format: string;
  css: string;
  latex_pre: string;
  latex_post: string;
  is_cloze: boolean;
  cloze_number: number | null;
  fields: Record<string, string>;
  tags: string[];
  state: number;
  stability: number | null;
  difficulty: number | null;
  due: string | null;
  last_review: string | null;
}

export interface MediaUrl {
  filename: string;
  url: string;
}

export interface QueueCounts {
  new: number;
  learning: number;
  due: number;
}

export interface StudySessionStart {
  queue: QueueCounts;
  card: PreviewCard | null;
  next_due: string | null;
}

export interface CardState {
  id: string;
  state: number;
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
}

export interface AnswerResponse {
  card: CardState;
  next: PreviewCard | null;
  queue: QueueCounts;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface DeckStats {
  reviews_per_day: DailyCount[];
  due_forecast: DailyCount[];
  retention_rate: number | null;
}

export interface OptimizeJob {
  id: string;
  status: "queued" | "running" | "done" | "insufficient_data" | "failed";
  review_count: number | null;
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

  previewDeckCards: (deckId: string) => request<PreviewCard[]>(`/decks/${deckId}/cards`),

  listMedia: () => request<MediaUrl[]>("/media"),

  startStudySession: (deckId: string) => request<StudySessionStart>(`/decks/${deckId}/study`),

  previewStudyBatch: (deckId: string, limit: number) =>
    request<PreviewCard[]>(`/decks/${deckId}/study/prefetch?limit=${limit}`),

  answerCard: (
    cardId: string,
    deckId: string,
    rating: 1 | 2 | 3 | 4,
    durationMs: number,
    idempotencyKey: string,
  ) =>
    request<AnswerResponse>(`/cards/${cardId}/answer`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        rating,
        duration_ms: durationMs,
        answered_at: new Date().toISOString(),
        deck_id: deckId,
      }),
    }),

  undoAnswer: (cardId: string, deckId: string) =>
    request<AnswerResponse>(`/cards/${cardId}/undo?deck_id=${deckId}`, { method: "POST" }),

  suspendCard: (cardId: string) => request<CardState>(`/cards/${cardId}/suspend`, { method: "POST" }),

  buryCard: (cardId: string) => request<CardState>(`/cards/${cardId}/bury`, { method: "POST" }),

  deckStats: (deckId: string) => request<DeckStats>(`/decks/${deckId}/stats`),

  createOptimizeJob: () => request<OptimizeJob>("/users/me/fsrs-optimize", { method: "POST" }),

  getOptimizeJob: (id: string) => request<OptimizeJob>(`/users/me/fsrs-optimize/${id}`),
};
