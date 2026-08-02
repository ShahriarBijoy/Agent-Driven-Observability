<#
  Gitea access for the git-mode scenarios.

  Three scenarios inject by pushing a commit rather than by mutating the
  cluster: bad-deploy (a bad revision enters the pipeline), sync-fail (the
  desired state itself is broken) and 12-bad-canary (a single-service bump that
  the canary analysis rejects). For those the change IS the desired state, so
  Argo stays Synced and an agent that blames delivery drift is wrong - which is
  precisely what makes them different questions from the live-inject ones.

  ## Reverting without state

  These scenarios do not record what they pushed. Every inject and revert starts
  from a FRESH CLONE and decides what to do by looking at the content: if the
  marker text is in the tree, the fault is live; if it is not, there is nothing
  to do. That makes both steps idempotent, keeps them correct when a human
  reverted by hand in the Gitea UI, and means no state file can go stale against
  a repo that moved on without it.

  The revert is a `git revert` commit, never a force-push: the history of a
  drill is part of what the agent reads.
#>

. (Join-Path $PSScriptRoot 'env.ps1')

$GiteaUrl = "http://$($Ports.OBS_VM_HOST):$($Ports.OBS_GITEA_PORT)"

function Test-GiteaUp {
    try { Invoke-RestMethod "$GiteaUrl/api/healthz" -TimeoutSec 8 | Out-Null; return $true }
    catch { Write-Warning "gitea is not answering at $GiteaUrl - run 'obs ci up' first"; return $false }
}

function Get-GiteaToken {
    # The token the CI layer minted, kept on the VM. Never in git.
    $tok = (ssh -o BatchMode=yes "root@$($Ports.OBS_VM_HOST)" 'cat /root/obs-lab/.gitea-token 2>/dev/null')
    if ($LASTEXITCODE -ne 0 -or -not $tok) { return '' }
    return "$tok".Trim()
}

function Get-GiteaAuthKey { return "http.${GiteaUrl}/.extraheader" }

function Get-GiteaAuthValue {
    <# The HTTP basic auth header git will send, so temp clones never prompt and
       no credential ends up in a remote URL that git might log.

       Key and value stay SEPARATE because git wants them that way: `git config
       key value` takes two arguments, and passing the "key=value" form that
       `git -c` uses fails with "error: invalid key" and then, less obviously,
       with "cannot prompt because user interactivity has been disabled" when
       the unauthenticated push is challenged. #>
    $tok = Get-GiteaToken
    if (-not $tok) { return '' }
    $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("obs:$tok"))
    return "Authorization: Basic $b64"
}

function New-GiteaWorkClone {
    <# A fresh, shallow-ish clone of one Gitea repo in TEMP. Returns the path, or
       '' on failure. Any previous clone at that path is discarded - stale work
       trees are how a scenario ends up "reverting" something that was never
       pushed. #>
    param(
        [Parameter(Mandatory)][ValidateSet('obs-lab', 'obs-gitops')][string]$Repo,
        [Parameter(Mandatory)][string]$WorkName
    )
    $authKey = Get-GiteaAuthKey
    $authValue = Get-GiteaAuthValue
    if (-not $authValue) { Write-Warning 'no Gitea token on the VM (obs ci up)'; return '' }

    # A unique directory per invocation, plus a best-effort sweep of older ones.
    # A fixed path looks tidier and is not: Windows hands out directory handles
    # (indexer, AV, a git helper that has not exited) that make Remove-Item fail
    # with "used by another process" right before the clone that needs the path
    # empty. Failing to delete YESTERDAY's clone must not fail TODAY's inject.
    foreach ($old in @(Get-ChildItem $env:TEMP -Directory -Filter "$WorkName-*" -ErrorAction SilentlyContinue)) {
        Get-ChildItem $old.FullName -Recurse -Force -File -ErrorAction SilentlyContinue |
            ForEach-Object { $_.IsReadOnly = $false }
        Remove-Item -Recurse -Force $old.FullName -ErrorAction SilentlyContinue
    }
    $path = Join-Path $env:TEMP "$WorkName-$([guid]::NewGuid().ToString('N').Substring(0, 8))"

    git -c "$authKey=$authValue" clone -q --depth 20 --branch main "$GiteaUrl/obs/$Repo.git" $path
    if ($LASTEXITCODE -ne 0) { Write-Warning "clone of $Repo failed"; return '' }

    git -C $path config $authKey $authValue
    git -C $path config user.email 'dev@obs-lab.local'
    git -C $path config user.name 'Lab Dev'
    # Manifests and sources stay LF end to end; without this, Windows git spams
    # CRLF warnings on stderr and PS 5.1 escalates captured stderr to errors.
    git -C $path config core.autocrlf false
    return $path
}

function Push-GiteaWork {
    <# Commit everything in the work tree and push it to main. #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Message
    )
    git -C $Path add -A
    git -C $Path commit -qm $Message
    if ($LASTEXITCODE -ne 0) { Write-Warning 'nothing to commit'; return '' }
    git -C $Path push -q origin main
    if ($LASTEXITCODE -ne 0) { Write-Warning 'push to main failed'; return '' }
    return (git -C $Path rev-parse --short HEAD).Trim()
}

function Undo-GiteaCommit {
    <# Revert the newest commit whose subject matches $Subject, and push. The fix
       ships as a commit, exactly like the break did. #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Subject
    )
    $sha = (git -C $Path log --format='%H' --grep="^$([regex]::Escape($Subject))$" -n 1).Trim()
    if (-not $sha) { Write-Warning "no commit found with subject '$Subject'"; return '' }
    git -C $Path revert --no-edit $sha | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "git revert of $sha failed"; return '' }
    git -C $Path push -q origin main
    if ($LASTEXITCODE -ne 0) { Write-Warning 'push of the revert failed'; return '' }
    return (git -C $Path rev-parse --short HEAD).Trim()
}

function Remove-GiteaWork {
    <# Best effort by design: git object files are read-only, and a lingering
       handle must not turn a successful inject into a failed one. Whatever
       survives is swept by the next clone. #>
    param([Parameter(Mandatory)][string]$Path)
    if (-not $Path -or -not (Test-Path $Path)) { return }
    Get-ChildItem $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        ForEach-Object { $_.IsReadOnly = $false }
    Remove-Item -Recurse -Force $Path -ErrorAction SilentlyContinue
}

function Set-RepoText {
    <# Write a file's full text EXACTLY as given.

       Not Set-Content: it treats the input as lines and re-terminates them with
       CRLF on Windows, which turns an LF repo into a working copy git warns
       about on every add ("CRLF will be replaced by LF"). The content is
       normalised on commit either way, but that warning goes to stderr, and PS
       5.1 is happy to escalate captured stderr into a terminating error in the
       middle of an inject. #>
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Get-GiteaRuns {
    <# Recent Actions runs for a repo, newest first. Used as the CI-side signal:
       "a run exists for this sha" is what proves the commit actually entered
       the pipeline rather than merely landing in a branch. #>
    param([Parameter(Mandatory)][ValidateSet('obs-lab', 'obs-gitops')][string]$Repo, [int]$Limit = 20)
    $tok = Get-GiteaToken
    if (-not $tok) { return @() }
    try {
        $resp = Invoke-RestMethod -Uri "$GiteaUrl/api/v1/repos/obs/$Repo/actions/runs?limit=$Limit" `
            -Headers @{ Authorization = "token $tok" } -TimeoutSec 15
        return @($resp.workflow_runs)
    } catch {
        Write-Warning "could not list Actions runs for $Repo"
        return @()
    }
}
