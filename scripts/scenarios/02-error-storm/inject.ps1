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

  The mechanism moved into _lib/knob-scenario.ps1 once six more scenarios
  wanted the same three steps with different knobs; what stays here is the
  story and the numbers in scenario.json.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. Gateway 502s should appear within ~30s; the 5xx alert fires ~2-3 min in.'
    exit 0
}
exit 1
