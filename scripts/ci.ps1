<#
.SYNOPSIS
  ci - lifecycle for the CI layer (Gitea + Actions runner + ci-shim) on the VM.

.DESCRIPTION
  Profile A (PLAN-2 P9): the delivery control plane runs on the VM via
  docker compose (infra/compose.ci.yml), next to - but independent of - the
  k3d cluster. This script ships the source tree (git archive HEAD, same flow
  as k8s-build.ps1) and bootstraps everything idempotently: admin user, API
  token, runner registration.

  Actions:
    up       ship source, compose up, bootstrap admin + runner registration
    down     stop the CI layer (volumes survive: repos, runner identity)
    logs     follow CI-layer logs (optionally one service: gitea|runner|ci-shim)
    token    print the Gitea API token for this laptop (mints on first use);
             wire it into apps/agent-service/.env as GITEA_TOKEN
    status   compose ps + Gitea health + registered runners
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'down', 'logs', 'token', 'status')]
    [string]$Action = 'status',

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

# Everything composes against the shipped tree on the VM; ports.env rides
# along on every up so a port remap propagates.
$ComposeRemote = 'docker compose --env-file /root/obs-lab/ports.env -f /root/obs-lab/src/infra/compose.ci.yml'

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Invoke-Vm([string]$Script) {
    ssh -o BatchMode=yes "root@$Vm" $Script
}

function Ship-Source {
    $sha = (git -C $Repo rev-parse --short HEAD).Trim()
    $tar = Join-Path $env:TEMP "obs-lab-src-$sha.tar"
    Write-Step "archiving HEAD ($sha) -> $tar"
    git -C $Repo archive --format=tar -o $tar HEAD
    if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
    Write-Step "shipping context to $Vm"
    Invoke-Vm 'rm -rf /root/obs-lab/src && mkdir -p /root/obs-lab/src'
    scp -q -o BatchMode=yes $tar "root@${Vm}:/root/obs-lab/src.tar"
    scp -q -o BatchMode=yes (Join-Path $Repo 'infra\ports.env') "root@${Vm}:/root/obs-lab/ports.env"
    Remove-Item $tar -Force
    Invoke-Vm 'tar -xf /root/obs-lab/src.tar -C /root/obs-lab/src && rm /root/obs-lab/src.tar'
    if ($LASTEXITCODE -ne 0) { throw 'unpack on VM failed' }
}

switch ($Action) {
    'up' {
        Ship-Source

        Write-Step 'gitea: compose up --wait (healthcheck gates the bootstrap)'
        Invoke-Vm "$ComposeRemote up -d --wait gitea"
        if ($LASTEXITCODE -ne 0) { throw 'gitea did not come up healthy' }

        # Bootstrap is a single idempotent bash script on the VM: admin user
        # 'obs' (password kept in /root/obs-lab/.gitea-admin, never leaves the
        # VM unprompted), an all-scope API token (/root/obs-lab/.gitea-token),
        # and a fresh runner registration token (harmless when the runner
        # identity already exists in its volume - act_runner ignores it).
        Write-Step 'bootstrap: admin user + api token + runner registration'
        $bootstrap = @'
set -e
cd /root/obs-lab
if ! docker compose --env-file ports.env -f src/infra/compose.ci.yml exec -T -u 1000 gitea gitea admin user list | grep -q "\bobs\b"; then
  pw=$(head -c 24 /dev/urandom | base64 | tr -d "+/=" | head -c 20)
  docker compose --env-file ports.env -f src/infra/compose.ci.yml exec -T -u 1000 gitea \
    gitea admin user create --admin --username obs --password "$pw" --email obs@obs-lab.local --must-change-password=false
  echo "obs:$pw" > .gitea-admin && chmod 600 .gitea-admin
  echo "created admin user obs (password in /root/obs-lab/.gitea-admin)"
fi
if [ ! -s .gitea-token ]; then
  docker compose --env-file ports.env -f src/infra/compose.ci.yml exec -T -u 1000 gitea \
    gitea admin user generate-access-token --username obs --token-name "obs-lab-$(date +%s)" --scopes all --raw > .gitea-token
  chmod 600 .gitea-token
  echo "minted api token (/root/obs-lab/.gitea-token)"
fi
export OBS_CI_RUNNER_TOKEN=$(docker compose --env-file ports.env -f src/infra/compose.ci.yml exec -T -u 1000 gitea gitea actions generate-runner-token | tr -d "[:space:]")
docker compose --env-file ports.env -f src/infra/compose.ci.yml up -d --build --wait runner ci-shim
'@ -replace "`r`n", "`n"
        $bootstrap | ssh -o BatchMode=yes "root@$Vm" 'bash -s'
        if ($LASTEXITCODE -ne 0) { throw 'CI bootstrap failed' }

        Write-Step "CI layer is up on ${Vm}:"
        Write-Host "  Gitea    $GiteaUrl  (also https://obs-gitea.localhost after 'obs names')"
        Write-Host "  ci-shim  http://${Vm}:$($Ports.OBS_CI_SHIM_PORT)/health"
        Write-Host "  Login    user 'obs'; password: ssh root@$Vm cat /root/obs-lab/.gitea-admin"
        Write-Host "  Agent    'obs ci token' prints the API token for apps/agent-service/.env"
    }

    'down' {
        Invoke-Vm "$ComposeRemote down"
        Write-Step 'CI layer stopped (repos + runner identity kept in volumes)'
    }

    'logs' {
        $svc = if ($Rest.Count -ge 1) { $Rest -join ' ' } else { '' }
        Invoke-Vm "$ComposeRemote logs -f --tail=100 $svc"
    }

    'token' {
        $tok = (Invoke-Vm 'cat /root/obs-lab/.gitea-token 2>/dev/null').Trim()
        if (-not $tok) { throw "no token on the VM yet - run 'obs ci up' first" }
        Write-Host $tok
        Write-Host ''
        Write-Host "wire into apps/agent-service/.env:" -ForegroundColor Cyan
        Write-Host "  GITEA_URL=$GiteaUrl"
        Write-Host "  GITEA_TOKEN=$tok"
    }

    'status' {
        Invoke-Vm "$ComposeRemote ps"
        $health = (Invoke-Vm "curl -sf -m 5 http://localhost:$($Ports.OBS_GITEA_PORT)/api/healthz >/dev/null && echo ok || echo DOWN")
        Write-Host "  gitea /api/healthz: $health"
        $tok = (Invoke-Vm 'cat /root/obs-lab/.gitea-token 2>/dev/null').Trim()
        if ($tok) {
            try {
                $runners = Invoke-RestMethod -Uri "$GiteaUrl/api/v1/admin/runners" -Headers @{ Authorization = "token $tok" } -TimeoutSec 5
                foreach ($r in $runners) {
                    $state = if ($r.status) { $r.status } else { '?' }
                    Write-Host ("  runner  {0,-12} {1}  labels: {2}" -f $r.name, $state, ($r.labels.name -join ', '))
                }
            } catch { Write-Host '  (runner list unavailable - Gitea API unreachable from here?)' }
        }
    }
}
