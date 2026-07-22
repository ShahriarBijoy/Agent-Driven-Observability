"""Unified alert ingress (PLAN-2 P11, Task 3) — one front door for both
Grafana unified-alerting webhooks and the gitops-reporter's failure/resolution
events, normalized to a common `AlertEvent` shape and deduped per alert_key
against the open-incidents table.

HMAC verification (`verify_signature`): find-docs (Grafana 13.1 docs,
`alerting/configure-notifications/manage-contact-points/integrations/
webhook-notifier`) confirms Grafana signs the *plain* request body —
`HMAC-SHA256(secret, body)` hex-encoded — into a single header
(`X-Grafana-Alerting-Signature` by default, configurable via
`hmacConfig.header`). A `timestamp + ":" + body` scheme only applies when a
*separate* `hmacConfig.timestampHeader` is also configured, in which case the
timestamp travels in its own header, not packed into the signature header
value. There is no Stripe-style single `t=..,v1=..` header in Grafana's own
webhook notifier. Our contact-points.yaml does not set `timestampHeader`, so
production traffic is exactly the plain-hex case the roundtrip test exercises.
The `t=`/`v1=` parsing kept below is a defensive fallback only (e.g. a
hand-rolled relay in front of Grafana) — real Grafana 13 traffic never takes
that branch.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .agents.incident import _SEV

GRAFANA_SIG_HEADER = "X-Grafana-Alerting-Signature"

# gitops-reporter events that mean "the thing that was firing is over" (mirrors
# GITOPS_FAILURE_EVENTS' counterpart in agents/gitops.py, but ingress only
# needs the resolved side to decide firing vs resolved).
_GITOPS_RESOLVED_EVENTS = {"on-rollout-completed", "on-sync-succeeded", "on-deployed"}

# Label keys checked in order for the workload dimension of the dedupe key.
_WORKLOAD_LABELS = ("workload", "service", "deployment", "job")


@dataclass
class AlertEvent:
    status: str          # "firing" | "resolved"
    alertname: str
    workload: str        # labels: workload|service|deployment|job first hit, else ""
    severity: str        # sev1|sev2|sev3 (agents/incident.py's _SEV mapping)
    tenant: str           # default "acme"
    starts_at: datetime | None
    fingerprint: str | None
    summary: str          # annotation summary/description or alertname
    raw: dict = field(default_factory=dict)


def verify_signature(raw_body: bytes, header_value: str | None, secret: str) -> bool:
    """True iff `header_value` is a valid HMAC-SHA256 signature of `raw_body`
    under `secret`. Missing header or empty secret never verifies."""
    if not header_value or not secret:
        return False
    key = secret.encode()
    expected = hmac.new(key, raw_body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, header_value):
        return True
    # Defensive fallback only — see module docstring; Grafana 13 itself never
    # sends this combined form.
    if "v1=" in header_value:
        fields = dict(part.split("=", 1) for part in header_value.split(",") if "=" in part)
        ts, v1 = fields.get("t"), fields.get("v1")
        if ts is not None and v1 is not None:
            candidate = hmac.new(key, f"{ts}:".encode() + raw_body, hashlib.sha256).hexdigest()
            return hmac.compare_digest(candidate, v1)
    return False


def payload_kind(payload: dict) -> str:
    """Distinguish a Grafana unified-alerting webhook from a gitops-reporter
    notification (PLAN-2 P10's on-* events) from anything unrecognised."""
    if "event" in payload:
        return "gitops"
    if "alerts" in payload:
        return "grafana"
    return "unknown"


def _workload_from_labels(labels: dict[str, Any]) -> str:
    for key in _WORKLOAD_LABELS:
        value = labels.get(key)
        if value:
            return str(value)
    return ""


def _parse_starts_at(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_grafana(payload: dict) -> list[AlertEvent]:
    alerts = payload.get("alerts") or []
    common_labels = payload.get("commonLabels") or {}
    common_annotations = payload.get("commonAnnotations") or {}
    top_status = payload.get("status")
    events: list[AlertEvent] = []
    for alert in alerts:
        labels = {**common_labels, **(alert.get("labels") or {})}
        annotations = {**common_annotations, **(alert.get("annotations") or {})}
        alertname = labels.get("alertname") or payload.get("title") or "Grafana alert"
        events.append(
            AlertEvent(
                status=alert.get("status") or top_status or "firing",
                alertname=alertname,
                workload=_workload_from_labels(labels),
                severity=_SEV.get(str(labels.get("severity", "")).lower(), "sev2"),
                tenant=labels.get("tenant") or "acme",
                starts_at=_parse_starts_at(alert.get("startsAt")),
                fingerprint=alert.get("fingerprint"),
                summary=annotations.get("summary") or annotations.get("description") or alertname,
                raw=alert,
            )
        )
    return events


def _normalize_gitops(payload: dict) -> list[AlertEvent]:
    event = str(payload.get("event", ""))
    workload = str(payload.get("app", ""))
    status = "resolved" if event in _GITOPS_RESOLVED_EVENTS else "firing"
    return [
        AlertEvent(
            status=status,
            alertname=event,
            workload=workload,
            severity="sev2",
            tenant="acme",
            starts_at=None,
            fingerprint=None,
            summary=event or "gitops event",
            raw=payload,
        )
    ]


def normalize(payload: dict) -> list[AlertEvent]:
    """One AlertEvent per entry in a Grafana `alerts[]` group, or a single
    event for a gitops-reporter notification. Unrecognised shapes yield []
    rather than raising — a webhook endpoint must never 500 on a stray ping."""
    kind = payload_kind(payload)
    if kind == "grafana":
        return _normalize_grafana(payload)
    if kind == "gitops":
        return _normalize_gitops(payload)
    return []


def alert_key(ev: AlertEvent) -> str:
    """Dedupe key: incidents opened for the same alertname+workload attach
    instead of spawning a second investigation."""
    return f"{ev.alertname}/{ev.workload}"


def ingress_decision(ev: AlertEvent, open_incident: dict | None) -> str:
    """firing + none -> spawn; firing + open -> attach;
    resolved + open -> close; resolved + none -> ignore."""
    if ev.status == "firing":
        return "spawn" if open_incident is None else "attach"
    return "close" if open_incident is not None else "ignore"
