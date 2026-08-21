from pydantic import BaseModel


class DailyCount(BaseModel):
    date: str  # YYYY-MM-DD
    count: int


class DeckStats(BaseModel):
    reviews_per_day: list[DailyCount]  # last 30 days, oldest first
    due_forecast: list[DailyCount]  # next 30 days, today first
    retention_rate: float | None  # 0-1 over the same 30-day window; null with no data yet
