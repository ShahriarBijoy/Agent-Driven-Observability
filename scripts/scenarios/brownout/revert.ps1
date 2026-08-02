<#
  brownout : revert

  Clears the retriever override on every replica. Idempotent and safe on a
  healthy lab.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
