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
    obs fail  [id] [qps] [--hold]  Run one scenario pack entry as a DRILL: baseline traffic,
                             inject, hold for the scenario's own dwell, revert. --hold skips
                             the timed revert (for scenarios an agent is meant to fix).
                             Pre-pack names (latency, crashloop, imagepull, ...) still work as
                             aliases. No argument lists every scenario.
    obs fail  full           The composite timeline: latency -> error storm -> outage, in one
                             load window (~20 min).
    obs chaos [clear]        Show (or clear) the /admin/chaos state on model-proxy + retriever.
    obs chaos list [group]   List every scenario in the pack with its group and inject_mode.
    obs chaos inject <id>    Inject one scenario's fault. Starts NO load, schedules NO revert.
    obs chaos verify <id>    Exit 0 only if the fault is live AND its signal exists.
    obs chaos revert <id>    Undo it. On command only, idempotent, safe on a healthy lab.
    obs chaos selftest <id>  inject -> verify -> revert -> verify -> revert. The gate every
                             scenario must pass before it is trusted in an exam.
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

# The scenario pack is the single definition of chaos in this lab (P12): every
# fault has exactly one inject, one verify and one revert, in
# scripts/scenarios/<id>/. `obs fail`, `obs chaos` and `obs exam` are all
# callers of it, so a drill and an exam question cannot drift apart.

# Repo root is one level up from this script (scripts/ -> repo).
$Repo = Split-Path -Parent $PSScriptRoot

# The address book, the mode flag, the derived URLs and the small shared
# helpers (Write-Step, Test-Up, Get-ObsToken, Wait-Until) live in the pack's
# _lib/env.ps1, so that `obs chaos inject <id>` and a bare
# `& scripts/scenarios/<id>/inject.ps1` resolve the lab identically - one
# address book, no drift. Cluster helpers live in _lib/k8s.ps1 and are pulled in
# by the scenarios that need them, not from here: this CLI no longer touches the
# cluster to inject anything.
. (Join-Path $PSScriptRoot 'scenarios\_lib\pack.ps1')

# The three compose files that make up the full lab, in layer order. The
# --env-file makes the compose port substitutions read the same map.
$Full = @(
    '--env-file', 'infra/ports.env',
    '-f', 'infra/compose.yml',
    '-f', 'infra/compose.observability.yml',
    '-f', 'infra/compose.lineage.yml'
)

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

    # Mode exclusivity guard. In k8s mode the subject system runs on the
    # cluster. Starting the compose subject alongside it publishes a SECOND
    # gateway into the same Mimir - duplicate RED series, double-counted SLO
    # burn, and two sources for one dashboard - and this function used to
    # silently rewrite .obs-mode back to 'compose' on the way past, so the only
    # symptom was a lie in a file nobody reads.
    #
    # In k8s mode we still want the laptop-side halves: postgres/redis (Marquez
    # and agent-audit live there under Profile A) and the observability +
    # lineage planes. Those are started by NAME off the full merged project -
    # not by dropping compose.yml from the file list, because the plane files
    # extend the subject services (adding env/labels to a `retriever` whose
    # image lives in compose.yml) and fail to parse on their own.
    # The keep-list is derived by subtraction, so a service added later is
    # included automatically rather than silently skipped.
    #
    # `obs up --force` restores the old all-in behaviour and returns to compose
    # mode - use it when you genuinely want both subjects running.
    $forceNames = @('--force', '-force')
    $force = @($Extra | Where-Object { $forceNames -contains "$_".ToLower() }).Count -gt 0
    $Extra = @($Extra | Where-Object { $forceNames -notcontains "$_".ToLower() })

    if ($Mode -eq 'k8s' -and -not $force) {
        Write-Step 'k8s mode: bringing up the laptop-side planes only'
        Write-Host '      (the subject system runs on the cluster - see: obs k8s status)'
        $subjectSvcs = @('gateway', 'embedder', 'retriever', 'model-proxy', 'seed', 'load-generator')
        $allSvcs = @(docker compose @Full config --services 2>$null)
        if (-not $allSvcs) { throw 'could not enumerate compose services' }
        $keep = @($allSvcs | Where-Object { $subjectSvcs -notcontains $_ })
        Write-Host "      starting: $($keep -join ', ')"
        docker compose @Full up -d @keep @Extra
        if ($LASTEXITCODE -ne 0) { throw "laptop-side planes failed with exit code $LASTEXITCODE" }
        Write-Host ''
        Write-Host "  compose subject left stopped; mode stays 'k8s'." -ForegroundColor Green
        Write-Host "  To go back to compose mode:  obs k8s delete   (or: obs k8s down)"
        Write-Host "  To run BOTH subjects anyway: obs up --force   (double-counts gateway metrics)"
        return
    }

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

