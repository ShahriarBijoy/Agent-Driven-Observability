<#
  bad-deploy : revert

  The fix ships the same way the break did: a revert commit on main, which CI
  tests and builds like any other change. No force-push - the history of the
  drill is part of what an investigating agent reads, and rewriting it would
  erase the evidence the exercise is about.

  Idempotent by content: if the marker is no longer on main, someone (a human in
  the Gitea UI, an earlier revert) already fixed it and this exits 0 having done
  nothing.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-deploy-revert'
if (-not $work) { exit 1 }

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -notmatch [regex]::Escape($meta.git.marker)) {
        Write-Step 'bad-deploy: nothing to revert - main is already clean'
        exit 0
    }

    $sha = Undo-GiteaCommit -Path $work -Subject $meta.git.subject
    if (-not $sha) { exit 1 }

    # Confirm against the pushed tree rather than the local one: a push that
    # was rejected would otherwise look like a successful revert.
    git -C $work fetch -q origin main
    $pushed = (git -C $work show "origin/main:$($meta.git.file)")
    if (($pushed -join "`n") -match [regex]::Escape($meta.git.marker)) {
        Write-Warning 'revert did not take: the marker is still on origin/main'
        exit 1
    }

    Write-Step "bad-deploy reverted: $sha is on main; the next CI run rebuilds the clean image"
    exit 0
} finally {
    Remove-GiteaWork $work
}
