<#
  flaky : verify

  Knobs only - see inject.ps1 for why this scenario cannot assert its own
  signal, and why that keeps it out of the exam. The knob check is still a real
  gate: it proves the override reached every model-proxy replica, and it stops
  finding it the moment revert runs.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobVerify $PSScriptRoot) { exit 0 }
exit 1
