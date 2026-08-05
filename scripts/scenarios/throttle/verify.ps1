<#
  throttle : verify

  1. the fault is live  - every model-proxy instance reports p429 >= 0.5
  2. its signal exists   - at least 4 of 12 probes return `model_overloaded`

  Both halves of that second assertion matter. Counting 429s alone would pass on
  a healthy lab that simply rate-limited the probe tenant, so the code has to
  match; and the threshold is 4 rather than 1 because the base config already
  sheds 3% with the same code, which a single hit could not be distinguished
  from.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
