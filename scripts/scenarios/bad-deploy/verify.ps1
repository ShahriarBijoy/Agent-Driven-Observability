<#
  bad-deploy : verify

  1. the fault is live  - the marker is on main in the Gitea repo
  2. its signal exists  - CI has a run for that exact commit

  Assertion 2 is what separates "a commit was pushed" from "a bad revision
  entered the pipeline". A commit that never triggered a run is not this
  scenario - it is a broken CI layer, and reporting it as an injected bad
  deploy would grade an agent on a story the lab never told.

  The run's CONCLUSION is deliberately not asserted: this commit is supposed to
  pass its tests. A drill whose bad change failed CI would be a different (and
  much easier) exercise.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-deploy-verify'
if (-not $work) { exit 1 }
$ok = $true

try {
    # --- 1. the fault is live ---------------------------------------------
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step "fault live: '$($meta.git.marker)' is on main in $($meta.git.file)"
    } else {
        Write-Warning "fault NOT live: $($meta.git.file) on main has no '$($meta.git.marker)'"
        exit 1
    }

    $sha = (git -C $work log --format='%H' --grep="^$([regex]::Escape($meta.git.subject))$" -n 1).Trim()
    if (-not $sha) { Write-Warning 'cannot find the injected commit by subject'; exit 1 }

    # --- 2. the signal exists ---------------------------------------------
    # CI is triggered by a push webhook, so the run shows up in seconds - but a
    # busy runner can queue it, hence the wait.
    $found = Wait-Until -TimeoutSec 120 -IntervalSec 10 -Condition {
        $runs = Get-GiteaRuns -Repo $meta.git.repo
        return (@($runs | Where-Object { $_.head_sha -eq $sha }).Count -gt 0)
    }
    if ($found) {
        Write-Step "signal present: CI has a run for $($sha.Substring(0,7))"
    } else {
        Write-Warning "signal MISSING: no CI run for $($sha.Substring(0,7)) within 120s - is the act_runner up (obs ci status)?"
        $ok = $false
    }
} finally {
    Remove-GiteaWork $work
}

if ($ok) { exit 0 } else { exit 1 }
