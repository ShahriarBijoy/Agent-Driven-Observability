<#
  bad-deploy : inject   (retained drill, not an exam question)

  The failure ships through the delivery pipeline instead of being done to the
  cluster. A commit lands on the Gitea copy of main that looks entirely
  reasonable - an upstream-recommended "warm-up" - and serialises two seconds
  into every completion. The unit tests pass, because the sleep is legitimate
  code, and CI builds and pushes the image.

  What it rehearses is the walk: alert -> deploy annotation -> CI run -> compare
  diff -> the exact commit and line. That chain is the reason inject_mode is
  `git`: the change IS the desired state, Argo stays Synced, and an agent that
  reports "configuration drift" has misread the incident.

  Where it stops. Deploy is a manual workflow_dispatch in this lab (see
  .gitea/workflows/deploy.yaml - an alert-to-deploy-everything loop produced
  more alerts than it resolved on an 8 GB VM), and a dispatch bumps ALL five
  services at once, which is exactly the rollout wave that overwhelms the 2 Gi
  agents. So this drill puts the bad revision through test and build and stops
  there. To carry it into the cluster, dispatch `deploy` from the Gitea UI -
  deliberately a human decision, and the reason this is a drill rather than an
  exam question.

  Idempotent: the marker text decides. If it is already on main, this is a
  no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-deploy'
if (-not $work) { exit 1 }

try {
    $file = Join-Path $work $meta.git.file
    $content = Get-Content $file -Raw

    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step 'bad-deploy: the bad commit is already on main - nothing to do'
        exit 0
    }
    if ($content -notmatch [regex]::Escape($meta.git.anchor)) {
        Write-Warning "anchor line not found in $($meta.git.file) - the source has drifted"
        exit 1
    }

    # LF, not CRLF: the repo is LF end to end (.gitattributes normalises it
    # anyway), and CRLF here makes git warn on stderr - which PS 5.1 can
    # escalate into a terminating error in the middle of an inject.
    $replacement = "      // Pre-warm the completion path so first-token latency stays flat`n" +
                   "      // under bursty load (upstream provider's recommended warm-up).`n" +
                   "      await sleep(2000);`n`n" +
                   "      return generateCompletion(req);"
    Set-RepoText -Path $file -Text $content.Replace($meta.git.anchor, $replacement)

    $sha = Push-GiteaWork -Path $work -Message $meta.git.subject
    if (-not $sha) { exit 1 }

    Write-Step "bad-deploy: commit $sha is on main; CI tests and builds it (~4 min)"
    Write-Step 'it does NOT reach the cluster by itself - dispatch the deploy workflow if you want the full walk.'
    exit 0
} finally {
    Remove-GiteaWork $work
}
