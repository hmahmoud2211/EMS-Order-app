"""Time source for business rules.

All persisted timestamps are UTC. Business dates (the "company date" of a daily
session) are computed in the configured business timezone (Africa/Cairo).
The clock is injectable so tests can freeze or move time to exercise deadlines.
"""

from datetime import UTC, date, datetime, time

from app.core.config import get_settings


class Clock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        """Current business (Cairo) date."""
        return self.now().astimezone(get_settings().tz).date()


class FrozenClock(Clock):
    def __init__(self, at: datetime) -> None:
        if at.tzinfo is None:
            raise ValueError("FrozenClock requires an aware datetime")
        self._at = at.astimezone(UTC)

    def now(self) -> datetime:
        return self._at

    def set(self, at: datetime) -> None:
        self._at = at.astimezone(UTC)


_clock: Clock = Clock()


def get_clock() -> Clock:
    return _clock


def set_clock(clock: Clock) -> None:
    global _clock
    _clock = clock


def business_datetime(day: date, at: time) -> datetime:
    """Combine a business date and local wall time into an aware UTC datetime."""
    return datetime.combine(day, at, tzinfo=get_settings().tz).astimezone(UTC)


def to_business_tz(value: datetime) -> datetime:
    return value.astimezone(get_settings().tz)
