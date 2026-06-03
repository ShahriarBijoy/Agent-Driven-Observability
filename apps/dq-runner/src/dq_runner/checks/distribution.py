"""Distribution / drift check: two-sample Kolmogorov-Smirnov distance.

The KS statistic D is the supremum gap between two empirical CDFs, already
bounded in [0, 1] (0 = identical, 1 = disjoint), so it doubles as a normalised
drift score. See docs/adr/004-data-observability.md for the threshold rationale.
"""

from __future__ import annotations

from collections.abc import Sequence

from scipy.stats import ks_2samp


def ks_drift(
    baseline: Sequence[float],
    current: Sequence[float],
    min_samples: int = 20,
) -> float | None:
    """KS distance between two samples, or ``None`` when either is too small."""
    if len(baseline) < min_samples or len(current) < min_samples:
        return None
    return float(ks_2samp(baseline, current).statistic)


def classify_drift(ks: float, warn: float = 0.25, high: float = 0.4) -> str | None:
    """Severity for a KS drift score: ``high`` > ``high`` threshold, ``medium`` > ``warn``."""
    if ks > high:
        return "high"
    if ks > warn:
        return "medium"
    return None
