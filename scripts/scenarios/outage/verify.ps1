<#
  outage : verify

  1. the fault is live  - every retriever instance reports outage = true
  2. its signal exists   - at least 10 of 12 probes 5xx

  The threshold is near-total on purpose. A partial failure rate would mean the
  outage flag did not reach every instance, and reporting that as "the outage is
  live" would hand the next scenario a lab that is quietly still broken.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
