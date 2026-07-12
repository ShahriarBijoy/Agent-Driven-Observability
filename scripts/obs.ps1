<#
.SYNOPSIS
  obs - one-liner control for the AI Observability Lab.

.DESCRIPTION
  Wraps the multi-file docker compose incantation (and the fresh-machine network
  ordering gotcha) behind memorable subcommands. Run from anywhere; it anchors to
  the repo root itself.

  Commands:
    obs all   [qps] [secs]   EVERYTHING in one go: containers + agent-service + web + load.
                             Host processes open in their own windows. Defaults 120 qps / 600s.
    obs up    [--build]      Bring up the full lab (subject + observability + lineage).
    obs dev   [--build]      Alias for `up`.
    obs down  [-v]           Tear the lab down (-v also wipes volumes: seeded data + Grafana).
    obs load  [qps] [secs]   Drive synthetic traffic (defaults: 120 qps for 300s).
    obs demo  [qps] [secs]   Full cycle: up --build -> wait healthy -> load -> down.
    obs web                  Start the web control plane (:3003) in THIS terminal (Ctrl-C to stop).
    obs agents               Start the agent-service (:8093) in THIS terminal (Ctrl-C to stop).
    obs smoke                Phase-1 end-to-end smoke test (needs Git Bash on PATH).
    obs ps                   Show container status.
    obs logs  [service...]   Follow logs (optionally for specific services).
    obs urls                 Print the service address table.
    obs hosts                Print the host-process commands (agent-service + web).
    obs help                 This help.

  The full lab needs THREE things running: `obs up` (the 15 containers), plus the
  two host processes `obs web` and `obs agents` — each in its own terminal.

.EXAMPLE
  obs up --build
  obs load 200 600
  obs demo
  obs down -v
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = 'help',

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest = @()
)

# Repo root is one level up from this script (scripts/ -> repo).
$Repo = Split-Path -Parent $PSScriptRoot

# The three compose files that make up the full lab, in layer order.
$Full = @(
    '-f', 'infra/compose.yml',
    '-f', 'infra/compose.observability.yml',
    '-f', 'infra/compose.lineage.yml'
)

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Test-Up($url) {
    try { Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true }
    catch { return $false }
}

function Wait-Gateway {
    param([int]$TimeoutSec = 120)
    Write-Step "waiting up to ${TimeoutSec}s for gateway health (http://localhost:8080/health)"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod -Uri 'http://localhost:8080/health' -TimeoutSec 3 | Out-Null
            Write-Step "gateway is healthy"
            return $true
        } catch { Start-Sleep -Seconds 3 }
    }
    Write-Warning "gateway did not become healthy within ${TimeoutSec}s"
    return $false
}

function Invoke-Up {
    param([string[]]$Extra)
    # Step 1 creates obs-lab-app + obs-lab-obs; the lineage layer declares them
    # external, so they must exist before the merged command runs.
    Write-Step "step 1/2: subject system (creates the shared networks)"
    docker compose -f infra/compose.yml up -d @Extra
    if ($LASTEXITCODE -ne 0) { throw "step 1 (subject system) failed with exit code $LASTEXITCODE" }
    Write-Step "step 2/2: full lab (observability + lineage planes)"
    docker compose @Full up -d @Extra
    if ($LASTEXITCODE -ne 0) { throw "step 2 (full lab) failed with exit code $LASTEXITCODE" }
}

function Invoke-Load {
    param([string]$Qps = '120', [string]$Duration = '300')
    if (-not $env:GATEWAY_URL) { $env:GATEWAY_URL = 'http://localhost:8080' }
    $env:TARGET_QPS = $Qps
    $env:DURATION_SECONDS = $Duration
    Write-Step "load: $($env:GATEWAY_URL) @ ${Qps} qps for ${Duration}s"
    bun --cwd apps/load-generator run start
}

