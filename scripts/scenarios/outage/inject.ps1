<#
  outage : inject   (retained drill, not an exam question)

  The retriever 503s on every /v1/retrieve, so effectively every chat request
  fails with 502 upstream_error. The starkest signature in the pack:
  availability falls off a cliff, the failing span is always the retriever, and
  embedder and model-proxy are untouched.

  Not an exam question precisely because it is that obvious - it is the same
  shape as 02-error-storm with the difficulty removed. Kept as the "is the
  alerting chain alive at all" smoke drill, and as the fastest way to produce a
  loud incident on demand.

  Idempotent: re-injecting sets the same flag again.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobInject $PSScriptRoot) {
    Write-Step 'injected. Near-total 502s immediately; the availability alert fires ~2 min in.'
    exit 0
}
exit 1
