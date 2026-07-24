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
                             40 qps). Runtime chaos, k8s-native faults, the git-mode
                             delivery scenarios (bad-deploy, canary-bad-image, sync-fail,
                             config-drift), and the credential-rotation scenario
                             (stale-secret - no scripted revert, the agent's remediation IS
                             the fix). No argument lists them all with inject_mode.
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
    obs k8s <sub>            Cluster lifecycle on the VM (Profile A). Subcommands:
                             up (start/create cluster, stop compose subject - one subject
                             system at a time), down (stop cluster, back to compose mode),
                             delete, status (nodes/pods + WSL clock-drift check), build,
                             deploy, smoke, node-stop <name>, node-start <name>,
                             monitoring (install/upgrade the k8s-monitoring chart from
                             infra/k8s/monitoring/values.yaml - P8 telemetry),
                             argo (install/upgrade Argo CD + Argo Rollouts from
                             infra/k8s/{argocd,rollouts}/values.yaml - P10 delivery),
                             agent-kubeconfig (mint the agent-ro 168h read-only kubeconfig),
                             agent-remediate-kubeconfig (mint the agent-remediate 168h
                             kubeconfig - the on-call agent's scoped writer identity,
                             namespace `subject` + one named Secret - P11 Task 8).
    obs ci <sub>             CI layer on the VM (Profile A): Gitea + Actions runner +
                             ci-shim (P9). Subcommands: up (ship source, compose up,
                             bootstrap admin/token/runner), down, logs [svc],
                             token (API token for agent-service), status.
    obs gitops <sub>         Desired-state repo obs/obs-gitops (P10): init (seed from
                             infra/gitops), push [msg] (operator override force-sync),
                             status (Applications sync/health table).
    obs argocd               Argo CD UI: port-forward :8443 -> argocd-server, print the
                             admin password, open the browser. Ctrl-C stops the forward.
    obs rollouts             Argo Rollouts dashboard on :3105, served locally by the
                             kubectl-argo-rollouts plugin (auto-downloaded to .tools\).
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

# Which machine answers the subject-system's ports? 'compose' = this laptop;
# 'k8s' = the cluster on the VM (Profile A). obs k8s up|down flips the file.
$ModeFile = Join-Path $Repo '.obs-mode'
$Mode = if ((Test-Path $ModeFile) -and ((Get-Content $ModeFile -Raw).Trim() -eq 'k8s')) { 'k8s' } else { 'compose' }

# Derived URLs used throughout. Agents deliberately uses 127.0.0.1: Windows
# resolves localhost to ::1 first and uvicorn binds v4-only.
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

function Get-ArgoTool {
    # The delivery toolbelt (P10): argocd.exe + kubectl-argo-rollouts.exe,
    # pinned to the installed chart app-versions and fetched once into the
    # git-ignored .tools\. Returns the exe path.
    param([ValidateSet('argocd', 'kubectl-argo-rollouts')][string]$Name)
    $urls = @{
        'argocd'                = 'https://github.com/argoproj/argo-cd/releases/download/v3.4.5/argocd-windows-amd64.exe'
        'kubectl-argo-rollouts' = 'https://github.com/argoproj/argo-rollouts/releases/download/v1.9.1/kubectl-argo-rollouts-windows-amd64'
    }
    $dir = Join-Path $Repo '.tools'
    $exe = Join-Path $dir "$Name.exe"
    if (-not (Test-Path $exe)) {
        New-Item -ItemType Directory -Force $dir | Out-Null
        Write-Step "downloading $Name.exe -> .tools\ (once)"
        Invoke-WebRequest -Uri $urls[$Name] -OutFile $exe -UseBasicParsing
    }
    return $exe
}

function Disable-AutoSync {
    # Live-inject guard (P10): drop `automated` from one Application so an
    # injected fault shows as OutOfSync WITHOUT being healed. selfHeal=false
    # is not sufficient - v3 auto-sync retriggers on drift whenever the
    # target revision is newer than the last attempted sync. Restore by
    # re-applying infra/k8s/argocd/apps/<app>.yaml (the revert paths do).
    param([string]$App, [string]$Kubeconfig)
    $f = Join-Path $env:TEMP 'obs-autosync-off.json'
    Set-Content -Encoding ascii -Path $f -Value '{"spec":{"syncPolicy":{"automated":null}}}'
    kubectl --kubeconfig $Kubeconfig -n argocd patch application $App --type merge --patch-file $f 2>$null | Out-Null
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
    # Compose subject is authoritative again; k8s-mode URLs stand down.
    Set-Content -Path $ModeFile -Value 'compose'
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
    'pod-kill' = 'k8s only: delete every gateway pod mid-traffic -> 5xx blip -> reschedule (~5 min)'
    oomkill    = 'k8s only: retriever memory limit -> 64Mi under load -> OOMKilled sawtooth (~7 min)'
    imagepull  = 'k8s only: gateway image -> tag that never existed -> ImagePullBackOff     (~7 min)'
    crashloop  = 'k8s only: retriever DATABASE_URL -> garbage -> CrashLoopBackOff at boot   (~7 min)'
    'readiness-break' = 'k8s only: gateway probe -> wrong path -> Running but never Ready   (~7 min)'
    'bad-deploy' = 'k8s+ci: bad commit merges -> CI deploys 2s latency into model-proxy -> p95 page; agent walks alert -> deploy annotation -> CI run -> diff (~18 min)'
    'canary-bad-image' = 'k8s+ci+gitops: commit makes gateway 500 -> CI ships it -> canary takes 25% -> error-rate AnalysisRun FAILS vs Mimir -> auto-abort + webhook; agent quotes the measurements (~15 min)'
    'config-drift' = 'k8s+gitops: live kubectl edit of the subject-telemetry ConfigMap -> platform OutOfSync + on-out-of-sync webhook; agent names the drifted key (~6 min)'
    'sync-fail' = 'gitops: broken manifest lands on obs-gitops main -> the sync FAILS + on-sync-failed webhook; agent quotes the apply error and the commit (~8 min)'
    'stale-secret' = 'k8s only: rotate the subject Postgres password without updating the K8s Secret -> auth failures build as pooled connections recycle (~5 min, no scripted revert - the agent syncs the Secret from the vault)'
}

