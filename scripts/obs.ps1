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
    obs load  [qps] [secs]   Drive steady synthetic traffic (defaults: 120 qps for 300s).
    obs load  spike [peak] [secs]  Traffic spike: 60s baseline -> peak burst (default 400 qps
                             for 120s) -> 180s recovery. Watch p95 + per-tenant 429s.
    obs load  ramp  [max]    Staircase 50 -> 100 -> 200 -> 300 -> 400 qps, 90s per step
                             (stops at [max]). Find the knee where latency degrades.
    obs load  soak  [qps] [secs]   Long steady soak (defaults: 60 qps for 1800s).
    obs load  drift [secs]   Long-prompt-heavy mix -> prompt-length distribution shifts ->
                             DQ drift alert (KS > 0.4 for 10m). Default 1200s.
    obs load  abuse [secs]   Abuser-tenant-heavy mix -> per-tenant 429 storm. The agent
                             should call it rate limiting, NOT a service fault. Default 300s.
    obs fail  [scenario] [qps]     Inject a failure while driving baseline traffic (default
                             40 qps). Scenarios: latency errors timeout outage brownout
                             flaky throttle full. No argument lists them with details.
    obs chaos [clear]        Show (or clear) the /admin/chaos state on model-proxy + retriever.
    obs fixes [clean]        List auto-fixer workspaces (.artifacts/autofix) with sizes and fix
                             branches; `clean` deletes them all. The working clone is already
                             auto-removed after each run — what remains is the ~1 MB origin.git
                             per run holding any pushed fix branch.
    obs demo  [qps] [secs]   Full cycle: up --build -> wait healthy -> load -> down.
    obs web                  Start the web control plane (:3003) in THIS terminal (Ctrl-C to stop).
    obs agents               Start the agent-service (:8093) in THIS terminal (Ctrl-C to stop).
    obs smoke                Phase-1 end-to-end smoke test (needs Git Bash on PATH).
    obs ps                   Show container status.
    obs logs  [service...]   Follow logs (optionally for specific services).
    obs urls                 Print the service address table.
    obs names [install]      Register https://obs-*.localhost aliases for every human-facing
                             endpoint via the portless proxy (reads ports.env - rerun after a
                             remap and the names follow). 'install' autostarts the proxy on boot.
    obs preflight            Check required binaries, the portless proxy, and every port in
                             ports.env (free or bound by this lab = ok; a genuine conflict
                             prints the one-line remap to make). 8090 stays HyperHDR's.
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

# The lab's address book (PLAN-2 SS D): every host-published port and machine
# name lives in infra/ports.env. Parse it once; everything below reads $Ports
# instead of hardcoding numbers, so a port remap is a one-line edit there.
$Ports = @{}
foreach ($line in Get-Content (Join-Path $Repo 'infra\ports.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$') {
        $Ports[$Matches[1]] = $Matches[2]
    }
}

# Derived URLs used throughout. Agents deliberately uses 127.0.0.1: Windows
# resolves localhost to ::1 first and uvicorn binds v4-only.
$GatewayUrl = "http://localhost:$($Ports.OBS_GATEWAY_PORT)"
$WebUrl     = "http://localhost:$($Ports.OBS_WEB_PORT)"
$GrafanaUrl = "http://localhost:$($Ports.OBS_GRAFANA_PORT)"
$AgentsUrl  = "http://127.0.0.1:$($Ports.OBS_AGENTS_PORT)"
$MarquezUrl = "http://localhost:$($Ports.OBS_MARQUEZ_UI_PORT)"

# The three compose files that make up the full lab, in layer order. The
# --env-file makes the compose port substitutions read the same map.
$Full = @(
    '--env-file', 'infra/ports.env',
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
    Write-Step "waiting up to ${TimeoutSec}s for gateway health ($GatewayUrl/health)"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod -Uri "$GatewayUrl/health" -TimeoutSec 3 | Out-Null
            Write-Step "gateway is healthy"
            return $true
        } catch { Start-Sleep -Seconds 3 }
    }
    Write-Warning "gateway did not become healthy within ${TimeoutSec}s"
    return $false
}

