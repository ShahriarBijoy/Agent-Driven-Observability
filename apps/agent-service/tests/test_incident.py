"""Tests for incident-reporter helpers: alert parsing + inbox summary extraction."""

from __future__ import annotations

from agent_service.agents.incident import _inbox_summary, summarize_alert


def test_summarize_alert_grafana_payload() -> None:
    payload = {
        "status": "firing",
        "alerts": [
            {
                "status": "firing",
                "labels": {"alertname": "Gateway 5xx rate > 2%", "severity": "page"},
                "annotations": {"summary": "gateway 5xx rate above 2%"},
            }
        ],
        "commonLabels": {"alertname": "Gateway 5xx rate > 2%", "severity": "page"},
    }
    info = summarize_alert(payload)
    assert info["alertname"] == "Gateway 5xx rate > 2%"
    assert info["severity"] == "sev1"  # page -> sev1
    assert info["status"] == "firing"
    assert info["summary"] == "gateway 5xx rate above 2%"


def test_summarize_alert_tolerates_empty() -> None:
    info = summarize_alert({})
    assert info["severity"] == "sev2"  # default
    assert info["alertname"]


def test_inbox_summary_prefers_postmortem_section() -> None:
    pm = "# Postmortem\n\n## Summary\nThe gateway returned 5xx due to upstream timeouts.\n\n## Impact\n..."
    out = _inbox_summary(pm, "I'll investigate this. Let me load tools.", "fallback")
    assert out == "The gateway returned 5xx due to upstream timeouts."


def test_inbox_summary_falls_back_to_last_paragraph() -> None:
    final = "First I investigated.\n\nConclusion: it was a model-proxy timeout."
    out = _inbox_summary(None, final, "fallback")
    assert out == "Conclusion: it was a model-proxy timeout."
