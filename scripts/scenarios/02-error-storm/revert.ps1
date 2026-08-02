<#
  02-error-storm : revert

  Clears the retriever override, returning the plane to its env base. Idempotent
  by construction - DELETE on an already-clean plane is a no-op - so this is
  safe to run on a healthy lab, and safe to run twice when a remediating agent
  has already cleared it.

  Nothing here touches a pod spec, so there is no Argo state to restore.
#>

. (Join-Path $PSScriptRoot '..\_lib\chaos-plane.ps1')

if (-not (Test-ChaosPlaneReachable 'retriever')) { exit 1 }

Clear-ChaosKnobs -Service 'retriever'

# Confirm rather than assume: a revert that silently failed would poison every
# scenario that follows it in an exam run.
$rate = Get-ActiveChaosValue -Service 'retriever' -Knob 'errorRate'
if ($null -ne $rate -and $rate -gt 0) {
    Write-Warning "revert did not take: retriever errorRate=$rate"
    exit 1
}

Write-Step '02-error-storm reverted: retriever chaos cleared'
exit 0
