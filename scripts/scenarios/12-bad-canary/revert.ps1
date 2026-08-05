<#
  12-bad-canary : revert

  A revert commit on obs-gitops main, then wait for the cluster to come back:
  Argo re-syncs the good template, Rollouts recognises it as the stable one and
  rolls straight back to it without re-running the canary steps.

  Reverting through git, not through the cluster, is the whole point. `kubectl`
  editing the live Deployment would leave the repo still describing the broken
  revision, so the next sync would re-apply it - a "fix" that lasts until Argo
  next looks.

  Idempotent by content: a clean main means nothing to push, and the wait then
  simply confirms the rollout is Healthy.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-canary-revert'
if (-not $work) { exit 1 }

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -notmatch [regex]::Escape($meta.git.marker)) {
        Write-Step '12-bad-canary: nothing to revert - main is already clean'
    } else {
        $sha = Undo-GiteaCommit -Path $work -Subject $meta.git.subject
        if (-not $sha) { exit 1 }
        Write-Step "12-bad-canary: revert $sha is on main"
    }
} finally {
    Remove-GiteaWork $work
}

# The live template must come back before the rollout can be judged healthy -
# otherwise a Healthy verdict could simply mean Argo has not synced the revert
# yet and the aborted canary already scaled to zero.
$restored = Wait-Until -TimeoutSec 240 -IntervalSec 10 -Condition {
    Request-ArgoRefresh $meta.k8s.argo_app
    $env = Get-DeploymentField -App $meta.k8s.app `
        -JsonPath "{.spec.template.spec.containers[0].env[?(@.name=='MODEL_PROXY_URL')].value}"
    return ($env -eq $meta.git.anchor)
}
if (-not $restored) {
    Write-Warning 'the revert is on main but Argo has not applied it - check: obs gitops status'
    exit 1
}

if (-not (Assert-RolloutHealthy -Name $meta.k8s.app -TimeoutSec 420)) {
    Write-Warning 'the template is restored but the rollout has not settled - check: obs rollouts'
    exit 1
}

Write-Step '12-bad-canary reverted: desired state restored, rollout Healthy'
exit 0
