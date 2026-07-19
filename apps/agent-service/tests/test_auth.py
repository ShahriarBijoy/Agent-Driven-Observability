"""X-Obs-Token gate on state-changing endpoints (PLAN-2 P7 hardening)."""

from __future__ import annotations

import dataclasses
import json

from starlette.requests import Request

from agent_service import app as app_module


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "method": "POST", "path": "/x", "headers": raw})


def _set_token(monkeypatch, value: str | None) -> None:
    monkeypatch.setattr(
        app_module, "config", dataclasses.replace(app_module.config, obs_token=value)
    )


def _body(response) -> dict:
    return json.loads(bytes(response.body))


def test_unconfigured_token_closes_the_gate(monkeypatch):
    _set_token(monkeypatch, None)
    denied = app_module.require_obs_token(_request({"x-obs-token": "anything"}))
    assert denied is not None
    assert denied.status_code == 503
    assert _body(denied)["error"]["code"] == "auth_unconfigured"


def test_missing_header_is_rejected(monkeypatch):
    _set_token(monkeypatch, "s3cret")
    denied = app_module.require_obs_token(_request())
    assert denied is not None
    assert denied.status_code == 403


def test_wrong_token_is_rejected(monkeypatch):
    _set_token(monkeypatch, "s3cret")
    denied = app_module.require_obs_token(_request({"x-obs-token": "nope"}))
    assert denied is not None
    assert denied.status_code == 403


def test_correct_token_passes(monkeypatch):
    _set_token(monkeypatch, "s3cret")
    assert app_module.require_obs_token(_request({"x-obs-token": "s3cret"})) is None


def test_header_name_is_case_insensitive(monkeypatch):
    _set_token(monkeypatch, "s3cret")
    assert app_module.require_obs_token(_request({"X-Obs-Token": "s3cret"})) is None
