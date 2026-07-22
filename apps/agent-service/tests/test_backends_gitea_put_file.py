"""gitea_put_file: a 409 always means the branch/file already exist (Gitea's
unambiguous conflict status), but a 422 is ambiguous — Gitea also returns it
for other validation failures — so it must only be treated as branch_exists
when the response body's own message actually says so; any other 422 must
surface its real message instead of being misreported as branch_exists."""

from __future__ import annotations

import dataclasses

from agent_service.tools import backends


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or (str(payload) if payload else "")

    def json(self):
        if self._payload is None:
            raise ValueError("no json body")
        return self._payload


class _FakeHTTPClient:
    def __init__(self, response: _FakeResponse):
        self.response = response
        self.calls: list[tuple[str, dict]] = []

    async def post(self, url, headers=None, json=None):
        self.calls.append((url, json))
        return self.response


def _wire(monkeypatch, response: _FakeResponse) -> _FakeHTTPClient:
    monkeypatch.setattr(
        backends, "config",
        dataclasses.replace(
            backends.config, gitea_token="tok", gitea_url="http://gitea.local",
            gitea_repo="obs/obs-lab",
        ),
    )
    client = _FakeHTTPClient(response)
    monkeypatch.setattr(backends, "_http", lambda: client)
    return client


async def test_409_is_always_branch_exists(monkeypatch):
    _wire(monkeypatch, _FakeResponse(409, {"message": "some unrelated conflict text"}))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert result == {"status": "branch_exists", "path": "postmortems/x.md", "branch": "postmortem/inc_1"}


async def test_422_with_branch_exists_message_is_branch_exists(monkeypatch):
    _wire(monkeypatch, _FakeResponse(422, {"message": "branch already exists"}))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert result["status"] == "branch_exists"


async def test_422_with_unrelated_message_surfaces_real_error(monkeypatch):
    _wire(monkeypatch, _FakeResponse(422, {"message": "invalid path: must not contain '..'"}))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert "error" in result
    assert "invalid path" in result["error"]
    assert "422" in result["error"]


async def test_422_with_no_json_body_surfaces_raw_text(monkeypatch):
    _wire(monkeypatch, _FakeResponse(422, None, text="unprocessable"))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert "error" in result
    assert "unprocessable" in result["error"]


async def test_created_on_success(monkeypatch):
    _wire(monkeypatch, _FakeResponse(201, {}))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert result == {"status": "created", "path": "postmortems/x.md", "branch": "postmortem/inc_1"}


async def test_other_error_status_surfaces_message(monkeypatch):
    _wire(monkeypatch, _FakeResponse(500, {"message": "internal server error"}))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert "error" in result
    assert "internal server error" in result["error"]


async def test_no_token_configured_errors_before_any_request(monkeypatch):
    monkeypatch.setattr(backends, "config", dataclasses.replace(backends.config, gitea_token=""))
    result = await backends.gitea_put_file("postmortems/x.md", "Y2FzZQ==", "postmortem/inc_1", "msg")
    assert result == {"error": backends._GITEA_HELP}
