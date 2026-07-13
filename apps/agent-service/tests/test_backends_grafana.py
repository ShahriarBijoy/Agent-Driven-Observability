"""sync_provisioned_dashboard: agent edits to file-provisioned dashboards must
land in the provisioning JSON (the file provider reverts DB-only saves)."""

import json

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
