"""Freshness check: how long since a dataset (or tenant) last produced data."""

from __future__ import annotations

from datetime import datetime


def freshness_seconds(last: datetime | None, now: datetime) -> float | None:
    """Seconds elapsed since ``last``, or ``None`` when there is no data yet."""
    if last is None:
        return None
    return (now - last).total_seconds()


def classify_freshness(seconds: float | None, max_seconds: float) -> str | None:
    """``medium`` when data is older than ``max_seconds``; otherwise healthy."""
    if seconds is None:
        return None
    if seconds > max_seconds:
        return "medium"
    return None