# inject_mode (P10): how each scenario enters the system. git = through the
# pipeline / gitops repos, so Argo stays Synced (the change IS the desired
# state); live = out-of-band mutation - every live inject that patches a
# TRACKED RESOURCE adds "Argo flags the app OutOfSync" to its expected
# signature (runtime /admin/chaos and pod deletion touch no spec, so they
# stay invisible to Argo by design).
$FailInjectMode = [ordered]@{
    latency = 'live'; errors = 'live'; timeout = 'live'; outage = 'live'
    brownout = 'live'; flaky = 'live'; throttle = 'live'; full = 'live'
    'pod-kill' = 'live'; oomkill = 'live'; imagepull = 'live'
    crashloop = 'live'; 'readiness-break' = 'live'
    'bad-deploy' = 'git'; 'canary-bad-image' = 'git'
    'config-drift' = 'live'; 'sync-fail' = 'git'
    'stale-secret' = 'live'
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
                $tok = Get-ObsToken
                if ($tok) { $agentCmd = "`$env:OBS_TOKEN='$tok'; $agentCmd" }
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
                $tok = Get-ObsToken
                if ($tok) { $webCmd = "`$env:OBS_TOKEN='$tok'; $webCmd" }
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
                    Write-Host ("  {0,-17} {1,-4} {2}" -f $name, $FailInjectMode[$name], $FailScenarios[$name])
                }
                Write-Host ""
                Write-Host "inject_mode: git = ships through CI/gitops (Argo stays Synced); live ="
                Write-Host "out-of-band - patched resources show OutOfSync in Argo (part of the signature)."
                Write-Host ""
                Write-Host "Each drives baseline traffic the whole time; chaos is applied/cleared on a"
                Write-Host "clock and always reset on exit. Watch Grafana (:$($Ports.OBS_GRAFANA_PORT)) and the incident inbox"
                Write-Host "(:$($Ports.OBS_WEB_PORT)/incidents); the agent-service (:$($Ports.OBS_AGENTS_PORT)) must be up to get postmortems."
                break
            }
            $qps = if ($Rest.Count -ge 2) { $Rest[1] } else { '40' }

            if ($scenario -eq 'pod-kill') {
                # The first Kubernetes-native failure: no /admin/chaos knob,
                # the orchestrator itself is the failure domain.
                if ($Mode -ne 'k8s') { Write-Warning "pod-kill needs k8s mode (obs k8s up) - the compose subject has no pods"; break }
                $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
                $dur = '300'
                Write-Step "pod-kill: ${dur}s of baseline load @ $qps qps; gateway pods die at t=60s"
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd
                Start-Sleep -Seconds 60
                Write-Step 'kubectl delete pod -l app=gateway (all replicas, mid-traffic)'
                kubectl --kubeconfig $kubeconfig -n subject delete pod -l app=gateway
                Write-Step 'pods rescheduling - watch the 5xx blip on Grafana, then recovery:'
                kubectl --kubeconfig $kubeconfig -n subject get pods -l app=gateway
                Write-Step "load keeps running ~4 more minutes. Ask the RCA agent about the blip - with its kubectl grant it should conclude 'transient pod restart, no code regression'."
                break
            }

            if ($scenario -in 'oomkill', 'imagepull', 'crashloop', 'readiness-break') {
                # P8's k8s-native faults. Every injection edits the POD
                # TEMPLATE, so all four share ONE paired revert: rollout undo
                # restores the previous ReplicaSet exactly (image, env,
                # resources, probes - no drift, no state to remember).
                if ($Mode -ne 'k8s') { Write-Warning "$scenario needs k8s mode (obs k8s up) - the compose subject has no pod specs to break"; break }
                $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
                $target = if ($scenario -in 'oomkill', 'crashloop') { 'deployment/retriever' } else { 'deployment/gateway' }
                $app = ($target -split '/')[1]
                $dur = '420'
                Write-Step "${scenario}: ${dur}s baseline load @ $qps qps; fault at t=45s, auto-revert ~t=360s"
                Write-Host "  manual revert any time: kubectl --kubeconfig `"$kubeconfig`" -n subject rollout undo $target"
                # P10 re-baseline: these are LIVE injects against a tracked
                # Deployment - Argo flags the app OutOfSync (expected in the
                # signature) and must NOT heal it. selfHeal=false alone is not
                # enough on Argo CD v3: auto-sync fires for any drift while
                # the target revision is newer than the last attempted one
                # (caught live), so the guard removes `automated` entirely for
                # the inject window; revert re-applies the committed CR.
                Disable-AutoSync $app $kubeconfig
                if ($app -eq 'gateway') {
                    Write-Host "  NOTE gateway is a Rollout now: the patch starts a CANARY that wedges (stable pods keep serving); expect rollout-stuck + app OutOfSync, not a full outage."
                }
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd
                Start-Sleep -Seconds 45
                switch ($scenario) {
                    'oomkill' {
                        # The demo the phase unlocks: working set flat-tops at
                        # the new limit; the agent reads it off last_terminated_
                        # reason + the sawtooth and recommends the exact revert.
                        Write-Step 'retriever memory: requests 384Mi -> 48Mi, limit 512Mi -> 64Mi'
                        kubectl --kubeconfig $kubeconfig -n subject set resources deployment/retriever --requests=memory=48Mi --limits=memory=64Mi
                    }
                    'imagepull' {
                        Write-Step 'gateway image -> obs-registry:5010/gateway:phantom (a tag that never existed)'
                        kubectl --kubeconfig $kubeconfig -n subject set image deployment/gateway gateway=obs-registry:5010/gateway:phantom
                    }
                    'crashloop' {
                        # Verified fail-fast: postgres client throws
                        # ERR_INVALID_URL at module load, exit 1 before bind.
                        Write-Step 'retriever DATABASE_URL -> "garbage" (crashes at boot, old pod keeps serving)'
                        kubectl --kubeconfig $kubeconfig -n subject set env deployment/retriever DATABASE_URL=garbage
                    }
                    'readiness-break' {
                        Write-Step 'gateway readiness probe -> /definitely-not-ready (pod Running, never Ready)'
                        kubectl --kubeconfig $kubeconfig -n subject patch deployment gateway --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/definitely-not-ready"}]'
                    }
                }
                kubectl --kubeconfig $kubeconfig -n subject get pods
                Write-Step "fault active ~5 min. Watch 'Lab Alerts - K8s' + the events dashboard; the incident inbox gets the postmortem ($WebUrl/incidents)."
                Start-Sleep -Seconds 315
                Write-Step "auto-revert: rollout undo $target"
                kubectl --kubeconfig $kubeconfig -n subject rollout undo $target
                kubectl --kubeconfig $kubeconfig -n subject rollout status $target --timeout=180s
                # Restore the committed Application policy (undoes the
                # self-heal patch above; a rollback-to-stable template also
                # clears the OutOfSync the inject caused).
                kubectl --kubeconfig $kubeconfig apply -f (Join-Path $Repo "infra\k8s\argocd\apps\$app.yaml") | Out-Null
                Write-Step 'reverted and rolled out. The postmortem should name the exact spec change - check the inbox.'
                break
            }

            if ($scenario -eq 'bad-deploy') {
                # P9's flagship: the failure ships through the DELIVERY PIPELINE
                # itself. A plausible-looking commit lands on gitea main; CI
                # tests it (they pass - the sleep is parallel-safe), builds it,
                # deploys it; p95 breaches the 2s page alert; the agent walks
                # alert -> deploy annotation -> CI run -> compare diff to the
                # exact commit and line. Auto-reverts via a second commit, so
                # the fix ALSO ships through the pipeline.
                if ($Mode -ne 'k8s') { Write-Warning "bad-deploy needs k8s mode (obs k8s up)"; break }
                $vm = $Ports.OBS_VM_HOST
                $giteaBase = "http://${vm}:$($Ports.OBS_GITEA_PORT)"
                try { Invoke-RestMethod "$giteaBase/api/healthz" -TimeoutSec 5 | Out-Null }
                catch { Write-Warning "gitea is not answering at $giteaBase - run 'obs ci up' first"; break }

                $dur = '1500'
                Write-Step "bad-deploy: ${dur}s baseline load @ $qps qps; bad commit pushes now, CI deploys it (~4 min), revert commit at ~t+12m"
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd

                # Fresh shallow clone of gitea main - never the working tree.
                $tok = (ssh -o BatchMode=yes "root@$vm" 'cat /root/obs-lab/.gitea-token').Trim()
                if (-not $tok) { Write-Warning 'no gitea token on the VM (obs ci up)'; break }
                $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("obs:$tok"))
                $auth = "http.${giteaBase}/.extraheader"
                $tmp = Join-Path $env:TEMP 'obs-bad-deploy'
                if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
                git -c "$auth=Authorization: Basic $b64" clone -q --depth 5 --branch main "$giteaBase/obs/obs-lab.git" $tmp
                if ($LASTEXITCODE -ne 0) { Write-Warning 'clone of gitea main failed'; break }
                git -C $tmp config $auth "Authorization: Basic $b64"
                git -C $tmp config user.email 'dev@obs-lab.local'
                git -C $tmp config user.name 'Lab Dev'

                # The bad change: an innocent-looking "warm-up" that serialises
                # 2s into every completion. (.gitattributes normalises the CRLF
                # this write introduces, so the diff is just the inserted lines.)
                $svcFile = Join-Path $tmp 'apps\model-proxy\src\slices\complete\service.ts'
                $anchor = '      return generateCompletion(req);'
                $replacement = "      // Pre-warm the completion path so first-token latency stays flat`r`n" +
                               "      // under bursty load (upstream provider's recommended warm-up).`r`n" +
                               "      await sleep(2000);`r`n`r`n" +
                               "      return generateCompletion(req);"
                $content = Get-Content $svcFile -Raw
                if ($content -notmatch [regex]::Escape($anchor)) { Write-Warning "anchor line not found in service.ts - source drifted"; break }
                $content.Replace($anchor, $replacement) | Set-Content -Encoding ascii $svcFile
                git -C $tmp commit -qam "model-proxy: pre-warm the completion path before generating"
                git -C $tmp push -q origin main
                if ($LASTEXITCODE -ne 0) { Write-Warning 'push to gitea main failed'; break }
                $badSha = (git -C $tmp rev-parse --short HEAD).Trim()
                Write-Step "bad commit $badSha is on main. Watch: CI $giteaBase/obs/obs-lab/actions | Grafana $GrafanaUrl (Gateway RED + CI/CD Delivery)"
                Write-Step 'timeline: deploy ~t+4m, p95 page alert ~t+11m, incident inbox gets the postmortem; revert commit at t+12m, fix deployed ~t+16m'

                Start-Sleep -Seconds 720
                Write-Step 'auto-revert: reverting the bad commit (the fix ships through CI too)'
                git -C $tmp revert --no-edit HEAD | Out-Null
                git -C $tmp push -q origin main
                Write-Step "revert pushed. Ask the RCA agent: 'p95 latency paged just now - what shipped in the last hour, and which exact change is responsible?'"
                break
            }

            if ($scenario -eq 'canary-bad-image') {
                # P10's flagship: the failure ships through the FULL delivery
                # chain - commit -> CI build -> gitops bump -> Argo sync ->
                # canary - and the lab's own SLIs kill it: the canary pod 500s
                # on /v1/chat, the error-rate AnalysisRun fails against Mimir,
                # Rollouts auto-aborts (stable keeps serving), and
                # on-rollout-aborted spawns the gitops-reporter with the
                # failing measurements. The revert also ships through CI, and
                # its completed rollout triggers the resolution note.
                if ($Mode -ne 'k8s') { Write-Warning "canary-bad-image needs k8s mode (obs k8s up)"; break }
                $vm = $Ports.OBS_VM_HOST
                $giteaBase = "http://${vm}:$($Ports.OBS_GITEA_PORT)"
                try { Invoke-RestMethod "$giteaBase/api/healthz" -TimeoutSec 5 | Out-Null }
                catch { Write-Warning "gitea is not answering at $giteaBase - run 'obs ci up' first"; break }

                $dur = '1500'
                Write-Step "canary-bad-image: ${dur}s baseline load @ $qps qps; bad commit pushes now; CI ~4m -> canary ~t+6m -> AUTO-ABORT ~t+9m; revert at t+12m"
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd

                $tok = (ssh -o BatchMode=yes "root@$vm" 'cat /root/obs-lab/.gitea-token').Trim()
                if (-not $tok) { Write-Warning 'no gitea token on the VM (obs ci up)'; break }
                $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("obs:$tok"))
                $auth = "http.${giteaBase}/.extraheader"
                $tmp = Join-Path $env:TEMP 'obs-canary-bad-image'
                if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
                git -c "$auth=Authorization: Basic $b64" clone -q --depth 5 --branch main "$giteaBase/obs/obs-lab.git" $tmp
                if ($LASTEXITCODE -ne 0) { Write-Warning 'clone of gitea main failed'; break }
                git -C $tmp config $auth "Authorization: Basic $b64"
                git -C $tmp config user.email 'dev@obs-lab.local'
                git -C $tmp config user.name 'Lab Dev'

                # The bad change: a plausible "fail closed" guard that only
                # bites where MODEL_PROXY_URL is set as an env var - the k8s
                # pods. CI's unit tests (config-default env) stay green.
                $svcFile = Join-Path $tmp 'apps\gateway\src\slices\inference\service.ts'
                $anchor = '      const runId = newRunId();'
                $replacement = "      const runId = newRunId();`r`n" +
                               "      // Fail closed when the provider contract ack is missing - the gateway`r`n" +
                               "      // must not forward requests it cannot attribute (OBS-1123; providers`r`n" +
                               "      // roll the contract next week).`r`n" +
                               "      if (process.env.MODEL_PROXY_URL && !process.env.PROVIDER_CONTRACT_V2) {`r`n" +
                               "        throw new Error(`"provider contract v2 not acknowledged`");`r`n" +
                               "      }"
                $content = Get-Content $svcFile -Raw
                if ($content -notmatch [regex]::Escape($anchor)) { Write-Warning 'anchor line not found in service.ts - source drifted'; break }
                $content.Replace($anchor, $replacement) | Set-Content -Encoding ascii $svcFile
                git -C $tmp commit -qam "gateway: fail closed when the provider contract ack is missing"
                git -C $tmp push -q origin main
                if ($LASTEXITCODE -ne 0) { Write-Warning 'push to gitea main failed'; break }
                $badSha = (git -C $tmp rev-parse --short HEAD).Trim()
                Write-Step "bad commit $badSha is on main. Watch: rollouts UI (obs rollouts), argo UI (obs argocd), CI $giteaBase/obs/obs-lab/actions"
                Write-Step 'expected: canary takes 25%, ~25% of /v1/chat 500s for ~2 min, error-rate AnalysisRun fails, canary scales to ZERO, stable keeps serving; incident inbox gets the abort postmortem'

                Start-Sleep -Seconds 720
                Write-Step 'auto-revert: reverting the bad commit (the fix ships through CI + a fresh healthy canary)'
                git -C $tmp revert --no-edit HEAD | Out-Null
                git -C $tmp push -q origin main
                Write-Step "revert pushed. When its rollout completes, the agent posts the resolution note on the open incident."
                break
            }

            if ($scenario -eq 'config-drift') {
                # P10: out-of-band change to a TRACKED resource. Argo compares
                # live vs git, flips platform OutOfSync, the on-out-of-sync
                # notification hits /webhook/gitops, and (after the agent's
                # deliberate 30s still-drifted re-check) the gitops-reporter
                # names the drifted key. Self-heal is off, so nothing reverts
                # it but us.
                if ($Mode -ne 'k8s') { Write-Warning "config-drift needs k8s mode (obs k8s up)"; break }
                $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
                $orig = (kubectl --kubeconfig $kubeconfig -n subject get configmap subject-telemetry -o jsonpath='{.data.OTEL_EXPORTER_OTLP_ENDPOINT}')
                if (-not $orig) { Write-Warning 'subject-telemetry ConfigMap not found - is the platform app synced?'; break }
                Disable-AutoSync 'platform' $kubeconfig
                Write-Step "config-drift: OTEL_EXPORTER_OTLP_ENDPOINT -> http://drifted.invalid:4318 (was $orig)"
                # --patch-file, not -p: PS 5.1 native-arg quoting strips the
                # embedded double quotes out of inline JSON.
                $patchFile = Join-Path $env:TEMP 'obs-config-drift.json'
                Set-Content -Encoding ascii -Path $patchFile -Value '{"data":{"OTEL_EXPORTER_OTLP_ENDPOINT":"http://drifted.invalid:4318"}}'
                kubectl --kubeconfig $kubeconfig -n subject patch configmap subject-telemetry --type merge --patch-file $patchFile | Out-Null
                Write-Step 'platform flips OutOfSync in ~30s; the webhook + 30s re-check spawn the gitops-reporter in ~2 min'
                Write-Host "  the sting: NOTHING breaks yet - pods only read this at startup. The next rollout would ship blind telemetry. That stale-config story is the point."
                Start-Sleep -Seconds 300
                Write-Step 'auto-revert: restoring the committed value'
                $restoreFile = Join-Path $env:TEMP 'obs-config-drift-restore.json'
                @{ data = @{ OTEL_EXPORTER_OTLP_ENDPOINT = $orig } } | ConvertTo-Json -Compress |
                    Set-Content -Encoding ascii -Path $restoreFile
                kubectl --kubeconfig $kubeconfig -n subject patch configmap subject-telemetry --type merge --patch-file $restoreFile | Out-Null
                kubectl --kubeconfig $kubeconfig apply -f (Join-Path $Repo 'infra\k8s\argocd\apps\platform.yaml') | Out-Null
                Write-Step 'live matches git again (auto-sync restored) - platform returns Synced on the next refresh. Check the incident inbox for the drift report.'
                break
            }

            if ($scenario -eq 'sync-fail') {
                # P10: the desired state ITSELF is broken. A schema-plausible
                # but API-invalid manifest lands on obs-gitops main; the
                # webhook-triggered auto-sync FAILS (live objects untouched),
                # on-sync-failed hits the agent, and the postmortem quotes the
                # apply error plus the guilty commit. Reverted through git,
                # like everything in this phase.
                $vm = $Ports.OBS_VM_HOST
                $giteaBase = "http://${vm}:$($Ports.OBS_GITEA_PORT)"
                try { Invoke-RestMethod "$giteaBase/api/healthz" -TimeoutSec 5 | Out-Null }
                catch { Write-Warning "gitea is not answering at $giteaBase - run 'obs ci up' first"; break }
                $tok = (ssh -o BatchMode=yes "root@$vm" 'cat /root/obs-lab/.gitea-token').Trim()
                if (-not $tok) { Write-Warning 'no gitea token on the VM (obs ci up)'; break }
                $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("obs:$tok"))
                $auth = "http.${giteaBase}/.extraheader"
                $tmp = Join-Path $env:TEMP 'obs-sync-fail'
                if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
                git -c "$auth=Authorization: Basic $b64" clone -q --branch main "$giteaBase/obs/obs-gitops.git" $tmp
                if ($LASTEXITCODE -ne 0) { Write-Warning 'clone of obs-gitops failed'; break }
                git -C $tmp config $auth "Authorization: Basic $b64"
                git -C $tmp config user.email 'dev@obs-lab.local'
                git -C $tmp config user.name 'Lab Dev'
                $depFile = Join-Path $tmp 'services\retriever\deployment.yaml'
                (Get-Content $depFile -Raw).Replace('  replicas: 1', '  replicas: -1') | Set-Content -Encoding ascii $depFile
                git -C $tmp commit -qam 'retriever: scale tuning for the new memory envelope'
                git -C $tmp push -q origin main
                if ($LASTEXITCODE -ne 0) { Write-Warning 'push to obs-gitops failed'; break }
                Write-Step "broken manifest pushed ($( (git -C $tmp rev-parse --short HEAD).Trim() )). Auto-sync fails in ~30s; on-sync-failed spawns the agent. Live retriever keeps running untouched."
                Start-Sleep -Seconds 300
                Write-Step 'auto-revert: git revert (the fix is a commit, like the break)'
                git -C $tmp revert --no-edit HEAD | Out-Null
                git -C $tmp push -q origin main
                Write-Step 'revert pushed - the next sync goes green. Check the incident inbox.'
                break
            }

            if ($scenario -eq 'stale-secret') {
                # P11's flagship credential-rotation incident: the in-cluster
                # Postgres password changes but the K8s Secret does not.
                # Pooled connections keep working until max_lifetime (60s on
                # both gateway and retriever) recycles them, then auth starts
                # failing. There is no scripted revert - the oncall agent's
                # remediation (update_db_secret: reads the rotated password
                # from the lab vault below, patches the Secret, one
                # approval, the password is never shown) IS the fix.
                if ($Mode -ne 'k8s') { Write-Warning "stale-secret needs k8s mode (obs k8s up) - the compose subject has no live Postgres to rotate against"; break }
                $vm = $Ports.OBS_VM_HOST
                $dur = '300'
                Write-Step "stale-secret: ${dur}s of baseline load @ $qps qps; Postgres password rotates now, the Secret is left stale"
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd

                $pw = "rotated-$(Get-Random)"
                Write-Step 'rotating the in-cluster lab Postgres password (the K8s Secret is NOT touched)'
                # Pipe the SQL via stdin: inline -c quoting does not survive the
                # PowerShell -> ssh -> kubectl exec argv layers on Windows.
                $sql = "ALTER USER lab WITH PASSWORD '$pw';"
                $sql | ssh -o BatchMode=yes "root@$vm" 'kubectl exec -i -n subject deploy/postgres -- psql -U lab -d observability_lab'
                if ($LASTEXITCODE -ne 0) { Write-Warning 'password rotation over ssh failed'; break }

                $vaultDir = Join-Path $Repo 'apps\agent-service\.secrets'
                New-Item -ItemType Directory -Force -Path $vaultDir | Out-Null
                $vaultFile = Join-Path $vaultDir 'db-vault.txt'
                Set-Content -Path $vaultFile -Value $pw
                Write-Step "rotated credential written to the lab vault: $vaultFile"
                Write-Step 'the K8s Secret is now stale; expect auth failures within ~60s as pooled connections recycle'
                Write-Step "ask the oncall agent to fix it: it should call update_db_secret (reads the vault, patches the Secret behind one approval, never prints the password) then flag that gateway+retriever need a restart"
                break
            }

            $env:CHAOS_SCHEDULE = "chaos/$scenario.yaml"
            $env:CHAOS_TARGET_QPS = $qps
            # Stall/latency drills hold connections open; give the driver headroom.
            if (-not $env:CHAOS_CONCURRENCY) { $env:CHAOS_CONCURRENCY = '128' }
            # Chaos driver targets, mode-aware and from the map: in k8s mode
            # the bases are the /chaos/* ingress routes on the VM.
            if (-not $env:GATEWAY_URL) { $env:GATEWAY_URL = $GatewayUrl }
            if (-not $env:MODEL_PROXY_URL) { $env:MODEL_PROXY_URL = $ChaosBase['model-proxy'] }
            if (-not $env:RETRIEVER_URL) { $env:RETRIEVER_URL = $ChaosBase['retriever'] }
            Write-Step "fail '$scenario': $($FailScenarios[$scenario])"
            Write-Step "watch: Grafana $GrafanaUrl | incidents $WebUrl/incidents"
            bun --cwd=apps/load-generator run chaos
        }

        'chaos' {
            $action = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }
            $planes = [ordered]@{}
            foreach ($n in $ChaosBase.Keys) { $planes[$n] = "$($ChaosBase[$n])/admin/chaos" }
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

        'smoke' {
            # Mode-aware: in k8s mode the gateway answers on the VM via Traefik
            # and the compose up/seed steps inside smoke.sh must not run.
            $env:GATEWAY = $GatewayUrl
            $env:SMOKE_MODE = $Mode
            # Prefer Git Bash explicitly - a bare 'bash' can resolve to WSL's
            # System32 stub, which explodes without a default distro.
            $gitBash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
            if (Test-Path $gitBash) { & $gitBash scripts/smoke.sh } else { bash scripts/smoke.sh }
        }

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

        'k8s' {
            $sub = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }
            $vm = $Ports.OBS_VM_HOST
            $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
            switch ($sub) {
                'up' {
                    # One subject system at a time: park the compose subject
                    # (observability plane + laptop postgres/redis stay up -
                    # agent-audit and Marquez live there under Profile A).
                    Write-Step 'mode exclusivity: stopping compose subject services'
                    docker compose --env-file infra/ports.env -f infra/compose.yml stop gateway embedder retriever model-proxy seed load-generator
                    Write-Step "cluster on ${vm}: start (or create from infra/k8s/k3d.yaml)"
                    scp -q -o BatchMode=yes infra/k8s/k3d.yaml infra/ports.env "root@${vm}:/root/obs-lab/"
                    # OBS_BIND_IP is 0.0.0.0 in ports.env (correct on the laptop,
                    # behind NAT). On the VM that would publish the gateway and
                    # the k3d API to the internet, so override it with the
                    # tailscale0 address before k3d expands the config. Fail loudly
                    # rather than fall back: k3d's expansion has no ${VAR:-default},
                    # so an empty value would silently bind everything again.
                    ssh -o BatchMode=yes "root@$vm" 'if k3d cluster list obs-lab >/dev/null 2>&1; then k3d cluster start obs-lab; else set -a; . /root/obs-lab/ports.env; OBS_BIND_IP=$(tailscale ip -4 2>/dev/null); set +a; if [ -z "$OBS_BIND_IP" ]; then echo "no tailscale IPv4 - refusing to create the cluster with a public bind" >&2; exit 1; fi; k3d cluster create --config /root/obs-lab/k3d.yaml; fi'
                    if ($LASTEXITCODE -ne 0) { throw "cluster start/create failed" }
                    ssh -o BatchMode=yes "root@$vm" 'k3d kubeconfig get obs-lab' | Set-Content -Encoding ascii $kubeconfig
                    # Cluster-level bootstrap (survives nothing - reapply every up):
                    # CoreDNS tailnet forward + the agents' read-only identity.
                    kubectl --kubeconfig $kubeconfig apply -f infra/k8s/cluster/ | Out-Null
                    Set-Content -Path $ModeFile -Value 'k8s'
                    Write-Step "k8s mode ON. Next: 'obs k8s deploy' (or 'obs k8s build' first for fresh images)"
                }
                'down' {
                    ssh -o BatchMode=yes "root@$vm" 'k3d cluster stop obs-lab'
                    Set-Content -Path $ModeFile -Value 'compose'
                    Write-Step "cluster stopped (state kept on the VM). Compose subject: 'obs up'"
                }
                'delete' {
                    ssh -o BatchMode=yes "root@$vm" 'k3d cluster delete obs-lab'
                    Set-Content -Path $ModeFile -Value 'compose'
                    Write-Step 'cluster deleted. Registry + images on the VM survive.'
                }
                'agent-kubeconfig' {
                    # Week-long read-only kubeconfig for the agents. 168h beats
                    # the 1h default that would die mid-exam (P12); k3d.yaml
                    # raised the apiserver cap so this is mintable.
                    $tok = (ssh -o BatchMode=yes "root@$vm" 'kubectl create token agent-ro -n kube-system --duration=168h').Trim()
                    if ($LASTEXITCODE -ne 0 -or -not $tok) { throw 'token mint failed - is the cluster up (obs k8s up)?' }
                    $caLine = (Get-Content $kubeconfig | Where-Object { $_ -match 'certificate-authority-data:' } | Select-Object -First 1)
                    $ca = ($caLine -split ':\s*', 2)[1].Trim()
                    $dest = Join-Path $Repo 'apps\agent-service\.kube\agent-ro.yaml'
                    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
                    @"
# Read-only cluster access for the agents (ClusterRole view; see
# infra/k8s/cluster/agent-ro.yaml). Minted $(Get-Date -Format s) for 168h by
# 'obs k8s agent-kubeconfig' - rerun to rotate. NOT tracked by git.
apiVersion: v1
kind: Config
clusters:
  - name: obs-lab
    cluster:
      server: https://${vm}:$($Ports.OBS_K3D_API_PORT)
      certificate-authority-data: $ca
users:
  - name: agent-ro
    user:
      token: $tok
contexts:
  - name: agent-ro@obs-lab
    context:
      cluster: obs-lab
      user: agent-ro
current-context: agent-ro@obs-lab
"@ | Set-Content -Encoding ascii $dest
                    Write-Step "wrote $dest (valid 168h)"
                }
                'agent-remediate-kubeconfig' {
                    # Week-long SCOPED WRITER kubeconfig for the on-call agent's
                    # six remediation tools (PLAN-2 P11 Task 8) - namespace
                    # `subject` + one named Secret only (infra/k8s/cluster/
                    # agent-remediate.yaml), never handed to the model as an MCP
                    # server (tools/remediate.py shells out to it directly,
                    # fixed-argv). Apply the RBAC first so a fresh cluster (or
                    # one that predates this task) gets the Role/SA/Binding
                    # before the token mint below can succeed.
                    kubectl --kubeconfig $kubeconfig apply -f infra/k8s/cluster/agent-remediate.yaml | Out-Null
                    $tok = (ssh -o BatchMode=yes "root@$vm" 'kubectl create token agent-remediate -n kube-system --duration=168h').Trim()
                    if ($LASTEXITCODE -ne 0 -or -not $tok) { throw 'token mint failed - is the cluster up (obs k8s up)?' }
                    $caLine = (Get-Content $kubeconfig | Where-Object { $_ -match 'certificate-authority-data:' } | Select-Object -First 1)
                    $ca = ($caLine -split ':\s*', 2)[1].Trim()
                    $dest = Join-Path $Repo 'apps\agent-service\.kube\agent-remediate.yaml'
                    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
                    @"
# Scoped writer cluster access for the on-call agent's remediation tools
# (Role scoped to namespace subject + one named Secret; see
# infra/k8s/cluster/agent-remediate.yaml). Minted $(Get-Date -Format s) for
# 168h by 'obs k8s agent-remediate-kubeconfig' - rerun to rotate. NOT tracked
# by git. Never load this as an MCP server - only tools/remediate.py's
# fixed-argv kubectl subprocess uses it.
apiVersion: v1
kind: Config
clusters:
  - name: obs-lab
    cluster:
      server: https://${vm}:$($Ports.OBS_K3D_API_PORT)
      certificate-authority-data: $ca
users:
  - name: agent-remediate
    user:
      token: $tok
contexts:
  - name: agent-remediate@obs-lab
    context:
      cluster: obs-lab
      user: agent-remediate
current-context: agent-remediate@obs-lab
"@ | Set-Content -Encoding ascii $dest
                    Write-Step "wrote $dest (valid 168h)"
                }
                'monitoring' {
                    # P8: kube-state-metrics + cadvisor/kubelet + events + pod
                    # logs -> the laptop's Mimir/Loki (see values.yaml for the
                    # egress story). Idempotent; rerun after editing values.
                    Write-Step "k8s-monitoring chart on ${vm} (helm, ns monitoring, chart pinned in values header)"
                    scp -q -o BatchMode=yes infra/k8s/monitoring/values.yaml "root@${vm}:/root/obs-lab/monitoring-values.yaml"
                    ssh -o BatchMode=yes "root@$vm" 'helm repo add grafana https://grafana.github.io/helm-charts >/dev/null 2>&1; helm repo update grafana >/dev/null 2>&1; helm upgrade --install k8s-monitoring grafana/k8s-monitoring --version 4.3.0 -n monitoring --create-namespace -f /root/obs-lab/monitoring-values.yaml --wait --timeout 5m'
                    if ($LASTEXITCODE -ne 0) { throw 'helm upgrade failed' }
                    kubectl --kubeconfig $kubeconfig -n monitoring get pods
                }
                'argo' {
                    # P10: Argo CD (gitops engine) + Argo Rollouts (canaries).
                    # Chart pins live here; values in infra/k8s/{argocd,rollouts}.
                    # Idempotent - rerun after editing either values file.
                    Write-Step "argo-cd 10.1.4 + argo-rollouts 2.41.1 on ${vm} (helm)"
                    scp -q -o BatchMode=yes infra/k8s/argocd/values.yaml "root@${vm}:/root/obs-lab/argocd-values.yaml"
                    scp -q -o BatchMode=yes infra/k8s/rollouts/values.yaml "root@${vm}:/root/obs-lab/rollouts-values.yaml"
                    ssh -o BatchMode=yes "root@$vm" 'helm repo add argo https://argoproj.github.io/argo-helm >/dev/null 2>&1; helm repo update argo >/dev/null 2>&1; helm upgrade --install argocd argo/argo-cd --version 10.1.4 -n argocd --create-namespace -f /root/obs-lab/argocd-values.yaml --wait --timeout 5m && helm upgrade --install argo-rollouts argo/argo-rollouts --version 2.41.1 -n argo-rollouts --create-namespace -f /root/obs-lab/rollouts-values.yaml --wait --timeout 3m'
                    if ($LASTEXITCODE -ne 0) { throw 'helm upgrade failed' }
                    # Credential for the private obs-gitops repo (same token the
                    # laptop remote uses), then the webhook route + the six
                    # Applications. All idempotent.
                    $tok = (ssh -o BatchMode=yes "root@$vm" 'cat /root/obs-lab/.gitea-token 2>/dev/null').Trim()
                    if ($tok) {
                        kubectl --kubeconfig $kubeconfig -n argocd create secret generic repo-obs-gitops `
                            --from-literal=type=git `
                            --from-literal=url="http://${vm}:$($Ports.OBS_GITEA_PORT)/obs/obs-gitops.git" `
                            --from-literal=username=obs --from-literal=password=$tok `
                            --dry-run=client -o yaml |
                            kubectl --kubeconfig $kubeconfig apply -f - | Out-Null
                        kubectl --kubeconfig $kubeconfig -n argocd label secret repo-obs-gitops `
                            'argocd.argoproj.io/secret-type=repository' --overwrite | Out-Null
                    } else {
                        Write-Warning "no Gitea token on the VM yet (obs ci up) - repo credential NOT created"
                    }
                    # Notification secrets for BOTH engines (X-Obs-Token header
                    # on every webhook to the agent) - value from the lab .env,
                    # never from git. Rollouts requires the component label or
                    # its controller won't watch the secret.
                    $obsTok = Get-ObsToken
                    if ($obsTok) {
                        kubectl --kubeconfig $kubeconfig -n argocd create secret generic argocd-notifications-secret `
                            --from-literal=obs-token=$obsTok --dry-run=client -o yaml |
                            kubectl --kubeconfig $kubeconfig apply -f - | Out-Null
                        kubectl --kubeconfig $kubeconfig -n argo-rollouts create secret generic argo-rollouts-notification-secret `
                            --from-literal=obs-token=$obsTok --dry-run=client -o yaml |
                            kubectl --kubeconfig $kubeconfig apply -f - | Out-Null
                        kubectl --kubeconfig $kubeconfig -n argo-rollouts label secret argo-rollouts-notification-secret `
                            'app.kubernetes.io/component=rollouts-controller' --overwrite | Out-Null
                    } else {
                        Write-Warning "no OBS_TOKEN in .env - notification secrets NOT created (webhooks to the agent will 403)"
                    }
                    kubectl --kubeconfig $kubeconfig apply -f infra/k8s/argocd/ingressroute.yaml | Out-Null
                    kubectl --kubeconfig $kubeconfig apply -f infra/k8s/argocd/apps/ | Out-Null
                    kubectl --kubeconfig $kubeconfig -n argocd get pods
                    kubectl --kubeconfig $kubeconfig -n argo-rollouts get pods
                }
                'build'  { & (Join-Path $PSScriptRoot 'k8s-build.ps1') build }
                'deploy' { & (Join-Path $PSScriptRoot 'k8s-build.ps1') deploy }
                'smoke'  { & (Join-Path $PSScriptRoot 'k8s-build.ps1') smoke }
                { $_ -in 'node-stop', 'node-start' } {
                    if ($Rest.Count -lt 2) { Write-Warning "usage: obs k8s $sub <node-name>  (k3d-obs-lab-agent-0|1, k3d-obs-lab-server-0)"; break }
                    $verb = if ($sub -eq 'node-stop') { 'stop' } else { 'start' }
                    ssh -o BatchMode=yes "root@$vm" "k3d node $verb $($Rest[1])"
                }
                'status' {
                    Write-Step "mode: $Mode (subject answers at $GatewayUrl)"
                    ssh -o BatchMode=yes "root@$vm" 'k3d cluster list; echo' 2>$null
                    if ($LASTEXITCODE -ne 0) { Write-Warning "cannot reach $vm over ssh - is Tailscale up on both ends?"; break }
                    kubectl --kubeconfig $kubeconfig get nodes 2>$null
                    kubectl --kubeconfig $kubeconfig -n subject get pods 2>$null
                    # WSL2's clock drifts after laptop sleep; Mimir then rejects
                    # the (out-of-order) samples the cluster ships to it.
                    try {
                        $wslEpoch = [int64](wsl -e date +%s 2>$null)
                        $hostEpoch = [int64][Math]::Floor((Get-Date -UFormat %s))
                        $drift = [Math]::Abs($hostEpoch - $wslEpoch)
                        if ($drift -gt 30) { Write-Warning "WSL2 clock is ${drift}s off the host - Mimir will reject samples. Fix: wsl --shutdown (then restart Docker Desktop)" }
                        else { Write-Host "  ok  WSL2 clock drift ${drift}s" }
                    } catch { }
                    Write-Host ''
                    Write-Host "NOTE 'docker system prune' on the VM while the cluster is STOPPED deletes it."
                    Write-Host "     Stop order for quitting Docker Desktop locally is irrelevant to the VM cluster."
                }
                default { Write-Warning "unknown: obs k8s $sub (up|down|delete|status|build|deploy|smoke|monitoring|argo|node-stop|node-start|agent-kubeconfig|agent-remediate-kubeconfig)" }
            }
        }

        'argocd' {
            # Argo CD UI over the tailnet: no ingress, no exposed port - just a
            # port-forward for the duration of this terminal (PLAN-2 P10).
            $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
            $pw = (kubectl --kubeconfig $kubeconfig -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>$null)
            if ($pw) {
                $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pw))
                Write-Step "login: admin / $decoded"
            } else {
                Write-Warning "no argocd-initial-admin-secret - is Argo CD installed (obs k8s argo)?"
            }
            $null = Get-ArgoTool -Name argocd   # keep the CLI in the toolbelt current
            Write-Step "http://localhost:$($Ports.OBS_ARGOCD_PORT)  (Ctrl-C stops the forward)"
            Start-Process "http://localhost:$($Ports.OBS_ARGOCD_PORT)"
            kubectl --kubeconfig $kubeconfig -n argocd port-forward svc/argocd-server "$($Ports.OBS_ARGOCD_PORT):80"
        }

        'rollouts' {
            # The Rollouts dashboard runs laptop-side (RAM on the agents is
            # spoken for): the kubectl plugin serves :3105 against the cluster.
            $kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
            $exe = Get-ArgoTool -Name kubectl-argo-rollouts
            $env:KUBECONFIG = $kubeconfig
            Write-Step "http://localhost:$($Ports.OBS_ROLLOUTS_PORT)/rollouts/subject  (Ctrl-C stops it)"
            Start-Process "http://localhost:$($Ports.OBS_ROLLOUTS_PORT)/rollouts/subject"
            & $exe dashboard --port $Ports.OBS_ROLLOUTS_PORT --namespace subject
        }

        'ci' {
            # Delivery control plane on the VM (P9) - see scripts/ci.ps1.
            $sub = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }
            & (Join-Path $PSScriptRoot 'ci.ps1') $sub @($Rest | Select-Object -Skip 1)
        }

        'gitops' {
            # Desired-state repo lifecycle (P10) - see scripts/gitops.ps1.
            $sub = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }
            & (Join-Path $PSScriptRoot 'gitops.ps1') $sub @($Rest | Select-Object -Skip 1)
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
            $tok = Get-ObsToken
            if ($tok) { $env:OBS_TOKEN = $tok }
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
            $tok = Get-ObsToken
            if ($tok) { $env:OBS_TOKEN = $tok }
            # Agents' kubectl (rca via Bash) sees the cluster read-only, never
            # through the operator's admin kubeconfig.
            $roKube = Join-Path $Repo 'apps\agent-service\.kube\agent-ro.yaml'
            if (Test-Path $roKube) { $env:KUBECONFIG = $roKube }
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
