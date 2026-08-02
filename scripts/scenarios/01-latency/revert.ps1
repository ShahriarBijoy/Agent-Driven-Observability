<#
  01-latency : revert

  Clears the model-proxy override on every replica, returning the plane to its
  env base. Idempotent by construction - DELETE on an already-clean plane is a
  no-op - so this is safe on a healthy lab and safe to run twice when a
  remediating agent has already cleared it.

  The confirmation reads the OVERRIDE, not the effective config: model-proxy's
  base config is non-zero on purpose, so "no latency configured at all" is never
  true and would fail a perfectly good revert.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
