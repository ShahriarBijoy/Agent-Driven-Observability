"""kubectl_read must be a shaped, injection-proof window: fixed argv only,
validated inputs, secrets refused before RBAC even gets a say. k8s_events must
turn logfmt event lines into a compact oldest-first timeline."""

import dataclasses
from types import SimpleNamespace

import pytest

from agent_service.tools import backends


@pytest.fixture
def fake_kubectl(monkeypatch, tmp_path):
    """Point config at an existing kubeconfig and capture the argv kubectl
    would have received instead of running it."""
    kubeconfig = tmp_path / "agent-ro.yaml"
    kubeconfig.write_text("apiVersion: v1\nkind: Config\n", encoding="utf-8")
    monkeypatch.setattr(  # Config is frozen — swap the module ref, not the field
        backends, "config", dataclasses.replace(backends.config, k8s_kubeconfig=str(kubeconfig))
    )
    calls: list[list[str]] = []

    def _run(argv, capture_output, text, timeout):
        calls.append(argv)
        return SimpleNamespace(returncode=0, stdout="OUT", stderr="")

    monkeypatch.setattr(backends.subprocess, "run", _run)
    return calls


async def test_get_defaults_to_all_namespaces(fake_kubectl):
    result = await backends.kubectl_read("get", "pods")
    assert "error" not in result
    assert fake_kubectl[0][3:] == ["get", "pods", "-A", "-o", "wide"]


async def test_get_by_name_defaults_to_subject_namespace(fake_kubectl):
    await backends.kubectl_read("get", "deployments", name="gateway")
    assert fake_kubectl[0][3:] == ["get", "deployments", "gateway", "-n", "subject", "-o", "wide"]


async def test_describe_needs_a_name_or_selector(fake_kubectl):
    result = await backends.kubectl_read("describe", "pods")
    assert "error" in result and not fake_kubectl


async def test_secrets_are_refused_in_every_spelling(fake_kubectl):
    for resource in ("secret", "secrets", "secrets.v1"):
        result = await backends.kubectl_read("get", resource)
        assert "error" in result, resource
    assert not fake_kubectl


async def test_flag_injection_is_rejected(fake_kubectl):
    result = await backends.kubectl_read("get", "pods", name="--kubeconfig=/tmp/evil")
    assert "error" in result
    result = await backends.kubectl_read("get", "pods;rm")
    assert "error" in result
    assert not fake_kubectl


async def test_mutating_verbs_are_rejected(fake_kubectl):
    for verb in ("delete", "apply", "exec", "edit"):
        result = await backends.kubectl_read(verb, "pods")
        assert "error" in result, verb
    assert not fake_kubectl


async def test_missing_kubeconfig_reports_the_fix(monkeypatch, tmp_path):
    monkeypatch.setattr(
        backends, "config",
        dataclasses.replace(backends.config, k8s_kubeconfig=str(tmp_path / "absent.yaml")),
    )
    result = await backends.kubectl_read("get", "pods")
    assert "agent-kubeconfig" in result["error"]


async def test_kubectl_error_is_surfaced(monkeypatch, fake_kubectl):
    def _fail(argv, capture_output, text, timeout):
        return SimpleNamespace(returncode=1, stdout="", stderr="Forbidden")

    monkeypatch.setattr(backends.subprocess, "run", _fail)
    result = await backends.kubectl_read("get", "pods")
    assert result["error"] == "Forbidden"


async def test_k8s_events_builds_timeline_oldest_first(monkeypatch):
    async def _loki(logql, range, limit):
        assert 'job="integrations/kubernetes/eventhandler"' in logql
        assert 'namespace="subject"' in logql
        assert 'level="Warning"' in logql
        return {
            "lines": [
                {"ts": "1700000060000000000",
                 "line": 'name=gw-2 kind=Pod reason=BackOff count=3 msg="Back-off restarting"',
                 "labels": {"level": "Warning", "namespace": "subject", "reason": "BackOff"}},
                {"ts": "1700000000000000000",
                 "line": 'name=gw-1 kind=Pod reason=Failed msg="pull failed"',
                 "labels": {"level": "Warning", "namespace": "subject", "reason": "Failed"}},
            ]
        }

    monkeypatch.setattr(backends, "loki_query", _loki)
    result = await backends.k8s_events(namespace="subject", level="warning")
    assert result["count"] == 2
    first, second = result["events"]
    assert first["object"] == "Pod/gw-1" and second["object"] == "Pod/gw-2"
    assert second["seen"] == "x3"
    assert first["message"] == "pull failed"


async def test_k8s_events_rejects_injection_shaped_filters():
    result = await backends.k8s_events(namespace='x", cluster="evil')
    assert "error" in result
    result = await backends.k8s_events(object_name="a`}: {job=`steal")
    assert "error" in result
