<#
  14-red-pipeline : inject

  A commit lands on the Gitea copy of main that reads like a small, sensible
  optimisation: percentile() copies its input before sorting, the run loop calls
  it three times per summary, so the copy goes and the sort happens in place.
  It is the kind of change that gets approved in ten seconds. It also breaks the
  one test that pins percentile()'s promise not to mutate its caller's array, so
  the `test` job goes red, `build-push` never runs, and main stops producing
  shippable images.

  That last part is the incident. The interesting failure is not "a test is
  red" - it is that until someone fixes this, no other fix can ship either, so
  an on-call agent holding a remediation has nowhere to put it. This is the
  scenario that exercises re-escalation.

  Why a source regression rather than an edited test: an agent's job here is to
  name the commit that broke delivery, and a commit that edits an assertion to
  fail announces itself. A plausible optimisation that violates a contract
  stated three lines above it in a doc comment is the diff a real on-call has to
  read carefully. It is also inert - build-push is gated behind test, so the
  broken code never becomes an image and never reaches the cluster.

  Idempotent: the marker text decides. If the regression is already on main this
  is a no-op, and it never re-captures the ci-shim baseline - a second capture
  would record the ALREADY-FAILING count as "before" and make assertion 4 of
  verify unfalsifiable.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\assert.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-red-pipeline'
if (-not $work) { exit 1 }

try {
    $file = Join-Path $work $meta.git.file
    $content = Get-Content $file -Raw

    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step '14-red-pipeline: the regression is already on main - nothing to do'
        exit 0
    }
    if ($content -notmatch [regex]::Escape($meta.git.anchor)) {
        Write-Warning "anchor line not found in $($meta.git.file) - the source has drifted"
        exit 1
    }

    # Captured BEFORE the push: verify asks whether the failure count went up,
    # which is only a question while the answer is still no.
    $before = Get-CiShimCounter -Name 'cicd_pipeline_runs_total' `
        -Labels @{ branch = 'main'; result = 'failure'; workflow = 'ci' }
    if ($null -eq $before) {
        Write-Warning 'ci-shim has no cicd_pipeline_runs_total{branch="main",result="failure"} series - the pipeline alert has no input, so this scenario would page nobody. Run: obs ci status'
        exit 1
    }

    # LF, not CRLF: the repo is LF end to end and a CRLF working copy makes git
    # warn on stderr, which PS 5.1 will happily escalate into a terminating
    # error in the middle of an inject.
    $replacement = "  // Sort in place: percentile() runs three times per summary and the defensive`n" +
                   "  // copy showed up in the run loop's profile.`n" +
                   "  const sorted = (values as number[]).sort((a, b) => a - b);"
    Set-RepoText -Path $file -Text $content.Replace($meta.git.anchor, $replacement)

    $sha = Push-GiteaWork -Path $work -Message $meta.git.subject
    if (-not $sha) { exit 1 }

    Save-ScenarioState -Id $meta.id -State @{ sha = $sha; ci_failures_before = $before }

    Write-Step "14-red-pipeline: commit $sha is on main; CI fails its test job in ~3 min and main stops building"
    Write-Step "the regression never becomes an image - build-push is gated behind test - so the cluster keeps serving normally."
    exit 0
} finally {
    Remove-GiteaWork $work
}
