"""Cache-health check: per-tenant embedding cache hit ratio.

An anomalously low hit ratio (with enough samples) signals either cache eviction
or a shift in the prompt population — both worth surfacing.
"""

from __future__ import annotations


def cache_hit_ratio(hits: int, total: int) -> float | None:
    """Hit ratio, or ``None`` when there is no traffic to measure."""
    if total <= 0:
        return None
    return hits / total


def classify_cache(
    ratio: float | None,
    total: int,
    min_samples: int,
    min_ratio: float,
) -> str | None:
    """``low`` when the ratio is below ``min_ratio`` and there are enough samples."""
    if ratio is None or total < min_samples:
        return None
    if ratio < min_ratio:
        return "low"
    return None
