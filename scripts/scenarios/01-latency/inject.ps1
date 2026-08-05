<#
  01-latency : inject

  "Slow is the new down". The model-proxy takes seconds instead of tens of
  milliseconds, but stays under the gateway's 8s upstream timeout, so every
  request SUCCEEDS. Nothing 5xxes, no pod restarts, no spec changes - the only
  thing that moves is the clock, and the p95 burn-rate alert is the only thing
  that pages.

  That is the whole point of this question: the reflex answers (a bad deploy, a
  crashing pod, a broken dependency) are all ruled out by evidence that ISN'T
  there, and the agent has to name a component from span durations alone.

  Matrix deviation, deliberate and shared with 02-error-storm: the failure
  matrix puts latency in retriever and the error storm in model-proxy. Only
  model-proxy has latency knobs - retriever's chaos plane exposes outage and
  errorRate only - so the two are swapped. The pair still differs in BOTH
  service and signal, which is what the exam needs, and the answer key matches
  what ships.

  Sizing comes from the drill this replaces (apps/load-generator/chaos/
  latency.yaml): base 2500ms + gamma(shape 2, scale 600ms), hard cap 6000ms -
  comfortably under UPSTREAM_TIMEOUT_MS (8000), so slow never becomes a timeout.

  Idempotent: re-injecting merges the same override again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. p95 climbs immediately; the latency alert needs its 5m window plus a 5m hold (~10 min).'
    exit 0
}
exit 1