function Use-OpenSsl {
    # portless shells out to openssl to mint its local CA. Windows rarely has
    # it on PATH, but Git for Windows always ships one - borrow that.
    if (Get-Command openssl -ErrorAction SilentlyContinue) { return $true }
    $gitSsl = @("$env:ProgramFiles\Git\mingw64\bin", "$env:ProgramFiles\Git\usr\bin") |
        Where-Object { Test-Path (Join-Path $_ 'openssl.exe') } | Select-Object -First 1
    if ($gitSsl) { $env:Path = "$gitSsl;$env:Path"; return $true }
    Write-Warning 'openssl not found (portless needs it for its local CA). Install: winget install -e --id ShiningLight.OpenSSL.Dev'
    return $false
}

function Get-NameUrls {
    # When the portless aliases are registered, hand the web app https names:
    # an https://obs-web.localhost page may not embed or fetch plain-http
    # localhost URLs (mixed content), so iframes + RUM must use names too.
    $probe = & portless get obs-grafana 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $probe) { return $null }
    [ordered]@{
        VITE_GRAFANA_URL      = 'https://obs-grafana.localhost'
        VITE_MARQUEZ_URL      = 'https://obs-marquez.localhost'
        VITE_OTLP_TRACES_URL  = 'https://obs-otlp.localhost/v1/traces'
        VITE_OTLP_METRICS_URL = 'https://obs-otlp.localhost/v1/metrics'
    }
}

function Invoke-Up {
    param([string[]]$Extra)
    # Step 1 creates obs-lab-app + obs-lab-obs; the lineage layer declares them
    # external, so they must exist before the merged command runs.
    Write-Step "step 1/2: subject system (creates the shared networks)"
    docker compose --env-file infra/ports.env -f infra/compose.yml up -d @Extra
    if ($LASTEXITCODE -ne 0) { throw "step 1 (subject system) failed with exit code $LASTEXITCODE" }
    Write-Step "step 2/2: full lab (observability + lineage planes)"
    docker compose @Full up -d @Extra
    if ($LASTEXITCODE -ne 0) { throw "step 2 (full lab) failed with exit code $LASTEXITCODE" }
}

function Invoke-Load {
    param(
        [string]$Qps = '120',
        [string]$Duration = '300',
        [string]$Weights = '',
        [string]$Concurrency = '',
        [string]$Label = 'load'
    )
    if (-not $env:GATEWAY_URL) { $env:GATEWAY_URL = $GatewayUrl }
    $env:TARGET_QPS = $Qps
    $env:DURATION_SECONDS = $Duration
    # Assigning $null removes the env var, so a plain run never inherits a mix
    # or concurrency left over from an earlier shaped run in the same shell.
    $env:SCENARIO_WEIGHTS = if ($Weights) { $Weights } else { $null }
    $env:CONCURRENCY = if ($Concurrency) { $Concurrency } else { $null }
    $mix = if ($Weights) { " mix=$Weights" } else { '' }
    Write-Step "${Label}: $($env:GATEWAY_URL) @ ${Qps} qps for ${Duration}s$mix"
    bun --cwd=apps/load-generator run start
}

