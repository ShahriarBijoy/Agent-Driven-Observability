<#
  flaky : revert

  Clears the model-proxy override on every replica. A bad minute already in
  progress runs out its 45 seconds inside the pod - the window is timestamp
  state, not config - so a burst may outlive this command by up to that long.
  Nothing downstream depends on it: the next scenario's settle gate is an
  `obs smoke`, which would fail on a still-degraded lab rather than paper over
  it.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
