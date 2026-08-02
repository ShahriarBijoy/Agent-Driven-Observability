<#
  02-error-storm : revert

  Clears the retriever override on every replica, returning the plane to its env
  base. Idempotent by construction - DELETE on an already-clean plane is a no-op
  - so this is safe to run on a healthy lab, and safe to run twice when a
  remediating agent has already cleared it.

  Nothing here touches a pod spec, so there is no Argo state to restore.
#>

. (Join-Path $PSScriptRoot '..\_lib\knob-scenario.ps1')

if (Invoke-KnobRevert $PSScriptRoot) { exit 0 }
exit 1
