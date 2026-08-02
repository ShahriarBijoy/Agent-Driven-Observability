<#
  05-phantom-tag : revert

  Writes the captured image reference back, restores the Application's committed
  sync policy, and waits for the Rollout to return to Healthy.

  Restoring the exact captured reference matters more here than anywhere else in
  the pack: the deployed tag is a CI sha that changes with every deploy, so a
  revert that wrote a hardcoded tag would "work" while quietly rolling the lab
  back to an older build.

  With no state file this exits 0 having done nothing.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$state = Get-ScenarioState $meta.id

if ($null -eq $state) {
    Write-Step '05-phantom-tag: nothing to revert (no inject state)'
    Restore-AutoSync $meta.k8s.argo_app
    exit 0
}

Write-Step "05-phantom-tag: restoring $($state.app) image=$($state.image)"
Invoke-Kubectl @('-n', $SubjectNs, 'set', 'image', "deployment/$($state.app)", "$($state.app)=$($state.image)") | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set image failed - the lab is still broken'; exit 1 }

Restore-AutoSync $meta.k8s.argo_app

$image = Get-DeploymentField -App $state.app -JsonPath '{.spec.template.spec.containers[0].image}'
if ($image -ne $state.image) {
    Write-Warning "revert did not take: $($state.app) image=$image"
    exit 1
}

if (-not (Assert-RolloutHealthy -Name $state.app -TimeoutSec 300)) {
    Write-Warning 'the image is restored but the rollout has not settled - check: obs k8s status'
    exit 1
}

Clear-ScenarioState $meta.id
Write-Step '05-phantom-tag reverted: image restored, rollout Healthy'
exit 0
