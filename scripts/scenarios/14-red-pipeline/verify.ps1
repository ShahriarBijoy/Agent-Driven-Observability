<#
  14-red-pipeline : verify

  1. the fault is live  - the regression is on main in the Gitea repo
  2. CI caught it       - the run for that exact commit concluded `failure`,
                          and it was the TEST job that failed
  3. nothing shipped    - build-push never succeeded for that commit, so no
                          image carries it and main is unshippable
  4. the signal exists  - ci-shim counted that failure under
                          branch=main,result=failure, the raw series the
                          `cicd-pipeline-red` alert fires on

  Assertion 2 checks the JOB, not just the run. "the pipeline is red" is not one
  incident: a red test job means a code regression, a red build-push means the
  registry or the runner is unwell, and they have different answer keys. A
  verify that stopped at the run-level conclusion would pass on either, and the
  exam would grade an agent against the wrong story.

  Assertion 3 is what makes this scenario about DELIVERY rather than about a
  failing test. The workflow gates build-push behind test, so a red test means
  no image was ever built for main - which is the reason a fix "cannot ship" and
  the reason this is worth paging someone about at all.

  What is deliberately NOT asserted: that no deploy annotation appeared. Deploy
  in this lab is a manual workflow_dispatch (see .gitea/workflows/deploy.yaml),
  so `cicd_deployments_total` never moves on its own and "no new deploy" is true
  on a perfectly healthy lab. Asserting it would look thorough and discriminate
  nothing. Assertion 3 asks the same question in the form this lab can actually
  answer: was an artifact built for this commit.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\assert.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

# --- 1. the fault is live ---------------------------------------------------
$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-red-pipeline-verify'
if (-not $work) { exit 1 }
$sha = ''

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -notmatch [regex]::Escape($meta.git.marker)) {
        Write-Warning "fault NOT live: $($meta.git.file) on main has no '$($meta.git.marker)'"
        exit 1
    }
    Write-Step "fault live: '$($meta.git.marker)' is on main in $($meta.git.file)"
    $sha = Get-GiteaCommitBySubject -Path $work -Subject $meta.git.subject
} finally {
    Remove-GiteaWork $work
}

if (-not $sha) { Write-Warning 'cannot find the injected commit by subject on main'; exit 1 }
$short = $sha.Substring(0, 7)
$ok = $true

# --- 2. CI caught it --------------------------------------------------------
# The run is queued within seconds of the push, but it installs bun, restores a
# lockfile and runs every workspace's tests before it can fail - minutes, and
# more when the runner is already busy with another scenario's revert.
$script:RedRun = $null
$done = Wait-Until -TimeoutSec 900 -IntervalSec 20 -Condition {
    $runs = @(Get-GiteaRuns -Repo $meta.git.repo -Limit 20 | Where-Object { $_.head_sha -eq $sha })
    if ($runs.Count -eq 0) { return $false }
    $script:RedRun = $runs[0]
    return ($runs[0].status -eq 'completed')
}
if (-not $done) {
    if ($null -eq $script:RedRun) {
        Write-Warning "signal MISSING: no CI run for $short within 900s - is the act_runner up (obs ci status)?"
    } else {
        Write-Warning "signal MISSING: CI run $($script:RedRun.run_number) for $short is still '$($script:RedRun.status)' after 900s"
    }
    exit 1
}

$run = $script:RedRun
if ($run.conclusion -ne 'failure') {
    Write-Warning "CI run $($run.run_number) for $short concluded '$($run.conclusion)', not 'failure' - the regression did not break the pipeline"
    exit 1
}
Write-Step "signal present: CI run $($run.run_number) for $short concluded failure"

$jobs = Get-GiteaRunJobs -Repo $meta.git.repo -RunId $run.id
$summary = (@($jobs | ForEach-Object { "$($_.name)=$($_.conclusion)" }) -join ' ')
if (@($jobs | Where-Object { $_.name -eq $meta.git.job -and $_.conclusion -eq 'failure' }).Count -gt 0) {
    Write-Step "signal present: the '$($meta.git.job)' job failed [$summary]"
} else {
    Write-Warning "run $($run.run_number) is red but its '$($meta.git.job)' job is not [$summary] - that is a different failure from the one this scenario injects"
    $ok = $false
}

# --- 3. nothing shipped -----------------------------------------------------
if (@($jobs | Where-Object { $_.name -eq $meta.git.blocked_job -and $_.conclusion -eq 'success' }).Count -gt 0) {
    Write-Warning "'$($meta.git.blocked_job)' SUCCEEDED for $short - an image was built from the broken commit, so this is not the unshippable-main scenario [$summary]"
    $ok = $false
} else {
    Write-Step "signal present: '$($meta.git.blocked_job)' never succeeded for $short - main has no shippable artifact"
}

# --- 4. the alert's raw series moved ----------------------------------------
$labels = @{ branch = 'main'; result = 'failure'; workflow = 'ci' }
$state = Get-ScenarioState $meta.id
$baseline = $null
if ($state -and ($null -ne $state.ci_failures_before)) { $baseline = [double]$state.ci_failures_before }

$script:CiFailures = 0
$moved = Wait-Until -TimeoutSec 180 -IntervalSec 15 -Condition {
    $n = Get-CiShimCounter -Name 'cicd_pipeline_runs_total' -Labels $labels
    if ($null -eq $n) { return $false }
    $script:CiFailures = $n
    # A missing baseline (verify called without this scenario's inject) and a
    # baseline ABOVE the current value (ci-shim restarted - its counters are
    # in-memory) collapse to the same weaker question: is main failing at all.
    $floor = 0
    if (($null -ne $baseline) -and ($baseline -le $n)) { $floor = $baseline }
    return ($n -gt $floor)
}
if ($moved) {
    Write-Step "signal present: ci-shim counts $($script:CiFailures) failed main runs (was $baseline) - cicd-pipeline-red has its input"
} else {
    Write-Warning "signal MISSING: ci-shim still counts $($script:CiFailures) failed main runs (baseline $baseline) after 180s - the workflow_run webhook did not reach it, so the alert will never fire (obs ci logs ci-shim)"
    $ok = $false
}

if ($ok) { exit 0 } else { exit 1 }
