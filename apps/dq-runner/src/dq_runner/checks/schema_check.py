"""Schema check: validate stored responses against the ChatResponse contract.

Because the gateway emits well-typed responses, structural failures are rare by
construction — the check guards against upstream contract drift and degraded
(e.g. empty-completion) responses. See docs/adr/004-data-observability.md.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from dq_runner.schemas import ChatResponse


def validate_response(obj: Any) -> str | None:
    """Return a short error message if ``obj`` is not a valid ChatResponse, else None."""
    if not isinstance(obj, dict):
        return "response is not an object"
    try:
        resp = ChatResponse.model_validate(obj)
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first.get("loc", ()))
        return f"{loc}: {first.get('msg', 'schema validation error')}"
    if not resp.completion.strip():
        return "completion is empty"
    if not resp.model.strip():
        return "model is empty"
    return None


def count_schema_failures(responses: list[Any]) -> tuple[int, list[str]]:
    """Validate a batch of responses; return ``(failure_count, error_messages)``."""
    errors = [err for obj in responses if (err := validate_response(obj)) is not None]
    return (len(errors), errors)