Push-Location $Repo
try {
    switch ($Command.ToLower()) {
        { $_ -in 'up', 'dev' } { Invoke-Up -Extra $Rest }

        { $_ -in 'all', 'start', 'everything' } {
            $qps = if ($Rest.Count -ge 1) { $Rest[0] } else { '120' }
            $dur = if ($Rest.Count -ge 2) { $Rest[1] } else { '600' }

            Write-Step "[1/4] containers (obs up)"
            Invoke-Up -Extra @()
            if (-not (Wait-Gateway)) { Write-Warning "gateway never came up - aborting host processes + load"; break }

            Write-Step "[2/4] agent-service :8093 (own window)"
            if (Test-Up 'http://127.0.0.1:8093/health') {
                Write-Host "      already running - skipping"
            } else {
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\agent-service') -ArgumentList '-NoExit', '-Command', 'uv sync; uv run python -m agent_service'
            }

            Write-Step "[3/4] web control plane :3003 (own window)"
            if (Test-Up 'http://localhost:3003') {
                Write-Host "      already running - skipping"
            } else {
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\web') -ArgumentList '-NoExit', '-Command', 'bun run dev'
            }

            Write-Step "[4/4] load generator ($qps qps for ${dur}s, own window)"
            $loadCmd = "`$env:GATEWAY_URL='http://localhost:8080'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
            Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd

            Write-Host ""
            Write-Step "everything is starting - host windows need ~15s to bind"
            Write-Host "  Web + Agents : http://localhost:3003   (RCA chat at /agents)"
            Write-Host "  Grafana      : http://localhost:3001"
            Write-Host "  Marquez      : http://localhost:3002"
            Write-Host "  Stop a piece: close its window (or Ctrl-C in it). 'obs down' stops the containers."
        }

        'down' { docker compose @Full --profile load down @Rest }

        'load' {
            $qps = if ($Rest.Count -ge 1) { $Rest[0] } else { '120' }
            $dur = if ($Rest.Count -ge 2) { $Rest[1] } else { '300' }
            Invoke-Load -Qps $qps -Duration $dur
        }

        'demo' {
            $qps = if ($Rest.Count -ge 1) { $Rest[0] } else { '120' }
            $dur = if ($Rest.Count -ge 2) { $Rest[1] } else { '120' }
            Invoke-Up -Extra @('--build')
            if (Wait-Gateway) {
                Invoke-Load -Qps $qps -Duration $dur
            } else {
                Write-Warning "skipping load (gateway never came up); leaving the lab running for inspection"
                break
            }
            Write-Step "demo complete: tearing the lab down"
            docker compose @Full --profile load down
        }

        'smoke' { bash scripts/smoke.sh }

        { $_ -in 'ps', 'status' } { docker compose @Full ps }

        'logs' { docker compose @Full logs -f --tail=100 @Rest }

        'urls' {
            Write-Host @"
Control plane  http://localhost:3003   (dev mode, no auth)
Grafana        http://localhost:3001   (anonymous Admin)
Marquez UI     http://localhost:3002
Gateway API    http://localhost:8080
dq-runner      http://localhost:8091
Agent service  http://localhost:8093   (host process, see `obs hosts`)
"@
        }

        'hosts' {
            Write-Host @"
The web UI (:3003) and agent-service (:8093) run on the HOST, not in compose.
Full lab = 'obs up' (containers) + these two, each in its own terminal:

  obs agents     agent-service :8093  (Claude Agent SDK uses your Claude Code login)
  obs web        web control plane :3003

Raw equivalents:
  cd apps/agent-service; uv sync; uv run python -m agent_service
  cd apps/web; bun run dev
"@
        }

        'web' {
            Set-Location (Join-Path $Repo 'apps\web')
            Write-Step "web control plane -> http://localhost:3003  (Ctrl-C to stop)"
            bun run dev
        }

        { $_ -in 'agents', 'agent', 'agent-service' } {
            Set-Location (Join-Path $Repo 'apps\agent-service')
            Write-Step "agent-service -> http://localhost:8093  (Ctrl-C to stop)"
            uv sync
            uv run python -m agent_service
        }

        default {
            Get-Help $PSCommandPath -Detailed
        }
    }
}
finally {
    Pop-Location
}
