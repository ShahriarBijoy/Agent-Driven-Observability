<#
  brownout : verify

  1. the fault is live  - every retriever instance reports errorRate >= 0.2
  2. its signal exists   - at least 3 of 30 probes 5xx

  The sample is wider than the other scenarios' for one reason: a weak fault
  needs more evidence to be told apart from the lab's own background failure
  rate. That trade - more probes, same confidence - is the whole difficulty of
  the scenario, made explicit.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
