<#
  pod-kill : revert

  There is nothing to undo - the pods are already back. What this does instead
  is what a revert is FOR: leave the lab in a state the next scenario can trust,
  by waiting for the rollout to be Healthy again rather than returning
  immediately and letting the exam inject its next fault into a half-scheduled
  cluster.

  Idempotent and safe on a healthy lab, like every other revert in the pack.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json

if (-not (Test-ClusterReachable)) { exit 1 }

if (-not (Assert-RolloutHealthy -Name $meta.k8s.app -TimeoutSec 300)) {
    Write-Warning 'the gateway rollout has not recovered from the pod kill - check: obs k8s status'
    exit 1
}

Write-Step 'pod-kill: nothing to revert; gateway is Healthy'
exit 0
