<#
  06-probe-regression : revert

  Writes the captured readiness path back, restores the Application's committed
  sync policy, and waits for the Rollout to return to Healthy.

  With no state file this exits 0 having done nothing.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$state = Get-ScenarioState $meta.id
$probePath = '/spec/template/spec/containers/0/readinessProbe/httpGet/path'

if ($null -eq $state) {
    Write-Step '06-probe-regression: nothing to revert (no inject state)'
    Restore-AutoSync $meta.k8s.argo_app
    exit 0
}

# Brackets by hand - see inject.ps1: a one-element array would serialise as an
# object and kubectl needs a list of patch operations.
$patchFile = Join-Path $env:TEMP 'obs-06-probe-regression-restore.json'
$op = @{ op = 'replace'; path = $probePath; value = $state.path } | ConvertTo-Json -Compress
Set-Content -Encoding ascii -Path $patchFile -Value "[$op]"

Write-Step "06-probe-regression: restoring $($state.app) readinessProbe path=$($state.path)"
Invoke-Kubectl @('-n', $SubjectNs, 'patch', "deployment/$($state.app)", '--type=json', '--patch-file', $patchFile) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl patch failed - the lab is still broken'; exit 1 }

Restore-AutoSync $meta.k8s.argo_app

$live = Get-DeploymentField -App $state.app -JsonPath '{.spec.template.spec.containers[0].readinessProbe.httpGet.path}'
if ($live -ne $state.path) {
    Write-Warning "revert did not take: $($state.app) readinessProbe path=$live"
    exit 1
}

if (-not (Assert-RolloutHealthy -Name $state.app -TimeoutSec 300)) {
    Write-Warning 'the probe path is restored but the rollout has not settled - check: obs k8s status'
    exit 1
}

Clear-ScenarioState $meta.id
Write-Step '06-probe-regression reverted: probe path restored, rollout Healthy'
exit 0
