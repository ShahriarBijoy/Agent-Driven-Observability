<#
.SYNOPSIS
  gitops - lifecycle for the obs-gitops desired-state repo (PLAN-2 P10).

.DESCRIPTION
  The cluster's desired state lives in the Gitea repo obs/obs-gitops; Argo CD
  syncs from it. This script manages the seam between that runtime repo and
  the seed template in infra/gitops:

    init     seed obs/obs-gitops from infra/gitops (refuses if the repo
             already has commits; -Force overwrites - fresh-lab bootstrap)
    push     force-sync infra/gitops over the runtime repo as one commit
             (operator override for structural changes; overwrites CI's tag
             bumps with whatever infra/gitops pins)
    status   Applications table (sync + health) straight from the CRs
    smoke    the P10 gating assertion: canary-hash-labelled series exist in
             Mimir (request_duration_seconds_bucket{rollouts_pod_template_hash!=""})
             - proves downward-API env + Mimir promotion end to end. Needs
             traffic through gateway/model-proxy pods born under a Rollout.

  Routine deploys never use this script: CI commits tag bumps directly to
  obs-gitops (see .gitea/workflows/ci.yaml).
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'push', 'status', 'smoke')]
    [string]$Action = 'status',

    [switch]$Force,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest = @()
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot

# The address book (see scripts/obs.ps1 - same parse, same map).
$Ports = @{}
foreach ($line in Get-Content (Join-Path $Repo 'infra\ports.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$') {
        $Ports[$Matches[1]] = $Matches[2]
    }
}
$Vm = $Ports.OBS_VM_HOST
$GiteaUrl = "http://${Vm}:$($Ports.OBS_GITEA_PORT)"
$RepoUrl = "$GiteaUrl/obs/obs-gitops.git"
$Kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Get-GiteaAuth {
    # Same credential the obs-lab remote uses (scripts/ci.ps1 wires it); a
    # scoped -c on every git call keeps temp clones prompt-free.
    $tok = (ssh -o BatchMode=yes "root@$Vm" 'cat /root/obs-lab/.gitea-token 2>/dev/null').Trim()
    if (-not $tok) { throw "no Gitea token on the VM - run 'obs ci up' first" }
    $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("obs:$tok"))
    return "http.${GiteaUrl}/.extraheader=Authorization: Basic $b64"
}

function Sync-SeedToRuntime([string]$Message, [switch]$AllowNonEmpty) {
    $auth = Get-GiteaAuth
    $work = Join-Path $env:TEMP 'obs-gitops-work'
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }

    # Clone (empty repos clone fine), replace the tree with infra/gitops.
    git -c $auth clone -q $RepoUrl $work
    if ($LASTEXITCODE -ne 0) { throw "clone of $RepoUrl failed" }
    # Manifests stay LF end to end; without this, Windows git spams CRLF
    # warnings on stderr and PS 5.1 escalates captured stderr to errors.
    git -C $work config core.autocrlf false
    $hasCommits = (git -C $work rev-parse -q --verify HEAD 2>$null)
    if ($hasCommits -and -not $AllowNonEmpty) {
        throw "obs/obs-gitops already has history - 'obs gitops push' (or init -Force) overwrites it deliberately"
    }
    Get-ChildItem $work -Exclude '.git' | Remove-Item -Recurse -Force
    Copy-Item -Recurse (Join-Path $Repo 'infra\gitops\*') $work

    $sha = (git -C $Repo rev-parse --short HEAD).Trim()
    git -C $work add -A
    git -C $work -c user.name=obs -c user.email=obs@obs-lab.local commit -q -m "$Message (infra/gitops @ $sha)"
    if ($LASTEXITCODE -ne 0) { Write-Step 'nothing to commit - runtime repo already matches infra/gitops'; Remove-Item -Recurse -Force $work; return }
    git -C $work -c $auth push -q origin HEAD:refs/heads/main
    if ($LASTEXITCODE -ne 0) { throw 'push to obs-gitops failed' }
    Remove-Item -Recurse -Force $work
    Write-Step "obs/obs-gitops updated: $Message"
}

switch ($Action) {
    'init' {
        if ($Force) { Sync-SeedToRuntime -Message 'seed: desired state re-initialized' -AllowNonEmpty }
        else { Sync-SeedToRuntime -Message 'seed: desired state from infra/gitops' }
    }
    'push' {
        $msg = if ($Rest.Count -ge 1) { $Rest -join ' ' } else { 'operator sync from infra/gitops' }
        Sync-SeedToRuntime -Message $msg -AllowNonEmpty
    }
    'status' {
        kubectl --kubeconfig $Kubeconfig get applications.argoproj.io -n argocd `
            -o custom-columns='APP:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision' 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Warning "cannot list Applications - is Argo CD installed (obs k8s argo)?" }
    }
    'smoke' {
        # The P10 gate: without this label the whole analysis layer is
        # decorative. Laptop-side Mimir, same query the AnalysisTemplates run.
        $q = 'count by (job) (request_duration_seconds_bucket{rollouts_pod_template_hash!=""})'
        $resp = Invoke-RestMethod -Uri "http://localhost:$($Ports.OBS_MIMIR_PORT)/prometheus/api/v1/query" `
            -Headers @{ 'X-Scope-OrgID' = 'anonymous' } -Body @{ query = $q } -Method Post -TimeoutSec 10
        $rows = @($resp.data.result)
        if ($rows.Count -eq 0) {
            Write-Warning 'FAIL: no hash-labelled series. Checklist: pods restarted since the env change? traffic flowing? Mimir promote_otel_resource_attributes loaded (restart)?'
            exit 1
        }
        foreach ($r in $rows) { Write-Host ("  ok  {0,-14} {1} hash-labelled series" -f $r.metric.job, $r.value[1]) }
        Write-Step 'canary-hash smoke PASSED'
    }
}
