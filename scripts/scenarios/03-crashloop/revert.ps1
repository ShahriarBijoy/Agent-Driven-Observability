<#
  03-crashloop : revert

  Writes the captured env value back, restores the Application's committed sync
  policy, and waits for the Rollout to return to Healthy.

  No `rollout undo` anywhere: undo toggles between the last two revisions, so
  the second call of an idempotence check would re-inject the crash. Restoring
  the captured value is the same operation whether it runs once, twice, or
  after a remediating agent already fixed it.

  With no state file this exits 0 having done nothing - the healthy-lab case.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$state = Get-ScenarioState $meta.id

if ($null -eq $state) {
    Write-Step "03-crashloop: nothing to revert (no inject state)"
    # Still restore the sync policy: an interrupted inject can leave `automated`
    # removed with no state file written.
    Restore-AutoSync $meta.k8s.argo_app
    exit 0
}

Write-Step "03-crashloop: restoring $($state.app) $($state.key)=$($state.value)"
Invoke-Kubectl @('-n', $SubjectNs, 'set', 'env', "deployment/$($state.app)", "$($state.key)=$($state.value)") | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set env failed - the lab is still broken'; exit 1 }

Restore-AutoSync $meta.k8s.argo_app

# Confirm rather than assume: a revert that silently failed would poison every
# scenario that follows it in an exam run.
$live = Get-DeploymentField -App $state.app -JsonPath "{.spec.template.spec.containers[0].env[?(@.name=='$($state.key)')].value}"
if ($live -ne $state.value) {
    Write-Warning "revert did not take: $($state.app) $($state.key)=$live"
    exit 1
}

if (-not (Assert-RolloutHealthy -Name $meta.k8s.app -TimeoutSec 300)) {
    Write-Warning 'the env value is restored but the rollout has not settled - check: obs k8s status'
    exit 1
}

Clear-ScenarioState $meta.id
Write-Step '03-crashloop reverted: config restored, rollout Healthy'
exit 0
