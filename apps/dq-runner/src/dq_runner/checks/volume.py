"""Volume check: compare a rolling 1-minute inference count to a 1-hour baseline."""

from __future__ import annotations


def volume_ratio(current_count: int, baseline_per_min: float) -> float | None:
    """Ratio of the current 1-minute count to the baseline per-minute rate.

    Returns ``None`` when there is no baseline traffic to compare against (the
    ratio is undefined, so the check abstains rather than false-alarming).
    """
    if baseline_per_min <= 0:
        return None
    return current_count / baseline_per_min


def classify_volume(ratio: float, low: float, high: float) -> tuple[str, str] | None:
    """Classify a volume ratio into ``(kind, severity)`` or ``None`` (healthy).

    A collapse (ratio below ``low``) is high severity — the pipeline may be
    starved; a spike (above ``high``) is medium severity.
    """
    if ratio < low:
        return ("low_volume", "high")
    if ratio > high:
        return ("high_volume", "medium")
    return None
