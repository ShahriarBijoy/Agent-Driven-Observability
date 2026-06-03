"""A thread-safe snapshot of the latest check results.

The scheduler thread writes series here on each pass; the OpenTelemetry metric
reader thread reads them when it exports observable gauges. A series is a list of
``(value, attributes)`` points so one metric can carry several label sets
(e.g. one freshness point per tenant).
"""

from __future__ import annotations

import threading

Point = tuple[float, dict[str, str]]


class Snapshot:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, list[Point]] = {}

    def set_series(self, metric: str, points: list[Point]) -> None:
        with self._lock:
            self._data[metric] = list(points)

    def get_series(self, metric: str) -> list[Point]:
        with self._lock:
            return list(self._data.get(metric, []))
