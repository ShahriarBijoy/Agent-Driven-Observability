<#
  14-red-pipeline : revert

  The fix ships the way the break did: a revert commit on main, which CI tests
  like any other change. No force-push - the history of the incident is what an
  investigating agent reads, and rewriting it would erase the evidence.

  Idempotent by content: if the regression is no longer on main then someone (a
  human in the Gitea UI, the auto-fixer, an earlier revert) already fixed it and
  this exits 0 having done nothing. That is why there is no state file to
  consult here - the repo IS the state, and a recorded sha could only ever go
  stale against a repo that moved on without it. The state this scenario does
  keep is the ci-shim counter baseline, which the repo cannot answer; it is
  cleared once the revert is confirmed on origin/main.

  The green-again wait is a report, not a gate. Once the revert is on
  origin/main the injected fault is undone by definition, so a slow or busy
  runner must not turn a successful revert into a failed one - the pack's
  contract is that revert leaves the lab clean, not that CI is quick. The one
  case that DOES exit non-zero is a revert run that goes red: main is still
  broken, this scenario is no longer the reason, and whoever is driving needs to
  know that before they start another one.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-red-pipeline-revert'
if (-not $work) { exit 1 }
$fixSha = ''

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -notmatch [regex]::Escape($meta.git.marker)) {
        Write-Step '14-red-pipeline: nothing to revert - main is already clean'
        Clear-ScenarioState $meta.id
        exit 0
    }

    $revertSha = Undo-GiteaCommit -Path $work -Subject $meta.git.subject
    if (-not $revertSha) { exit 1 }

    # Confirm against the PUSHED tree, not the local one: a rejected push would
    # otherwise look exactly like a successful revert.
    git -C $work fetch -q origin main
    $pushed = (git -C $work show "origin/main:$($meta.git.file)")
    if (($pushed -join "`n") -match [regex]::Escape($meta.git.marker)) {
        Write-Warning 'revert did not take: the regression is still on origin/main'
        exit 1
    }
    $fixSha = (git -C $work rev-parse HEAD).Trim()
} finally {
    Remove-GiteaWork $work
}

# The fault is undone from here on, so the baseline has no one left to serve.
Clear-ScenarioState $meta.id
Write-Step "14-red-pipeline reverted: $($fixSha.Substring(0,7)) is on main; waiting for CI to go green again"

$script:FixRun = $null
$done = Wait-Until -TimeoutSec 900 -IntervalSec 20 -Condition {
    $runs = @(Get-GiteaRuns -Repo $meta.git.repo -Limit 20 | Where-Object { $_.head_sha -eq $fixSha })
    if ($runs.Count -eq 0) { return $false }
    $script:FixRun = $runs[0]
    return ($runs[0].status -eq 'completed')
}
if (-not $done) {
    Write-Warning "the revert is on main but CI has not finished on $($fixSha.Substring(0,7)) within 900s - the injected fault IS undone; check 'obs ci status'"
    exit 0
}
if ($script:FixRun.conclusion -ne 'success') {
    Write-Warning "main is STILL red: run $($script:FixRun.run_number) concluded '$($script:FixRun.conclusion)'. This scenario's regression is reverted, so that is a DIFFERENT failure - investigate before running another scenario."
    exit 1
}

Write-Step "14-red-pipeline: CI run $($script:FixRun.run_number) is green - main is shippable again"
exit 0
