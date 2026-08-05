<#
  04-oomkill : revert

  Writes the captured memory requests and limits back, restores the
  Application's committed sync policy, and waits for the Deployment to roll out
  a pod that stays up.

  The OOMKilled evidence in the old pod's lastState disappears with the pod
  itself, which is why the paired verify stops finding the signal after this
  runs - exactly the behaviour Test-Scenario's second verify checks for.

  With no state file this exits 0 having done nothing.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$state = Get-ScenarioState $meta.id

if ($null -eq $state) {
    Write-Step '04-oomkill: nothing to revert (no inject state)'
    Restore-AutoSync $meta.k8s.argo_app
    exit 0
}

Write-Step "04-oomkill: restoring $($state.app) memory requests=$($state.requests) limits=$($state.limits)"
Invoke-Kubectl @(
    '-n', $SubjectNs, 'set', 'resources', "deployment/$($state.app)",
    "--requests=memory=$($state.requests)", "--limits=memory=$($state.limits)"
) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set resources failed - the lab is still broken'; exit 1 }

Restore-AutoSync $meta.k8s.argo_app

$lim = Get-DeploymentField -App $state.app -JsonPath '{.spec.template.spec.containers[0].resources.limits.memory}'
if ($lim -ne $state.limits) {
    Write-Warning "revert did not take: $($state.app) memory limit=$lim"
    exit 1
}

if (-not (Wait-DeploymentRollout -App $state.app -TimeoutSec 180)) {
    Write-Warning 'limits are restored but the deployment has not settled - check: obs k8s status'
    exit 1
}

Clear-ScenarioState $meta.id
Write-Step '04-oomkill reverted: memory restored, deployment rolled out'
exit 0