function Invoke-Drill {
    <# `obs fail <id>` - the operator-facing drill built on the scenario pack.
       Baseline load, inject, dwell, revert, with the fault's own timings taken
       from its scenario.json.

       The dwell timer lives HERE and nowhere else. The pack itself reverts only
       on command, because a timed auto-revert races a remediating agent and
       makes remediation tests non-deterministic - the defect the 2026-07-23
       crashloop test found. A human watching a drill wants the lab to clean
       itself up afterwards; an exam must not have that happen behind its back.
       Same scenario, same revert path, one difference in who decides when. #>
    param(
        [Parameter(Mandatory)][string]$Id,
        [string]$Qps = '',
        [switch]$Hold,
        [switch]$SkipLoad
    )
    $s = Get-Scenario $Id
    # Not $qps: PowerShell variable names are case-insensitive, so that would
    # quietly reassign the $Qps parameter mid-function.
    $rate = if ($Qps) { $Qps } else { "$($s.load.qps)" }
    $dwell = [int]$s.drill_dwell_s
    # `drill_hold` marks a scenario whose remediation IS the exercise
    # (15-stale-secret): reverting it on a clock would take the fix away from
    # whoever - or whatever - is meant to be performing it.
    $hold = $Hold -or $s.drill_hold

    if (-not $SkipLoad) {
        # 60s of healthy baseline first (so "before" is visible on every
        # dashboard), then the fault, then a cooldown long enough for the SLIs
        # to recover and the alerts to resolve.
        $duration = 60 + $dwell + 180
        Write-Step "$Id : ${duration}s of baseline load @ $rate qps in its own window"
        $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$rate'; `$env:DURATION_SECONDS='$duration'; bun run start"
        Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd
        Start-Sleep -Seconds 60
    }

    Write-Step "$Id : $($s.title)"
    if ((Invoke-ScenarioStep $Id 'inject') -ne 0) {
        Write-Warning "inject failed - reverting"
        Invoke-ScenarioStep $Id 'revert' | Out-Null
        return $false
    }

    Write-Step "watch: Grafana $GrafanaUrl | incidents $WebUrl/incidents"
    Write-Host "  revert at any time:  obs chaos revert $Id"
    if ($hold) {
        Write-Host ''
        Write-Step "$Id is HELD live - this drill has no timed revert"
        Write-Host "  its remediation is the exercise; clean up with: obs chaos revert $Id"
        return $true
    }

    Write-Step "fault is live for ${dwell}s, then auto-revert"
    Start-Sleep -Seconds $dwell

    Write-Step "$Id : reverting"
    if ((Invoke-ScenarioStep $Id 'revert') -ne 0) {
        Write-Warning "revert FAILED - the lab may still be broken. Retry: obs chaos revert $Id"
        return $false
    }
    Write-Step "$Id : reverted. Check the incident inbox for the postmortem ($WebUrl/incidents)."
    return $true
}

# The one composite drill, kept out of the pack on purpose: it is a TIMELINE of
# three scenarios rather than a fault of its own, and the pack's unit is a fault
# with one inject, one signal and one revert.
$FullDrill = @('01-latency', '02-error-storm', 'outage')