# Failure-injection scenarios: name -> chaos/<name>.yaml + a one-line story.
# Each schedule starts with a healthy baseline, injects one failure mode, and
# cools down so SLIs recover. See the YAML headers for sizing rationale.
$FailScenarios = [ordered]@{
    latency  = 'model-proxy slow, zero errors -> p95 > 2s alert + latency SLO burn   (~14 min)'
    errors   = 'model-proxy 500s -> gateway 502s -> 5xx > 2% pages                   (~8 min)'
    timeout  = 'model-proxy stalls past the 8s upstream timeout -> gateway 504s      (~9 min)'
    outage   = 'retriever hard-down -> every request 502s                            (~8 min)'
    brownout = 'retriever fails ~10% of calls -> quiet error-budget burn             (~10 min)'
    flaky    = 'model-proxy "bad minutes" -> flapping 5xx bursts, healthy in between (~14 min)'
    throttle = 'model-proxy sheds 50% with 429s -> users degraded, NOTHING pages     (~8 min)'
    full     = 'the whole Plan-p6 cycle: latency -> errors -> retriever outage       (~26 min)'
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

            Write-Step "[2/4] agent-service :$($Ports.OBS_AGENTS_PORT) (own window)"
            if (Test-Up "$AgentsUrl/health") {
                Write-Host "      already running - skipping"
            } else {
                $agentCmd = "`$env:AGENT_SERVICE_PORT='$($Ports.OBS_AGENTS_PORT)'; uv sync; uv run python -m agent_service"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\agent-service') -ArgumentList '-NoExit', '-Command', $agentCmd
            }

            Write-Step "[3/4] web control plane :$($Ports.OBS_WEB_PORT) (own window)"
            if (Test-Up $WebUrl) {
                Write-Host "      already running - skipping"
            } else {
                $webCmd = "`$env:OBS_WEB_PORT='$($Ports.OBS_WEB_PORT)'; bun run dev"
                $names = Get-NameUrls
                if ($names) {
                    $envSets = ($names.Keys | ForEach-Object { "`$env:$_='$($names[$_])'" }) -join '; '
                    $webCmd = "$envSets; $webCmd"
                }
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\web') -ArgumentList '-NoExit', '-Command', $webCmd
            }

            Write-Step "[4/4] load generator ($qps qps for ${dur}s, own window)"
            $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
            Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd

            Write-Host ""
            Write-Step "everything is starting - host windows need ~15s to bind"
            Write-Host "  Web + Agents : $WebUrl   (RCA chat at /agents)"
            Write-Host "  Grafana      : $GrafanaUrl"
            Write-Host "  Marquez      : $MarquezUrl"
            Write-Host "  Stop a piece: close its window (or Ctrl-C in it). 'obs down' stops the containers."
        }

        'down' { docker compose @Full --profile load down @Rest }

        'load' {
            $shape = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { '' }
            switch ($shape) {
                'spike' {
                    $peak = if ($Rest.Count -ge 2) { $Rest[1] } else { '400' }
                    $secs = if ($Rest.Count -ge 3) { $Rest[2] } else { '120' }
                    Write-Step "spike: 60s @ 40 qps -> ${secs}s @ ${peak} qps -> 180s recovery @ 40 qps"
                    Invoke-Load -Qps '40' -Duration '60' -Label 'spike 1/3 (baseline)'
                    Invoke-Load -Qps $peak -Duration $secs -Concurrency '256' -Label 'spike 2/3 (peak)'
                    Invoke-Load -Qps '40' -Duration '180' -Label 'spike 3/3 (recovery)'
                }
                'ramp' {
                    $max = if ($Rest.Count -ge 2) { [int]$Rest[1] } else { 400 }
                    Write-Step "ramp: 50 -> 100 -> 200 -> 300 -> 400 qps (cap $max), 90s per step"
                    foreach ($step in @(50, 100, 200, 300, 400)) {
                        if ($step -gt $max) { break }
                        Invoke-Load -Qps "$step" -Duration '90' -Concurrency '256' -Label "ramp ($step qps)"
                    }
                }
                'soak' {
                    $qps = if ($Rest.Count -ge 2) { $Rest[1] } else { '60' }
                    $secs = if ($Rest.Count -ge 3) { $Rest[2] } else { '1800' }
                    Invoke-Load -Qps $qps -Duration $secs -Label 'soak'
                }
                'drift' {
                    $secs = if ($Rest.Count -ge 2) { $Rest[1] } else { '1200' }
                    Write-Step 'drift: long-prompt-heavy mix (DQ drift alert needs KS > 0.4 sustained 10m - let it run)'
                    Invoke-Load -Qps '40' -Duration $secs -Weights 'long:80,happy:20' -Label 'drift'
                }
                'abuse' {
                    $secs = if ($Rest.Count -ge 2) { $Rest[1] } else { '300' }
                    Write-Step 'abuse: abuser-tenant-heavy mix -> per-tenant 429 storm (rate limiting, not a fault)'
                    Invoke-Load -Qps '60' -Duration $secs -Weights 'abusive:70,happy:30' -Label 'abuse'
                }
                default {
                    $qps = if ($Rest.Count -ge 1) { $Rest[0] } else { '120' }
                    $dur = if ($Rest.Count -ge 2) { $Rest[1] } else { '300' }
                    Invoke-Load -Qps $qps -Duration $dur
                }
            }
        }

        'fail' {
            $scenario = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { '' }
            if (-not $FailScenarios.Contains($scenario)) {
                if ($scenario) { Write-Warning "unknown fail scenario '$scenario'" }
                Write-Host "usage: obs fail <scenario> [baseline-qps]   (baseline default: 40 qps)"
                Write-Host ""
                foreach ($name in $FailScenarios.Keys) {
                    Write-Host ("  {0,-9} {1}" -f $name, $FailScenarios[$name])
                }
                Write-Host ""
                Write-Host "Each drives baseline traffic the whole time; chaos is applied/cleared on a"
                Write-Host "clock and always reset on exit. Watch Grafana (:$($Ports.OBS_GRAFANA_PORT)) and the incident inbox"
                Write-Host "(:$($Ports.OBS_WEB_PORT)/incidents); the agent-service (:$($Ports.OBS_AGENTS_PORT)) must be up to get postmortems."
                break
            }
            $qps = if ($Rest.Count -ge 2) { $Rest[1] } else { '40' }
            $env:CHAOS_SCHEDULE = "chaos/$scenario.yaml"
            $env:CHAOS_TARGET_QPS = $qps
            # Stall/latency drills hold connections open; give the driver headroom.
            if (-not $env:CHAOS_CONCURRENCY) { $env:CHAOS_CONCURRENCY = '128' }
            # Chaos driver targets, all from the map (so a remap follows along).
            if (-not $env:GATEWAY_URL) { $env:GATEWAY_URL = $GatewayUrl }
            if (-not $env:MODEL_PROXY_URL) { $env:MODEL_PROXY_URL = "http://localhost:$($Ports.OBS_MODEL_PROXY_PORT)" }
            if (-not $env:RETRIEVER_URL) { $env:RETRIEVER_URL = "http://localhost:$($Ports.OBS_RETRIEVER_PORT)" }
            Write-Step "fail '$scenario': $($FailScenarios[$scenario])"
            Write-Step "watch: Grafana $GrafanaUrl | incidents $WebUrl/incidents"
            bun --cwd=apps/load-generator run chaos
        }

        'chaos' {
            $action = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }
            $planes = [ordered]@{
                'model-proxy' = "http://localhost:$($Ports.OBS_MODEL_PROXY_PORT)/admin/chaos"
                'retriever'   = "http://localhost:$($Ports.OBS_RETRIEVER_PORT)/admin/chaos"
            }
            foreach ($name in $planes.Keys) {
                try {
                    if ($action -eq 'clear') {
                        Invoke-RestMethod -Method Delete -Uri $planes[$name] -TimeoutSec 3 | Out-Null
                        Write-Step "cleared chaos on $name"
                        continue
                    }
                    $state = Invoke-RestMethod -Uri $planes[$name] -TimeoutSec 3
                    # model-proxy reports { base, override, effective }; retriever is flat.
                    $active = if ($null -ne $state.override) { $state.override } else { $state }
                    $knobs = @($active.PSObject.Properties | Where-Object { $_.Value -ne 0 -and $_.Value -ne $false })
                    if ($knobs.Count -eq 0) {
                        Write-Host ("  {0,-12} healthy (no chaos active)" -f $name)
                    } else {
                        $desc = ($knobs | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' '
                        Write-Host ("  {0,-12} CHAOS ACTIVE: {1}" -f $name, $desc)
                    }
                } catch {
                    Write-Warning "$name unreachable at $($planes[$name]) - is the lab up?"
                }
            }
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

        'fixes' {
            $dir = Join-Path $Repo '.artifacts\autofix'
            $runs = @(Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue)
            if ($runs.Count -eq 0) { Write-Host "no auto-fixer workspaces under $dir"; break }
            $action = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'list' }
            if ($action -eq 'clean') {
                foreach ($run in $runs) {
                    # git object files are read-only; clear the bit so Remove-Item succeeds.
                    Get-ChildItem $run.FullName -Recurse -Force -File -ErrorAction SilentlyContinue |
                        ForEach-Object { $_.IsReadOnly = $false }
                    Remove-Item $run.FullName -Recurse -Force -Confirm:$false
                    Write-Step "removed $($run.Name)"
                }
                break
            }
            foreach ($run in $runs) {
                $mb = (Get-ChildItem $run.FullName -Recurse -Force -File -ErrorAction SilentlyContinue |
                    Measure-Object Length -Sum).Sum / 1MB
                $bare = Join-Path $run.FullName 'origin.git'
                $branches = if (Test-Path $bare) { (& git --git-dir $bare branch --format='%(refname:short)' 2>$null) -join ', ' } else { '(no origin.git)' }
                Write-Host ("  {0,-24} {1,8:N0} MB  {2}" -f $run.Name, $mb, $branches)
            }
            Write-Host ""
            Write-Host "obs fixes clean       remove them all. To pull a fix into the real repo first:"
            Write-Host "  git fetch .artifacts/autofix/<run>/origin.git <branch>:<branch>"
        }

        { $_ -in 'ps', 'status' } { docker compose @Full ps }

        'logs' { docker compose @Full logs -f --tail=100 @Rest }

        'urls' {
            Write-Host @"
Control plane  $WebUrl   (dev mode, no auth)
Grafana        $GrafanaUrl   (anonymous Admin)
Marquez UI     $MarquezUrl
Gateway API    $GatewayUrl
dq-runner      http://localhost:$($Ports.OBS_DQ_RUNNER_PORT)
Agent service  http://localhost:$($Ports.OBS_AGENTS_PORT)   (host process, see `obs hosts`)
"@
        }

        'hosts' {
            Write-Host @"
The web UI (:$($Ports.OBS_WEB_PORT)) and agent-service (:$($Ports.OBS_AGENTS_PORT)) run on the HOST, not in compose.
Full lab = 'obs up' (containers) + these two, each in its own terminal:

  obs agents     agent-service :$($Ports.OBS_AGENTS_PORT)  (Claude Agent SDK uses your Claude Code login)
  obs web        web control plane :$($Ports.OBS_WEB_PORT)

Raw equivalents:
  cd apps/agent-service; uv sync; uv run python -m agent_service
  cd apps/web; bun run dev
"@
        }

        'preflight' {
            $ok = $true

            Write-Step 'required binaries on this machine (cluster-side tools live on the VM)'
            # name -> purpose, plus a known install path for tools that skip PATH.
            $bins = [ordered]@{
                docker    = @('Docker Desktop', $null)
                bun       = @('subject services + web', $null)
                uv        = @('agent-service', $null)
                portless  = @('https://obs-*.localhost names', $null)
                kubectl   = @('talks to the cluster', "$env:ProgramFiles\Docker\Docker\resources\bin\kubectl.exe")
                ssh       = @('obs k8s wraps ssh to the VM', $null)
                tailscale = @('path to the VM', "$env:ProgramFiles\Tailscale\tailscale.exe")
            }
            foreach ($b in $bins.Keys) {
                $found = (Get-Command $b -ErrorAction SilentlyContinue) -or
                         ($bins[$b][1] -and (Test-Path $bins[$b][1]))
                if ($found) { Write-Host ("  ok  {0,-10} {1}" -f $b, $bins[$b][0]) }
                else { Write-Warning "missing: $b ($($bins[$b][0]))"; $ok = $false }
            }

            Write-Step 'portless proxy'
            $null = & portless get obs-web 2>$null
            if ($LASTEXITCODE -eq 0) { Write-Host '  ok  proxy answering, obs-* aliases registered' }
            else { Write-Warning "portless aliases not registered - run 'obs names'"; $ok = $false }

            Write-Step 'ports from infra/ports.env (free, or bound by this lab = ok)'
            # Processes that legitimately hold lab ports: docker's port proxy,
            # the host-run bun/vite/uv processes, and the portless proxy itself.
            $labProcs = @('com.docker.backend', 'docker', 'wslrelay', 'vpnkit-bridge',
                          'bun', 'node', 'python', 'uvicorn', 'portless')
            foreach ($key in ($Ports.Keys | Where-Object { $_ -like 'OBS_*_PORT' } | Sort-Object)) {
                $p = [int]$Ports[$key]
                if ($p -eq 8090) { Write-Warning "$key maps onto 8090 - that port is HyperHDR-poisoned (dual-stack squat); pick another"; $ok = $false; continue }
                $conns = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
                if (-not $conns) { Write-Host ("  ok  {0,-22} :{1,-6} free" -f $key, $p); continue }
                $owners = @($conns | ForEach-Object {
                    (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
                } | Where-Object { $_ } | Sort-Object -Unique)
                $foreign = @($owners | Where-Object { $labProcs -notcontains $_ })
                if ($foreign.Count -eq 0) {
                    Write-Host ("  ok  {0,-22} :{1,-6} bound by this lab ({2})" -f $key, $p, ($owners -join ','))
                } else {
                    $ok = $false
                    Write-Warning ("{0} :{1} is held by '{2}' - the fix is ONE line: edit {0} in infra\ports.env to a free port, then rerun 'obs names' + 'obs up'" -f $key, $p, ($foreign -join ','))
                }
            }

            Write-Host ''
            if ($ok) { Write-Step 'preflight PASSED' } else { Write-Warning 'preflight FAILED - fix the items above'; exit 1 }
        }

        'names' {
            $action = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'register' }
            if ($action -eq 'install') { portless service install; break }
            # Human-facing endpoints only - headless infra keeps numbers (PLAN-2 SS D).
            $aliases = [ordered]@{
                'obs-web'       = $Ports.OBS_WEB_PORT
                'obs-grafana'   = $Ports.OBS_GRAFANA_PORT
                'obs-gateway'   = $Ports.OBS_GATEWAY_PORT
                'obs-agents'    = $Ports.OBS_AGENTS_PORT
                'obs-gitea'     = $Ports.OBS_GITEA_PORT
                'obs-argocd'    = $Ports.OBS_ARGOCD_PORT
                'obs-rollouts'  = $Ports.OBS_ROLLOUTS_PORT
                'obs-chaos'     = $Ports.OBS_CHAOSMESH_PORT
                'obs-marquez'   = $Ports.OBS_MARQUEZ_UI_PORT
                'obs-pyroscope' = $Ports.OBS_PYROSCOPE_PORT
                'obs-alloy'     = $Ports.OBS_ALLOY_UI_PORT
                'obs-otlp'      = $Ports.OBS_OTLP_HTTP_PORT
            }
            Use-OpenSsl | Out-Null
            Write-Step 'portless proxy (:443) - starting if not already up'
            portless proxy start
            Write-Step 'trusting the local CA (no-op when already trusted; may prompt once)'
            portless trust
            Write-Step 'registering aliases from infra/ports.env'
            foreach ($name in $aliases.Keys) {
                portless alias $name $aliases[$name] --force | Out-Null
                Write-Host ("  https://{0}.localhost  ->  :{1}" -f $name, $aliases[$name])
            }
            Write-Host ''
            Write-Host "Names follow the map: edit infra/ports.env, rerun 'obs names', done."
            Write-Host "Optional autostart on boot: obs names install"
        }

        'web' {
            Set-Location (Join-Path $Repo 'apps\web')
            $env:OBS_WEB_PORT = $Ports.OBS_WEB_PORT
            $names = Get-NameUrls
            if ($names) {
                foreach ($k in $names.Keys) { Set-Item "env:$k" $names[$k] }
                Write-Step 'portless names active - Grafana/Marquez iframes + RUM use https://obs-*.localhost'
            }
            Write-Step "web control plane -> $WebUrl  (Ctrl-C to stop)"
            bun run dev
        }

        { $_ -in 'agents', 'agent', 'agent-service' } {
            Set-Location (Join-Path $Repo 'apps\agent-service')
            $env:AGENT_SERVICE_PORT = $Ports.OBS_AGENTS_PORT
            Write-Step "agent-service -> http://localhost:$($Ports.OBS_AGENTS_PORT)  (Ctrl-C to stop)"
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
