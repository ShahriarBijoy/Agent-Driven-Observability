<#
  12-bad-canary : verify

  1. the fault is live   - the bad value is on obs-gitops main
  2. delivery took it    - the live gateway Deployment carries it, i.e. Argo
                           actually synced the commit rather than sitting on it
  3. the canary reacted  - the Rollout is no longer Healthy

  Assertion 2 is the one that earns its place. Without it, a verify would pass
  the instant a commit was pushed, even if Argo were paused, unreachable or
  wedged - and the exam would then grade an agent on an incident the cluster
  never experienced.

  What is deliberately NOT gated on: the AnalysisRun's verdict and the abort.
  Those take about three and a half minutes of judging AFTER traffic reaches the
  canary, and they are what the exam's alert path waits for - not a
  precondition for saying the fault is established. Gating here would turn every
  verify into a six-minute wait and, worse, would make the scenario unusable
  without load already running.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-bad-canary-verify'
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
} finally {
    Remove-GiteaWork $work
}

# --- 2. delivery took it --------------------------------------------------
# Auto-sync fires on the push webhook, so this is seconds - but a missed
# webhook falls back to Argo's own poll, hence the patience.
$synced = Wait-Until -TimeoutSec 240 -IntervalSec 10 -Condition {
    Request-ArgoRefresh $meta.k8s.argo_app
    $env = Get-DeploymentField -App $meta.k8s.app `
        -JsonPath "{.spec.template.spec.containers[0].env[?(@.name=='MODEL_PROXY_URL')].value}"
    return ($env -eq $meta.git.marker)
}
if ($synced) {
    Write-Step "signal present: the live $($meta.k8s.app) template now points at $($meta.git.marker)"
} else {
    Write-Warning "signal MISSING: Argo has not applied the commit within 240s - check: obs gitops status"
    $ok = $false
}

# --- 3. the canary reacted ------------------------------------------------
if (-not (Assert-RolloutStuck -Name $meta.k8s.app -TimeoutSec 120)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
