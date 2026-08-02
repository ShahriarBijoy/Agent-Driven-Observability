<#
  02-error-storm : inject

  The retriever fails 30% of calls; the gateway surfaces them as 502
  upstream_error. Availability burn-rate alerts fire, failed spans terminate at
  the retriever, and nothing restarts - the pods stay Ready throughout, which is
  the tell that separates this from a crashloop.

  Matrix deviation, deliberate: the failure matrix puts the error storm on
  model-proxy and the latency drill on retriever. Only model-proxy has latency
  knobs (retriever's chaos plane exposes outage + errorRate only), so the two
  are swapped - 01-latency stays on model-proxy, the error storm moves here.
  The pair still differs in BOTH service and signal, which is what the exam
  needs, and the answer key matches what ships.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\chaos-plane.ps1')

if (-not (Test-ChaosPlaneReachable 'retriever')) { exit 1 }

Write-Step '02-error-storm: retriever errorRate -> 0.30'
$snapshot = Set-ChaosKnobs -Service 'retriever' -Knobs @{ errorRate = 0.3 }

# Trust the plane's own snapshot, not the HTTP status: a 200 with the knob
# unset would leave the exam grading an agent on a fault that never happened.
if ($null -eq $snapshot.errorRate -or $snapshot.errorRate -lt 0.3) {
    Write-Warning "the plane accepted the POST but reports errorRate=$($snapshot.errorRate)"
    exit 1
}

Write-Step 'injected. Gateway 502s should appear within ~30s; the 5xx alert fires ~2-3 min in.'
exit 0