# The names `obs fail` answered to before the pack existed. They are kept as
# aliases rather than retired: they are in the demo scripts, in the docs and in
# muscle memory, and a rename is a poor reason to break any of those. The pack's
# ids are the real names - matrix-numbered, so the omissions are self-evident.
$LegacyFailNames = [ordered]@{
    latency             = '01-latency'
    errors              = '02-error-storm'
    oomkill             = '04-oomkill'
    imagepull           = '05-phantom-tag'
    crashloop           = '03-crashloop'
    'readiness-break'   = '06-probe-regression'
    'canary-bad-image'  = '12-bad-canary'
    'config-drift'      = '13-config-drift'
    'stale-secret'      = '15-stale-secret'
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
            # A composition over the scenario pack, not a second implementation.
            # Everything that defines a fault - how to inject it, what proves it
            # is live, how to undo it - lives in scripts/scenarios/<id>/. What
            # stays here is the drill-shaped part: baseline traffic, a dwell, and
            # a revert on a clock, for a human who wants to watch the whole arc
            # and have the lab tidy itself up afterwards.
            $flags = @('--hold', '-hold')
            $hold = @($Rest | Where-Object { $flags -contains "$_".ToLower() }).Count -gt 0
            $positional = @($Rest | Where-Object { $flags -notcontains "$_".ToLower() })
            $name = if ($positional.Count -ge 1) { "$($positional[0])" } else { '' }
            $qps = if ($positional.Count -ge 2) { "$($positional[1])" } else { '' }

            # Pre-pack names still work - see $LegacyFailNames.
            $key = $name.ToLower()
            $id = if ($LegacyFailNames.Contains($key)) { $LegacyFailNames[$key] } else { $name }

            if ($key -eq 'full') {
                # The composite: one load window, three faults back to back. It
                # is a timeline rather than a fault, which is why it is the one
                # drill with no scenario directory of its own.
                $q = if ($qps) { $qps } else { '40' }
                $dur = 60 + 180
                foreach ($step in $FullDrill) { $dur += [int](Get-Scenario $step).drill_dwell_s + 30 }
                Write-Step "full: ${dur}s of baseline load @ $q qps; $($FullDrill -join ' -> ')"
                $loadCmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$q'; `$env:DURATION_SECONDS='$dur'; bun run start"
                Start-Process powershell -WorkingDirectory (Join-Path $Repo 'apps\load-generator') -ArgumentList '-NoExit', '-Command', $loadCmd
                Start-Sleep -Seconds 60
                foreach ($step in $FullDrill) {
                    Invoke-Drill -Id $step -Qps $q -SkipLoad | Out-Null
                    # A gap between faults so each one's alert resolves before
                    # the next fires - overlapping incidents are a different
                    # (and much harder) exercise than this drill intends.
                    Start-Sleep -Seconds 30
                }
                Write-Step 'full drill complete - three faults injected and reverted'
                break
            }

            if (-not $id) {
                Write-Host "usage: obs fail <scenario-id> [baseline-qps] [--hold]"
                Write-Host ""
                Show-ScenarioTable
                Write-Host "Each drill drives baseline traffic, injects one fault, holds it for the"
                Write-Host "scenario's own dwell, then reverts. --hold skips the timed revert (use it when"
                Write-Host "an agent is meant to do the fixing); 'obs chaos revert <id>' cleans up."
                Write-Host "Also: obs fail full   (latency -> error storm -> outage, in one window)"
                Write-Host ""
                Write-Host "Watch Grafana (:$($Ports.OBS_GRAFANA_PORT)) and the incident inbox (:$($Ports.OBS_WEB_PORT)/incidents);"
                Write-Host "the agent-service (:$($Ports.OBS_AGENTS_PORT)) must be up to get postmortems."
                break
            }

            try { Get-Scenario $id | Out-Null }
            catch {
                Write-Warning "unknown scenario '$name'"
                Write-Host ''
                Show-ScenarioTable
                break
            }
            Invoke-Drill -Id $id -Qps $qps -Hold:$hold | Out-Null
        }

        'chaos' {
            $action = if ($Rest.Count -ge 1) { $Rest[0].ToLower() } else { 'status' }

            # P12: the scenario-pack verbs. inject/verify/revert are separate on
            # purpose - a revert on a timer races a remediating agent, which is
            # what made the 2026-07-23 crashloop test non-deterministic.
            if ($action -in 'list', 'inject', 'verify', 'revert', 'selftest') {
                if ($action -eq 'list') {
                    $group = if ($Rest.Count -ge 2) { $Rest[1] } else { '' }
                    Show-ScenarioTable -Group $group
                    break
                }
                if ($Rest.Count -lt 2) {
                    Write-Warning "usage: obs chaos $action <scenario-id>"
                    Write-Host ''
                    Show-ScenarioTable
                    break
                }
                $id = $Rest[1]
                try { Get-Scenario $id | Out-Null }
                catch { Write-Warning $_.Exception.Message; Write-Host ''; Show-ScenarioTable; break }

                if ($action -eq 'selftest') {
                    if (Test-Scenario $id) { break }
                    Write-Warning "selftest FAILED for $id"
                    break
                }
                $code = Invoke-ScenarioStep $id $action
                if ($code -ne 0) { Write-Warning "$action '$id' exited $code" }
                break
            }

            # Status and clear, per INSTANCE. Both go through the pack's helpers
            # rather than hitting the service address once, because the override
            # is per-process state: model-proxy runs four replicas, so a single
            # request through the ingress reads (or clears) exactly one of them
            # and reports for all four. A status view that can say "healthy"
            # while three quarters of the traffic is faulty is worse than none.
            . (Join-Path $PSScriptRoot 'scenarios\_lib\chaos-plane.ps1')
            foreach ($name in $ChaosBase.Keys) {
                if ($action -eq 'clear') {
                    Clear-ChaosKnobs -Service $name | Out-Null
                    Assert-ChaosCleared -Service $name | Out-Null
                    continue
                }
                $snaps = @(Get-ChaosSnapshots -Service $name)
                if ($snaps.Count -eq 0) {
                    Write-Warning "$name unreachable (mode=$Mode) - is the lab up?"
                    continue
                }
                foreach ($snap in $snaps) {
                    $knobs = @($snap.Override.PSObject.Properties | Where-Object { $_.Value -ne 0 -and $_.Value -ne $false })
                    $where = if ($snap.Target -eq 'compose') { $name } else { "$name/$($snap.Target)" }
                    if ($knobs.Count -eq 0) {
                        Write-Host ("  {0,-34} healthy (no chaos active)" -f $where)
                    } else {
                        $desc = ($knobs | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' '
                        Write-Host ("  {0,-34} CHAOS ACTIVE: {1}" -f $where, $desc)
                    }
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
                    # The kube API now binds the tailnet address only, but Ubuntu
                    # maps the hostname to 127.0.1.1 in /etc/hosts - so VM-LOCAL
                    # kubectl/helm (which this script runs over ssh for the
                    # monitoring and argo installs) would dial 127.0.1.1:6550 and
                    # get connection refused. Point the name at the tailnet IP
                    # instead. It must stay a NAME, not an IP: k3d's API cert
                    # carries DNS:obs-vm but no SAN for the tailscale address, so
                    # connecting by IP fails TLS verification. Idempotent.
                    ssh -o BatchMode=yes "root@$vm" 'TS=$(tailscale ip -4 2>/dev/null); if [ -n "$TS" ]; then sed -i "s/[[:space:]]*\bobs-vm\b//g" /etc/hosts; grep -q "^$TS[[:space:]]obs-vm$" /etc/hosts || echo "$TS obs-vm" >> /etc/hosts; fi'
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
                        # NOT Get-Date -UFormat %s: on Windows PowerShell 5.1 that
                        # returns a LOCAL-time epoch, so it reads high by exactly the
                        # UTC offset (7200s on CEST) and reported a two-hour drift on
                        # a perfectly synced clock - sending you to 'wsl --shutdown'
                        # for nothing. WSL's date +%s is a true UTC epoch; compare
                        # against one.
                        $hostEpoch = [int64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
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

            # The check that was missing for 67 days. Everything above asks
            # whether a port is FREE; none of it ever asked which interface the
            # VM answers on. Gitea, its ssh port and ci-shim sat on 0.0.0.0
            # facing the public internet while the report said otherwise,
            # because the k3d fix only moved the ports k3d owns.
            #
            # This does NOT probe from outside - that needs an off-tailnet
            # vantage point and is a manual step (infra/vm/README.md). It
            # checks the precondition instead, which is what actually
            # regressed: a wildcard bind is observable from in here, and no
            # port can be publicly reachable without one. Cheap, no third
            # party, and it fails the moment a compose file forgets
            # ${OBS_BIND_IP} again.
            $vm = $Ports.OBS_VM_HOST
            Write-Step "VM exposure ($vm) - bind addresses, lockdown unit, DOCKER-USER"
            $probe = @'
echo "LISTENERS"; ss -tlnH 2>/dev/null | awk '{print $4}'
echo "LOCKDOWN"; systemctl is-active obs-lockdown.service 2>/dev/null
echo "LOCKENABLED"; systemctl is-enabled obs-lockdown.service 2>/dev/null
echo "DOCKERUSER4"; iptables -S DOCKER-USER 2>/dev/null | grep -c -- '-j DROP'
echo "DOCKERUSER6"; ip6tables -S DOCKER-USER 2>/dev/null | grep -c -- '-j DROP'
'@
            $raw = ssh -o BatchMode=yes -o ConnectTimeout=8 "root@$vm" $probe 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $raw) {
                Write-Host "  --  $vm unreachable over the tailnet - skipped (fine on a laptop-only lab)"
            } else {
                $section = ''; $listeners = @(); $lockdown = ''; $lockEnabled = ''; $du4 = 0; $du6 = 0
                foreach ($line in $raw) {
                    switch -Regex ($line) {
                        '^(LISTENERS|LOCKDOWN|LOCKENABLED|DOCKERUSER4|DOCKERUSER6)$' { $section = $line; continue }
                        default {
                            switch ($section) {
                                'LISTENERS'   { if ($line.Trim()) { $listeners += $line.Trim() } }
                                'LOCKDOWN'    { if ($line.Trim()) { $lockdown = $line.Trim() } }
                                'LOCKENABLED' { if ($line.Trim()) { $lockEnabled = $line.Trim() } }
                                'DOCKERUSER4' { if ($line.Trim()) { $du4 = [int]$line.Trim() } }
                                'DOCKERUSER6' { if ($line.Trim()) { $du6 = [int]$line.Trim() } }
                            }
                        }
                    }
                }
                # Port 22 is sshd's and is EXPECTED wide: ssh arrives via INPUT,
                # which DOCKER-USER never sees, and pinning sshd to the
                # tailscale address races tailscale0 having an address at boot.
                # It is keys-only (infra/vm/cloud-init.yaml) and the Hetzner
                # firewall is its control.
                $wide = @($listeners | Where-Object { $_ -match '^(0\.0\.0\.0|\[::\]):(\d+)$' -and $Matches[2] -ne '22' })
                if ($wide.Count -eq 0) {
                    Write-Host '  ok  no lab port bound to 0.0.0.0 or [::] (22 = sshd, expected)'
                } else {
                    $ok = $false
                    foreach ($w in $wide) {
                        Write-Warning "$w on $vm is bound to ALL interfaces - published without `${OBS_BIND_IP}. Fix the compose/k3d file that publishes it, then recreate the container ('obs ci up' / 'obs k8s up') - editing config alone does not rebind a running one."
                    }
                }
                # The DROP rules are the control; the unit is only the mechanism
                # that installs them. So they get different verdicts: missing
                # rules means exposed NOW (fail), while a unit that is enabled
                # but not active means the rules came from somewhere other than
                # this boot's unit run - still protected, but nothing re-applies
                # them if docker restarts and flushes the chain (warn).
                if ($du4 -ge 1 -and $du6 -ge 1) {
                    Write-Host "  ok  DOCKER-USER drops public-NIC ingress (v4 + v6)"
                } else {
                    $ok = $false
                    Write-Warning "DOCKER-USER has no DROP rule on $vm (v4: $du4, v6: $du6) - container ports are NOT filtered. Docker publishes through FORWARD, which ufw never sees. Run: ssh root@$vm systemctl restart obs-lockdown.service"
                }
                if ($lockEnabled -ne 'enabled') {
                    $ok = $false
                    Write-Warning "obs-lockdown.service is '$lockEnabled' on $vm - it will NOT re-apply after a reboot. Run: ssh root@$vm systemctl enable --now obs-lockdown.service"
                } elseif ($lockdown -ne 'active') {
                    Write-Warning "obs-lockdown.service is enabled but '$lockdown' on $vm - the rules above were applied out-of-band, so nothing will restore them if docker flushes DOCKER-USER before the next reboot. Run: ssh root@$vm systemctl start obs-lockdown.service"
                } else {
                    Write-Host '  ok  obs-lockdown.service enabled + active'
                }
                Write-Host '  --  reachability from OUTSIDE is a manual step - see infra/vm/README.md'
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
