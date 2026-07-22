"""sync_provisioned_dashboard: agent edits to file-provisioned dashboards must
land in the provisioning JSON (the file provider reverts DB-only saves).

grafana_active_alerts: the machine-observed alertmanager-v2 shaping the
on-call closing step (agents.oncall.run_oncall) relies on to decide whether
an incident may close — never the model's own say-so."""

import json

from agent_service.tools import backends
from agent_service.tools.backends import sync_provisioned_dashboard


def _write(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_matching_uid_rewrites_the_provisioning_file(tmp_path):
    _write(tmp_path / "gateway-red.json", {"uid": "gateway-red", "title": "old", "panels": []})
    _write(tmp_path / "other.json", {"uid": "other", "title": "untouched"})

    model = {
        "uid": "gateway-red",
        "title": "Gateway · RED",
        "panels": [{"type": "row"}],
        "id": 42,
        "version": 7,
    }
    synced = sync_provisioned_dashboard(model, str(tmp_path))

    assert synced == "gateway-red.json"
    saved = json.loads((tmp_path / "gateway-red.json").read_text(encoding="utf-8"))
    assert saved["title"] == "Gateway · RED"
    assert saved["panels"] == [{"type": "row"}]
    assert "id" not in saved and "version" not in saved  # DB-side noise stripped
    untouched = json.loads((tmp_path / "other.json").read_text(encoding="utf-8"))
    assert untouched == {"uid": "other", "title": "untouched"}


def test_unknown_uid_touches_nothing(tmp_path):
    _write(tmp_path / "gateway-red.json", {"uid": "gateway-red", "title": "old"})
    assert sync_provisioned_dashboard({"uid": "brand-new", "title": "x"}, str(tmp_path)) is None
    saved = json.loads((tmp_path / "gateway-red.json").read_text(encoding="utf-8"))
    assert saved["title"] == "old"


def test_missing_dir_or_uid_is_a_noop(tmp_path):
    assert sync_provisioned_dashboard({"title": "no uid"}, str(tmp_path)) is None
    assert sync_provisioned_dashboard({"uid": "x"}, str(tmp_path / "nope")) is None


# ---- grafana_active_alerts: alertmanager v2 response shaping (httpx-mock) ----


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeHTTPClient:
    """Stand-in for backends._http()'s httpx.AsyncClient — records the call
    and hands back a canned alertmanager v2 payload."""

    def __init__(self, payload):
        self.payload = payload
        self.calls: list[tuple[str, dict]] = []

    async def get(self, url, params=None, **kwargs):
        self.calls.append((url, params or {}))
        return _FakeResponse(self.payload)


def _mock_http(monkeypatch, payload):
    client = _FakeHTTPClient(payload)
    monkeypatch.setattr(backends, "_http", lambda: client)
    return client


async def test_grafana_active_alerts_firing(monkeypatch):
    payload = [
        {
            "labels": {"alertname": "GatewayHighErrorRate"},
            "status": {"state": "active"},
            "startsAt": "2026-07-22T01:00:00.000Z",
            "endsAt": "0001-01-01T00:00:00Z",
        }
    ]
    client = _mock_http(monkeypatch, payload)
    result = await backends.grafana_active_alerts("GatewayHighErrorRate")
    assert result == {
        "alertname": "GatewayHighErrorRate",
        "active": True,
        "count": 1,
        "since": "2026-07-22T01:00:00.000Z",
    }
    assert client.calls[0][1] == {"filter": "alertname=GatewayHighErrorRate"}


async def test_grafana_active_alerts_none_firing(monkeypatch):
    _mock_http(monkeypatch, [])
    result = await backends.grafana_active_alerts("GatewayHighErrorRate")
    assert result == {"alertname": "GatewayHighErrorRate", "active": False, "count": 0, "since": None}


async def test_grafana_active_alerts_suppressed_is_not_active(monkeypatch):
    payload = [
        {
            "labels": {"alertname": "GatewayHighErrorRate"},
            "status": {"state": "suppressed"},
            "startsAt": "2026-07-22T01:00:00.000Z",
        }
    ]
    _mock_http(monkeypatch, payload)
    result = await backends.grafana_active_alerts("GatewayHighErrorRate")
    assert result["active"] is False
    assert result["count"] == 0
    assert result["since"] is None


async def test_grafana_active_alerts_ignores_non_matching_alertname(monkeypatch):
    """The filter param is a hint to Alertmanager, not a guarantee — the shaping
    must still only count entries whose labels.alertname matches exactly."""
    payload = [
        {"labels": {"alertname": "SomethingElse"}, "status": {"state": "active"},
         "startsAt": "2026-07-22T01:00:00.000Z"},
    ]
    _mock_http(monkeypatch, payload)
    result = await backends.grafana_active_alerts("GatewayHighErrorRate")
    assert result == {"alertname": "GatewayHighErrorRate", "active": False, "count": 0, "since": None}


async def test_grafana_active_alerts_requires_name():
    result = await backends.grafana_active_alerts("")
    assert "error" in result


async def test_grafana_active_alerts_never_raises_on_http_failure(monkeypatch):
    class _Boom:
        async def get(self, *a, **k):
            raise RuntimeError("connection refused")

    monkeypatch.setattr(backends, "_http", lambda: _Boom())
    result = await backends.grafana_active_alerts("GatewayHighErrorRate")
    assert "error" in result
