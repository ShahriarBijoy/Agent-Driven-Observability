<#
  12-bad-canary : inject

  A single-service change lands in the desired-state repo: the gateway's
  upstream is repointed at a hostname that does not resolve in this cluster,
  under a subject that reads like ordinary regional routing work. Argo syncs it,
  Rollouts starts a canary, and one pod in four begins failing every completion
  it is handed.

  The signature is bimodal and that is what makes it a good question. Split the
  error rate by pod-template-hash and one hash is fine while the other fails
  everything; look at it unsplit and it is a moderate, confusing partial
  outage. The canary analysis does the split for you, fails against the lab's
  own Mimir, and Rollouts aborts - stable keeps serving, the incident closes
  itself, and the agent's job is to say WHICH revision and WHY, quoting the
  failing measurements and naming the commit.

  Why a config bump rather than the matrix's "image that 500s": ADR-006 requires
  the single-service direct-gitops-bump path, because the CI+deploy route bumps
  all five services at once and that rollout wave overwhelms the 2 Gi agents.
  One service, one commit, one canary - same evidence, a fraction of the load.

  inject_mode is `git`: the change IS the desired state, so Argo stays Synced
  throughout and an agent that reports drift has misread it. No Disable-AutoSync
  here for the same reason - auto-sync is the delivery mechanism this scenario
  is testing, not something to suppress.

  Idempotent: the marker text decides.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-canary'
if (-not $work) { exit 1 }

try {
    $file = Join-Path $work $meta.git.file
    $content = Get-Content $file -Raw

    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step '12-bad-canary: the bad revision is already on main - nothing to do'
        exit 0
    }
    if ($content -notmatch [regex]::Escape($meta.git.anchor)) {
        Write-Warning "'$($meta.git.anchor)' not found in $($meta.git.file) - the manifest has drifted"
        exit 1
    }

    Set-RepoText -Path $file -Text $content.Replace($meta.git.anchor, $meta.git.marker)
    $sha = Push-GiteaWork -Path $work -Message $meta.git.subject
    if (-not $sha) { exit 1 }

    Write-Step "12-bad-canary: commit $sha is on obs-gitops main"
    Write-Step 'Argo syncs within ~30s; the canary takes 25% of traffic, then the analysis step judges it for ~3.5 min before aborting.'
    exit 0
} finally {
    Remove-GiteaWork $work
}
