<#
  sync-fail : revert

  A revert commit on obs-gitops main, then wait for the next sync to go green.
  The fix is a commit because the break was one - reverting a gitops incident
  by editing the cluster would leave the repo still broken and the next sync
  still failing.

  Idempotent by content: a clean main means nothing to do.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-sync-fail-revert'
if (-not $work) { exit 1 }

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -notmatch [regex]::Escape($meta.git.marker)) {
        Write-Step 'sync-fail: nothing to revert - main is already clean'
    } else {
        $sha = Undo-GiteaCommit -Path $work -Subject $meta.git.subject
        if (-not $sha) { exit 1 }
        Write-Step "sync-fail: revert $sha is on main"
    }
} finally {
    Remove-GiteaWork $work
}

if (-not (Assert-ArgoSyncRecovered -App $meta.k8s.argo_app -TimeoutSec 300)) {
    Write-Warning 'main is clean but Argo has not recovered - check: obs gitops status'
    exit 1
}

Write-Step 'sync-fail reverted: the desired state applies again'
exit 0
