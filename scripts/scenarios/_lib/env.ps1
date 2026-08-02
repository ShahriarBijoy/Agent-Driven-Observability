<#
  Shared environment for the scenario pack AND the obs CLI.

  Phase 12 made the scenario pack the single definition of chaos, which means
  the pack cannot depend on obs.ps1 - `obs chaos inject <id>` and a bare
  `& scripts/scenarios/03-crashloop/inject.ps1` must behave identically. So the
  address book, the mode flag and the small shared helpers live here, and
  obs.ps1 dot-sources this file rather than keeping its own copies.

  Dot-source it from anywhere:
      . "$PSScriptRoot\..\_lib\env.ps1"
#>

# scripts/scenarios/_lib -> scripts/scenarios -> scripts -> repo root.
$Repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

# The lab's address book (PLAN-2 SS D): every host-published port and machine
# name lives in infra/ports.env. Parse it once; everything reads $Ports instead
# of hardcoding numbers, so a port remap is a one-line edit there.
$Ports = @{}
foreach ($line in Get-Content (Join-Path $Repo 'infra\ports.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$') {
        $Ports[$Matches[1]] = $Matches[2]
    }
}

# Which machine answers the subject-system's ports? 'compose' = this laptop;
# 'k8s' = the cluster on the VM (Profile A). obs k8s up|down flips the file.
$ModeFile = Join-Path $Repo '.obs-mode'
$Mode = if ((Test-Path $ModeFile) -and ((Get-Content $ModeFile -Raw).Trim() -eq 'k8s')) { 'k8s' } else { 'compose' }

# Derived URLs. Agents deliberately uses 127.0.0.1: Windows resolves localhost
# to ::1 first and uvicorn binds v4-only.
$WebUrl     = "http://localhost:$($Ports.OBS_WEB_PORT)"
$GrafanaUrl = "http://localhost:$($Ports.OBS_GRAFANA_PORT)"
$AgentsUrl  = "http://127.0.0.1:$($Ports.OBS_AGENTS_PORT)"
$MarquezUrl = "http://localhost:$($Ports.OBS_MARQUEZ_UI_PORT)"

if ($Mode -eq 'k8s') {
    # Gateway lives behind the k3d LB -> Traefik on the VM; the chaos control
    # planes ride the same :8080 through /chaos/* ingress routes (the pods
    # publish no host ports). Clients append /admin/chaos to these bases and
    # Traefik's replacePath middleware lands them on the right endpoint.
    $GatewayUrl = "http://$($Ports.OBS_VM_HOST):$($Ports.OBS_GATEWAY_PORT)"
    $ChaosBase = [ordered]@{
        'model-proxy' = "$GatewayUrl/chaos/model-proxy"
        'retriever'   = "$GatewayUrl/chaos/retriever"
    }
} else {
    $GatewayUrl = "http://localhost:$($Ports.OBS_GATEWAY_PORT)"
    $ChaosBase = [ordered]@{
        'model-proxy' = "http://localhost:$($Ports.OBS_MODEL_PROXY_PORT)"
        'retriever'   = "http://localhost:$($Ports.OBS_RETRIEVER_PORT)"
    }
}

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Test-Up($url) {
    try { Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true }
    catch { return $false }
}

function Get-ObsToken {
    # Shared secret for agent-service's state-changing endpoints (PLAN-2 P7).
    # Canonical home: the repo-root .env; the agent-service .env is honored
    # too so raw `uv run` outside obs keeps working.
    foreach ($f in @((Join-Path $Repo '.env'), (Join-Path $Repo 'apps\agent-service\.env'))) {
        if (Test-Path $f) {
            foreach ($line in Get-Content $f) {
                if ($line -match '^\s*OBS_TOKEN\s*=\s*(.+?)\s*$') { return $Matches[1] }
            }
        }
    }
    return $null
}

function Get-LabKubeconfig {
    # The read-write operator kubeconfig minted by `obs k8s up`. Agents get the
    # scoped agent-ro / agent-remediate ones instead - never this.
    return (Join-Path $env:USERPROFILE '.kube\obs-lab.yaml')
}

function Assert-K8sMode {
    # Every pod/rollout/gitops scenario needs the cluster. Fail loudly rather
    # than injecting into a compose stack that has no pod specs to break.
    param([string]$Id)
    if ($Mode -ne 'k8s') {
        Write-Warning "$Id needs k8s mode - run 'obs k8s up' first (current mode: $Mode)"
        return $false
    }
    return $true
}

function Disable-AutoSync {
    # Live-inject guard (P10): drop `automated` from one Application so an
    # injected fault shows as OutOfSync WITHOUT being healed. selfHeal=false
    # is not sufficient - v3 auto-sync retriggers on drift whenever the
    # target revision is newer than the last attempted sync.
    param([string]$App, [string]$Kubeconfig)
    $f = Join-Path $env:TEMP 'obs-autosync-off.json'
    Set-Content -Encoding ascii -Path $f -Value '{"spec":{"syncPolicy":{"automated":null}}}'
    kubectl --kubeconfig $Kubeconfig -n argocd patch application $App --type merge --patch-file $f 2>$null | Out-Null
}

function Restore-AutoSync {
    # The paired restore for Disable-AutoSync: re-apply the committed
    # Application CR, which puts `automated` back exactly as Git has it.
    # Every revert.ps1 that called Disable-AutoSync must call this.
    param([string]$App, [string]$Kubeconfig)
    $cr = Join-Path $Repo "infra\k8s\argocd\apps\$App.yaml"
    if (-not (Test-Path $cr)) { Write-Warning "no committed Application CR at $cr"; return }
    kubectl --kubeconfig $Kubeconfig apply -f $cr 2>$null | Out-Null
}
