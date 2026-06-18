"""OpenTelemetry wiring for agent-service.

Self-observability is a first-class Phase-5 requirement: every agent run is a
trace, every tool call a span. This module sets up the tracer provider and the
OTLP/HTTP exporter (pointed at Alloy). If no OTLP endpoint is configured we
still install a provider so spans are created — they just aren't exported,
which keeps host dev runnable without the observability stack.
"""

from __future__ import annotations

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .config import config

_initialised = False


def init_telemetry() -> None:
    global _initialised
    if _initialised:
        return
    _initialised = True

    resource = Resource.create(
        {
            "service.name": config.service_name,
            "service.namespace": "observability-lab",
            "deployment.environment": "lab",
        }
    )
    provider = TracerProvider(resource=resource)

    if config.otel_endpoint:
        # OTLP/HTTP exporter appends /v1/traces to the base endpoint.
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )

        exporter = OTLPSpanExporter(endpoint=f"{config.otel_endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)


def get_tracer() -> trace.Tracer:
    return trace.get_tracer("agent-service")


def instrument_app(app: object) -> None:
    """Auto-instrument FastAPI + httpx + asyncpg. Best-effort — instrumentation
    packages may lag the core SDK, so a missing one must not crash the service."""
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001 — instrumentation is optional
        pass
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception:  # noqa: BLE001
        pass
    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor

        AsyncPGInstrumentor().instrument()
    except Exception:  # noqa: BLE001
        pass
