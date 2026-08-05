<#
  sync-fail : inject   (retained drill, not an exam question)

  The desired state itself is broken. A commit lands on obs-gitops main with a
  manifest that reads perfectly well and that the API server refuses: a negative
  replica count, pushed under an innocuous "scale tuning" subject.

  The live cluster is UNTOUCHED. Argo tries to apply the new revision, the apply
  fails, and the running retriever keeps serving exactly as before. That is the
  whole lesson: a failed sync is a delivery incident with no runtime symptom,
  and the only place it exists is the sync status and the webhook it fires. An
  agent that goes looking at pods and dashboards will correctly find nothing
  wrong and incorrectly conclude nothing is.

  Not an exam question because 13-config-drift already grades the gitops
  signature and does it with a live-vs-desired diff, which is the richer of the
  two; this one is kept because a failed apply and a drifted apply are different
  failures with the same "look at Argo" answer.

  Idempotent: the marker text decides.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-sync-fail'
if (-not $work) { exit 1 }

try {
    $file = Join-Path $work $meta.git.file
    $content = Get-Content $file -Raw

    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step 'sync-fail: the broken manifest is already on main - nothing to do'
        exit 0
    }
    if ($content -notmatch [regex]::Escape($meta.git.anchor)) {
        Write-Warning "'$($meta.git.anchor)' not found in $($meta.git.file) - the manifest has drifted"
        exit 1
    }

    Set-RepoText -Path $file -Text $content.Replace($meta.git.anchor, $meta.git.marker)
    $sha = Push-GiteaWork -Path $work -Message $meta.git.subject
    if (-not $sha) { exit 1 }

    Write-Step "sync-fail: broken manifest $sha is on main; the next auto-sync fails within ~30s"
    Write-Step 'the live retriever keeps running untouched - that is the point.'
    exit 0
} finally {
    Remove-GiteaWork $work
}
