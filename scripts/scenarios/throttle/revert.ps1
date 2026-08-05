<#
  throttle : revert

  Clears the model-proxy override on every replica; shedding stops with the next
  request. Idempotent and safe on a healthy lab.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
