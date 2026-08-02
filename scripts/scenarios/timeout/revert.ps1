<#
  timeout : revert

  Clears the model-proxy override on every replica. Idempotent, safe on a
  healthy lab, and confirmed against the override rather than the effective
  config (the base config stalls 1% of requests on purpose).

  In-flight stalls are not cancelled: a request that already entered a 30s stall
  finishes stalling. Nothing needs to wait for them - the fault is gone for
  every request that arrives after this returns.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
