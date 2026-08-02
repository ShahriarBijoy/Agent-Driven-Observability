<#
  timeout : verify

  1. the fault is live  - every model-proxy instance reports pStall >= 0.25
  2. its signal exists   - probes come back with the gateway error code
                           `upstream_timeout`, not merely "some 5xx"

  Asserting on the code rather than the status class is what makes this drill
  distinguishable from the error storm at all: both produce 5xx, and only the
  code (and the 8s span) says which one happened.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
