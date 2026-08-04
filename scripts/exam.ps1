<#
  The chaos exam runner (PLAN-2 P12).

  Injects a known fault, lets the on-call agent investigate with no knowledge
  of the injection, and grades its report against a hidden key. Strictly
  sequential: one scenario at a time, one incident at a time, because two live
  faults would let the agent correlate them and would make time-to-alert
  meaningless.

      obs exam <group>              inference | resources | delivery | cicd | config
      obs exam <id>                 one question (ids are always NN-name)
      obs exam --all [--from <id>]  every group, resumable after an interruption
      obs exam list                 the plan, without running anything

  Per scenario:

    preflight -> smoke gate -> load -> inject -> verify -> wait for the REAL
    alert -> poll the oncall run -> revert -> verify reverted -> smoke ->
    judge -> record

  The alert path is never faked. Grafana fires, the webhook arrives HMAC'd, an
  incident opens and the on-call agent spawns itself; the runner only watches.
  A synthetic webhook would test the agent and nothing else, and "no alert
  fired" is one of the findings this exam exists to produce.

  Four statuses, so a broken harness never grades as a stupid agent:
    graded    the agent ran and the judge returned a verdict
    not_run   the Claude session died - the agent never saw the question
    no_alert  nothing fired inside 2x the expected window (an OBSERVABILITY
              finding, not an agent failure)
    error     inject/verify/revert/judge failed - the scenario is unusable

  Two policies worth knowing before reading a scorecard:

  * APPROVALS ARE DENIED. The on-call agent's remediation tools are approval-
    gated and nobody is watching at 3am, so a parked approval would hang the
    run forever. The runner denies it and lets the agent carry on to its
    postmortem. The exam grades the diagnosis and the PROPOSED remediation -
    executing it would also mean the agent's fix racing the pack's revert,
    which is the exact non-determinism ADR-006 was written to remove.

  * REVERT IS THE PACK'S JOB, ALWAYS. Even when a scenario ends in `error`,
    revert runs. A fault left live would poison every scenario after it.
#>

[CmdletBinding()]
param(
    [string]$Target = '',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)

# NOT $ErrorActionPreference = 'Stop'. PS 5.1 turns any native command's
# stderr into an ErrorRecord, and 'Stop' escalates that into a terminating
# error - so `15-stale-secret`'s verify, whose whole job is to watch `psql`
# FAIL to authenticate, killed the first exam run from inside its own success
# path. The pack's scripts signal with exit codes; this script reads those.
. (Join-Path $PSScriptRoot 'scenarios\_lib\pack.ps1')

# How long to let one investigation run before grading what it has. The oncall
# agent is capped at 40 turns; this is the wall-clock backstop for a session
# that stalls rather than stops.
$OncallCapSec = 900
# Cooldown after a revert: alerts resolve on their own schedule, and injecting
# the next fault while the previous incident is still firing would attach the
# next alert to the open incident instead of opening a new one.
$CooldownSec = 90

# ---- small HTTP + SQL plumbing ----------------------------------------------

function Invoke-Agents {
    <# One JSON call to agent-service, UTF-8 in BOTH directions.

       Bodies go as UTF-8 BYTES: PS 5.1's Invoke-RestMethod otherwise ships the
       default codepage, and every report this runner forwards is full of
       arrows and em-dashes that would reach the judge as mojibake.

       Responses are decoded from the RAW BYTES for the same reason, and this
       one is subtler: Invoke-RestMethod honours the charset in Content-Type
       and falls back to ISO-8859-1 when there is none - which is what HTTP/1.1
       says to do and what FastAPI sends (`application/json`, no charset). So
       every em-dash in an agent's narration came back as "a" + garbage, and
       the runner then wrote that mojibake into exam_results AND forwarded it
       to the judge as the report it was grading. #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$Method = 'GET',
        $Body = $null,
        [int]$TimeoutSec = 60
    )
    $headers = @{}
    $token = Get-ObsToken
    if ($token) { $headers['X-Obs-Token'] = $token }
    # Not $args: that is an automatic variable, and shadowing it inside a
    # simple function is a trap for whoever edits this next.
    $req = @{
        Uri = "$AgentsUrl$Path"; Method = $Method; Headers = $headers
        TimeoutSec = $TimeoutSec; UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 8 -Compress
        $req['Body'] = [Text.Encoding]::UTF8.GetBytes($json)
        $req['ContentType'] = 'application/json; charset=utf-8'
    }
    # Invoke-WebRequest, not -RestMethod, purely to reach RawContentStream:
    # -RestMethod hands back an already-decoded object and the damage is done
    # by then. Both throw on a non-2xx, which is what the callers catch.
    $resp = Invoke-WebRequest @req
    $text = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    if (-not $text.Trim()) { return $null }   # e.g. a 204 from /finish
    return $text | ConvertFrom-Json
}

function Invoke-Psql {
    <# One scalar/row read off the CONTROL-PLANE Postgres - the compose one on
       this laptop that holds agent_runs/incidents/exam_*, not the subject
       database in the cluster. agent-service exposes no /incidents route, and
       the audit tables are where the objective statistics live. #>
    param([Parameter(Mandatory)][string]$Sql)
    $out = docker compose --env-file infra/ports.env -f infra/compose.yml `
        exec -T postgres psql -U lab -d observability_lab -tAc $Sql 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return ("$out").Trim()
}

function ConvertTo-IntOrNull($value) {
    if ($null -eq $value) { return $null }
    $text = "$value".Trim()
    if (-not $text) { return $null }
    $parsed = 0
    if ([int]::TryParse($text, [ref]$parsed)) { return $parsed }
    return $null
}

function Get-UtcFrom($iso) {
    if (-not $iso) { return $null }
    return [datetime]::Parse($iso, $null, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}

# ---- keep-awake --------------------------------------------------------------

$script:KeepAwakeReady = $false

function Set-KeepAwake {
    <# A 45-minute group cannot have the display sleeping mid-scenario: the
       load generator, the agent session and the alert path all live on this
       laptop. ES_CONTINUOUS holds until Clear-KeepAwake or the process exits. #>
    if (-not $script:KeepAwakeReady) {
        Add-Type -Namespace Obs -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
        $script:KeepAwakeReady = $true
    }
    # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED.
    # Written as [uint32] decimals, NOT 0x80000000: PS 5.1 parses a hex literal
    # with the sign bit set as a NEGATIVE Int32, and the marshaller then
    # refuses it ("Cannot convert -2147483645 to System.UInt32").
    [Obs.Power]::SetThreadExecutionState([uint32](2147483648 -bor 1 -bor 2)) | Out-Null
}

function Clear-KeepAwake {
    if ($script:KeepAwakeReady) { [Obs.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null }
}

# ---- gates -------------------------------------------------------------------

function Test-ClockSkew {
    <# WSL2's clock drifts after the laptop sleeps and Mimir then rejects the
       out-of-order samples the cluster ships it - which would look exactly
       like "no alert fired". Same check as `obs k8s status`, run once at the
       top of an exam rather than per scenario: keep-awake means it cannot
       change mid-run. #>
    try {
        $wslEpoch = [int64](wsl -e date +%s 2>$null)
        $hostEpoch = [int64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $drift = [Math]::Abs($hostEpoch - $wslEpoch)
        if ($drift -gt 30) {
            Write-Warning "WSL2 clock is ${drift}s off the host - Mimir will reject samples and no alert will fire. Fix: wsl --shutdown (then restart Docker Desktop), and re-run."
            return $false
        }
        Write-Host "  ok  WSL2 clock drift ${drift}s"
    } catch { }
    return $true
}

function Test-Preflight {
    <# Cheap, per scenario: is agent-service answering at all.

       It deliberately does NOT probe the Claude session. The only honest probe
       is a real model round-trip (echo never touches Claude, and reading the
       CLI's credential store is not this script's business), which would cost
       a session per scenario. An expired token is caught REACTIVELY instead -
       Test-AuthFailure below reads it off the run that failed, and the runner
       then halts and marks the remainder not_run, which is the behaviour the
       preflight was for. #>
    if (Test-Up "$AgentsUrl/health") { return $true }
    Write-Warning "agent-service is not answering at $AgentsUrl - start it with: obs agents"
    return $false
}

function Test-AgentCredentials {
    <# Can the AGENT still reach the cluster? Not the operator - the operator's
       kubeconfig is what inject/verify/revert use, and it working tells you
       nothing about the two scoped ones the agent gets.

       This exists because it did not. `obs k8s agent-kubeconfig` mints a 168h
       ServiceAccount token; on 2026-08-01 it quietly expired, and the exam
       went on cheerfully grading an agent whose kubectl_read, kube_scan,
       rollout_state, secret_age and every remediation returned "You must be
       logged in to the server (Unauthorized)". Three of six pre-checks were
       dead for three days and nothing said so, because the only thing that
       reads these files is an agent whose failures look like bad answers.

       A warning, not a gate: a scenario that needs no cluster read (the CI
       ones) is still worth running with a lapsed token, and an exam that
       refuses to start is worse than one that tells you what is degraded. #>
    $ok = $true
    foreach ($pair in @(
        @{ name = 'agent-ro'; path = 'apps\agent-service\.kube\agent-ro.yaml'; probe = @('get', 'pods', '-n', 'subject') },
        @{ name = 'agent-remediate'; path = 'apps\agent-service\.kube\agent-remediate.yaml'; probe = @('get', 'deploy', '-n', 'subject') }
    )) {
        $file = Join-Path $Repo $pair.path
        if (-not (Test-Path $file)) {
            Write-Warning "$($pair.name) kubeconfig missing - the agent has no cluster access. Mint it: obs k8s $(if ($pair.name -eq 'agent-ro') { 'agent-kubeconfig' } else { 'agent-remediate-kubeconfig' })"
            $ok = $false
            continue
        }
        & kubectl --kubeconfig $file @($pair.probe) --request-timeout=10s 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "$($pair.name) kubeconfig cannot reach the cluster (expired token? re-minted cluster?). Re-mint: obs k8s $(if ($pair.name -eq 'agent-ro') { 'agent-kubeconfig' } else { 'agent-remediate-kubeconfig' })"
            $ok = $false
            continue
        }
        Write-Host "  ok  $($pair.name) kubeconfig reaches the cluster"
    }
    if (-not $ok) {
        Write-Warning 'the agent will investigate with degraded cluster tools - grades from this run are not comparable with ones taken against a healthy lab'
    }
    return $ok
}

function Test-AuthFailure {
    <# Does this run's failure look like a dead Claude session rather than a
       bad answer? Those two must never be graded the same way. #>
    param([string]$Text)
    if (-not $Text) { return $false }
    return ($Text -match '(?i)\b(401|unauthorized|authentication_error|oauth|invalid[- ]api[- ]key|credential)\b')
}

function Wait-IncidentsQuiet {
    <# Give the previous question's incident time to close, then report what is
       still open.

       agent-service opens ONE incident per alert_key and ATTACHES re-firings to
       it (app.py's ingress_decision), so a scenario whose alert is already open
       gets no investigation at all. That makes an open inbox worth waiting for
       - but not worth blocking on: the slow-burn SLO alerts run on 6-hour
       windows and stay open long after the fault that started them is gone, and
       a gate that demanded a spotless inbox would refuse to run an exam for the
       rest of the day. So: wait, warn, list, continue. The absorbed-alert case
       is then caught precisely after the fact, where it can be told apart from
       a genuinely missing alert. #>
    param([int]$TimeoutSec = 240)
    $open = ConvertTo-IntOrNull (Invoke-Psql "select count(*) from incidents where status = 'open'")
    if ($open -eq 0) { return }
    Write-Step "waiting up to ${TimeoutSec}s for $open open incident(s) to close"
    $quiet = Wait-Until -TimeoutSec $TimeoutSec -IntervalSec 15 -Condition {
        (ConvertTo-IntOrNull (Invoke-Psql "select count(*) from incidents where status = 'open'")) -eq 0
    }
    if ($quiet) { Write-Step 'incident inbox is quiet'; return }
    Write-Warning 'still-open incidents will ABSORB a matching alert instead of spawning an investigation:'
    Invoke-Psql "select '      ' || id || '  ' || title from incidents where status = 'open'" |
        ForEach-Object { Write-Host $_ }
}

function Test-AlertWasAbsorbed {
    <# Did an alert fire in this window and attach to an already-open incident?

       That is the difference between "this lab did not notice the fault" (a
       real observability finding, `no_alert`) and "the inbox ate the question"
       (a harness/lab-state problem, `error`). Recording the second as the first
       would put a false finding on the scorecard, which is worse than recording
       nothing. #>
    param([Parameter(Mandatory)][datetime]$SinceUtc)
    $stamp = $SinceUtc.ToString('yyyy-MM-dd HH:mm:ss')
    return (Invoke-Psql @"
select ia.incident_id || ' (' || ia.alertname || ')'
from incident_alerts ia join incidents i on i.id = ia.incident_id
where ia.ts >= timestamptz '$stamp+00' and ia.status = 'firing'
  and i.opened_at < timestamptz '$stamp+00'
limit 1
"@)
}

function Invoke-SmokeGate {
    <# `obs smoke` end to end. A lab that was already broken cannot ask a fair
       question, so this gates the inject.

       Retried, because the exam's OWN traffic can fail it: smoke posts one
       chat as the dev tenant, and the load generator that just ran at 40 qps
       drains that tenant's token bucket - one 429 arrived seconds after a
       perfectly good investigation and threw the whole result away. A rate
       limit is not a broken lab; a rate limit that persists for two minutes
       might be. #>
    param([string]$Phase, [int]$Attempts = 3, [int]$DelaySec = 45)
    $env:GATEWAY = $GatewayUrl
    $env:SMOKE_MODE = $Mode
    $gitBash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
    for ($i = 1; $i -le $Attempts; $i++) {
        Write-Step "smoke gate ($Phase, attempt $i/$Attempts)"
        if (Test-Path $gitBash) { & $gitBash scripts/smoke.sh | Out-Null }
        else { bash scripts/smoke.sh | Out-Null }
        if ($LASTEXITCODE -eq 0) { return $true }
        if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySec }
    }
    Write-Warning "smoke FAILED ($Phase) after $Attempts attempts"
    return $false
}

# ---- load --------------------------------------------------------------------

function Start-ExamLoad {
    <# Baseline traffic in its own window, sized to outlast this scenario.
       Returned so it can be killed: an overrunning window would keep driving
       the next scenario's baseline at double rate and blur its onset. #>
    param([Parameter(Mandatory)]$Scenario, [int]$Seconds)
    $qps = "$($Scenario.load.qps)"
    Write-Step "load: $qps qps for ${Seconds}s (own window)"
    $cmd = "`$env:GATEWAY_URL='$GatewayUrl'; `$env:TARGET_QPS='$qps'; `$env:DURATION_SECONDS='$Seconds'; bun run start"
    return Start-Process powershell -PassThru -WorkingDirectory (Join-Path $Repo 'apps\load-generator') `
        -ArgumentList '-NoExit', '-Command', $cmd
}

function Stop-ExamLoad {
    param($Proc)
    if ($null -eq $Proc) { return }
    # /T: the window is a powershell host with bun underneath it, and killing
    # only the parent leaves the load generator running headless.
    taskkill /PID $Proc.Id /T /F 2>&1 | Out-Null
}

# ---- the alert path ----------------------------------------------------------

function Wait-ScenarioRun {
    <# The real chain, watched rather than faked: Grafana fires -> HMAC webhook
       -> incident -> the agent spawns itself. Returns @{ Id; WaitedS }, or
       $null when the deadline passes - a `no_alert` result, not a failure.

       It matches THIS scenario's alert, not merely the next investigation to
       appear. The lab has chronic alerts of its own (RAG quality drifts below
       its objective for hours at a time), and the first version of this
       function handed one of those to the judge to be graded against the
       stale-secret key. The scenario declares what it expects to page - the
       `alert.match` patterns in scenario.json, tested against agent_runs.title,
       which holds the alert SUMMARY for a Grafana alert and "<event>: <target>"
       for an Argo notification. Both engines are queried at once because a
       delivery scenario's investigator is the gitops-reporter, not oncall. #>
    param([Parameter(Mandatory)]$Scenario, [Parameter(Mandatory)][datetime]$SinceUtc, [int]$DeadlineSec)

    $patterns = @($Scenario.alert.match)
    if ($patterns.Count -eq 0) { throw "$($Scenario.id): scenario.json has no alert.match patterns" }
    $clauses = ($patterns | ForEach-Object { "title ilike '$($_.Replace("'", "''"))'" }) -join ' or '
    $stamp = $SinceUtc.ToString('yyyy-MM-dd HH:mm:ss')
    $sql = @"
select id from agent_runs
where agent in ('oncall', 'gitops-reporter')
  and created_at >= timestamptz '$stamp+00'
  and ($clauses)
order by created_at asc limit 1
"@

    Write-Step "waiting up to ${DeadlineSec}s for this scenario's alert -> incident -> investigation"
    Write-Host "        matching: $($patterns -join ' | ')"
    $script:FoundRun = ''
    $found = Wait-Until -TimeoutSec $DeadlineSec -IntervalSec 10 -Condition {
        $script:FoundRun = Invoke-Psql $sql
        return [bool]$script:FoundRun
    }
    if (-not $found) { return $null }

    $runId = $script:FoundRun
    # The delta is computed in SQL, not by parsing a formatted timestamp back
    # in PowerShell: `to_char(...'YYYY-MM-DD"T"...')` needs double quotes INSIDE
    # a string that is already double-quoted on its way through PS and docker,
    # and what reached psql was not a format string at all. Postgres also
    # subtracts timestamptz correctly across the WSL/host clock boundary, which
    # is the thing the earlier clamp was papering over.
    $waited = ConvertTo-IntOrNull (Invoke-Psql "select greatest(0, extract(epoch from (created_at - timestamptz '$stamp+00'))::int) from agent_runs where id = '$runId'")
    if ($null -eq $waited) { $waited = 0 }
    Write-Step "alert landed after ${waited}s: run $runId"
    return @{ Id = $runId; WaitedS = $waited }
}

function Wait-RunSettled {
    <# Poll one agent run until it stops moving.

       `awaiting_approval` counts as settled: every remediation tool is
       approval-gated, nobody is watching, and a parked run would burn the cap
       doing nothing. The runner denies the approval so the agent can finish
       its narrative and file a postmortem - the exam grades what it proposed,
       not what it executed. #>
    param([Parameter(Mandatory)][string]$RunId, [int]$CapSec)
    $deadline = (Get-Date).AddSeconds($CapSec)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 15
        try { $run = Invoke-Agents -Path "/runs/$RunId" } catch { continue }
        # ONLY a terminal status ends the wait. An earlier version also returned
        # once it had denied everything pending, and that raced the agent: the
        # run still reads `awaiting_approval` for a few seconds after the deny
        # lands, so the runner grabbed a half-finished investigation - no
        # postmortem, a truncated report, and a `time_to_diagnosis` of zero -
        # and graded the agent on it. Denying un-parks the run; if it parks
        # again with a new approval, the next poll denies that one too.
        if ($run.status -in 'completed', 'failed', 'denied') { return $run }
        if ($run.status -eq 'awaiting_approval') {
            foreach ($a in @($run.approvals | Where-Object { -not $_.decision })) {
                Write-Step "denying approval $($a.id) (the exam authorises no mutations)"
                try {
                    Invoke-Agents -Path "/runs/$RunId/approve" -Method 'POST' `
                        -Body @{ approvalId = $a.id; decision = 'denied' } | Out-Null
                } catch { Write-Warning "could not deny $($a.id): $($_.Exception.Message)" }
            }
        }
    }
    Write-Warning "oncall run $RunId did not settle within ${CapSec}s - grading what it has"
    try { return Invoke-Agents -Path "/runs/$RunId" } catch { return $null }
}

function Get-RunEvidence {
    <# What the judge is given, plus the objective statistics the judge must
       never see: it grades reasoning, and a run that took 40 turns is not
       thereby wrong.

       The REPORT is the postmortem when one is on the incident, and the
       agent's narration otherwise - which is the usual case: publish_postmortem
       commits the document to Gitea and records only its URL
       (postmortem.py's set_postmortem_pr), so `incidents.postmortem_md` stays
       null for on-call runs. The narration IS the investigation's reasoning,
       which is what the key grades.
       The TRANSCRIPT is the whole thing, tool calls included, truncated: the
       judge needs to see HOW the answer was reached, and a 200k-char paste
       would cost more than the investigation did. #>
    param([Parameter(Mandatory)]$Run)
    $assistant = @($Run.messages | Where-Object { $_.role -eq 'assistant' })
    $narration = ($assistant | ForEach-Object { $_.content }) -join "`n`n"

    # Two shapes: an alert-driven oncall run is LINKED through incident_runs,
    # while a gitops-reporter run records its incident with a run_id column
    # (app.py's /webhook/gitops path never creates a link row). Try both, or a
    # delivery scenario's report would arrive with no incident attached.
    $incidentId = Invoke-Psql "select incident_id from incident_runs where run_id = '$($Run.id)' order by created_at desc limit 1"
    if (-not $incidentId) {
        $incidentId = Invoke-Psql "select id from incidents where run_id = '$($Run.id)' order by opened_at desc limit 1"
    }
    $report = ''
    if ($incidentId) {
        $report = Invoke-Psql "select coalesce(postmortem_md, '') from incidents where id = '$incidentId'"
    }
    if (-not $report) { $report = $narration }

    $lines = @()
    foreach ($m in $Run.messages) { $lines += "[$($m.role)] $($m.content)" }
    foreach ($t in $Run.toolCalls) { $lines += "[tool] $($t.name) $($t.status)" }
    $transcript = ($lines -join "`n")
    if ($transcript.Length -gt 60000) { $transcript = $transcript.Substring(0, 60000) + "`n... (truncated)" }

    $seconds = ConvertTo-IntOrNull (Invoke-Psql "select coalesce(extract(epoch from (ended_at - created_at)), 0)::int from agent_runs where id = '$($Run.id)'")

    return @{
        Report      = $report
        Transcript  = $transcript
        IncidentId  = $incidentId
        Turns       = $assistant.Count
        ToolCalls   = @($Run.toolCalls).Count
        DiagnosisS  = $seconds
        Failure     = "$($Run.status)"
    }
}

# ---- persistence -------------------------------------------------------------

function New-ExamRun {
    param([Parameter(Mandatory)][string]$Group)
    $sha = (git rev-parse --short HEAD 2>$null)
    if (-not $sha) { $sha = '' }
    $created = Invoke-Agents -Path '/exam/runs' -Method 'POST' -Body @{ group = $Group; gitSha = "$sha".Trim() }
    return $created.id
}

function Write-ExamResult {
    param([Parameter(Mandatory)][hashtable]$Result)
    try { Invoke-Agents -Path '/exam/results' -Method 'POST' -Body $Result | Out-Null }
    catch { Write-Warning "could not record the result row: $($_.Exception.Message)" }
}

# ---- the per-scenario state machine -----------------------------------------

function Invoke-ExamScenario {
    <# One question, start to finish. Returns the status it recorded, so the
       caller can halt the whole run on `not_run`. #>
    param([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$ExamRunId)

    $s = Get-Scenario $Id
    $expected = [int]$s.expected_time_to_alert_s
    $alertDeadline = 2 * $expected   # ADR-006: no timeout is guessed
    $row = @{ examRunId = $ExamRunId; scenarioId = $Id; status = 'error' }

    Write-Host ''
    Write-Host ('=' * 78)
    Write-Step "$Id : $($s.title)"
    Write-Host "        group=$($s.group)  expect an alert within ${expected}s (deadline ${alertDeadline}s)"
    Write-Host ('=' * 78)

    if (-not (Test-Preflight)) {
        $row.status = 'not_run'
        Write-ExamResult $row
        return 'not_run'
    }
    if (-not (Invoke-SmokeGate 'before inject')) {
        Write-ExamResult $row
        return 'error'
    }
    Wait-IncidentsQuiet

    # Sized to outlast the whole question: baseline + the alert deadline + the
    # investigation cap + the cooldown.
    $loadFor = 60 + $alertDeadline + $OncallCapSec + $CooldownSec
    $load = Start-ExamLoad -Scenario $s -Seconds $loadFor
    Start-Sleep -Seconds 60   # a healthy "before" on every dashboard

    try {
        $injectedAt = [datetime]::UtcNow
        if ((Invoke-ScenarioStep $Id 'inject') -ne 0) {
            Write-Warning "inject failed - scenario unusable"
            Write-ExamResult $row
            return 'error'
        }
        if ((Invoke-ScenarioStep $Id 'verify') -ne 0) {
            Write-Warning "verify could not confirm the fault - scenario unusable"
            Write-ExamResult $row
            return 'error'
        }

        $oncall = Wait-ScenarioRun -Scenario $s -SinceUtc $injectedAt -DeadlineSec $alertDeadline
        if ($null -eq $oncall) {
            # `no_alert` is a claim about the OBSERVABILITY plane, and it goes on
            # a scorecard - so check it before making it. If an incident did
            # open in this window, the alert path worked and the runner is what
            # failed; that is `error`, and saying so keeps a harness bug from
            # being filed as a lab finding.
            $stamp = $injectedAt.ToString('yyyy-MM-dd HH:mm:ss')
            $opened = ConvertTo-IntOrNull (Invoke-Psql "select count(*) from incidents where opened_at >= timestamptz '$stamp+00'")
            if ($opened -gt 0) {
                Write-Warning "no oncall run found, but $opened incident(s) opened since the inject - that is a RUNNER fault, not a missing alert. Recording error."
                Write-ExamResult $row
                return 'error'
            }
            $absorbed = Test-AlertWasAbsorbed -SinceUtc $injectedAt
            if ($absorbed) {
                Write-Warning "the alert FIRED but attached to already-open incident $absorbed, so no investigation spawned. That is a lab-state problem, not a missing alert - close it and re-run this scenario."
                Write-ExamResult $row
                return 'error'
            }
            Write-Warning "no alert inside ${alertDeadline}s - recording no_alert (an observability finding, not the agent's fault)"
            $row.status = 'no_alert'
            $row.timeToAlertS = $alertDeadline
            Write-ExamResult $row
            return 'no_alert'
        }

        $row.agentRunId = $oncall.Id
        $row.timeToAlertS = $oncall.WaitedS

        $settled = Wait-RunSettled -RunId $oncall.Id -CapSec $OncallCapSec
        if ($null -eq $settled) {
            Write-ExamResult $row
            return 'error'
        }
        $evidence = Get-RunEvidence -Run $settled
        # Only when there IS one: incident_id carries a foreign key, and an
        # empty string would fail the insert rather than read as "none".
        if ($evidence.IncidentId) { $row.incidentId = $evidence.IncidentId }
        $row.turns = $evidence.Turns
        $row.toolCalls = $evidence.ToolCalls
        $row.timeToDiagnosisS = $evidence.DiagnosisS

        if ($settled.status -eq 'failed' -and (Test-AuthFailure "$($settled.summary) $($evidence.Report)")) {
            Write-Warning 'the Claude session died (auth) - this question was never really asked'
            $row.status = 'not_run'
            Write-ExamResult $row
            return 'not_run'
        }
        if (-not $evidence.Report.Trim()) {
            Write-Warning 'the agent produced no report at all - recording error rather than grading silence'
            Write-ExamResult $row
            return 'error'
        }
    } finally {
        # Revert ALWAYS, whatever happened above. A fault left live would make
        # every scenario after this one meaningless.
        Stop-ExamLoad $load
        Write-Step "$Id : reverting"
        if ((Invoke-ScenarioStep $Id 'revert') -ne 0) {
            Write-Warning "REVERT FAILED for $Id - fix it before running anything else: obs chaos revert $Id"
        }
    }

    # The fault must be GONE: a verify that still passes means the revert lied,
    # and the next scenario would inherit a live fault.
    if ((Invoke-ScenarioStep $Id 'verify') -eq 0) {
        Write-Warning "$Id still verifies as faulty AFTER revert - halting is safer than continuing"
        Write-ExamResult $row
        return 'error'
    }
    # Cooldown, then wait for the incident to actually close: the next
    # scenario cannot ask its question while this one's incident is open.
    Write-Step "cooldown ${CooldownSec}s (let the alert resolve)"
    Start-Sleep -Seconds $CooldownSec
    Wait-IncidentsQuiet -TimeoutSec 420 | Out-Null
    # A WARNING, not a gate. The fault is already reverted and `verify` has
    # confirmed it; whether the lab is briefly unhealthy afterwards says
    # nothing about the answer the agent gave, and throwing away a finished
    # investigation over it wastes the most expensive part of the run. The
    # gate that protects the NEXT question is the pre-inject one.
    if (-not (Invoke-SmokeGate 'after revert')) {
        Write-Warning 'the lab is not healthy after the revert - grading this scenario anyway, but fix it before the next one'
    }

    # ---- grade ---------------------------------------------------------------
    Write-Step "$Id : judging ($($evidence.Report.Length) chars of report)"
    try {
        $verdict = Invoke-Agents -Path '/exam/judge' -Method 'POST' -TimeoutSec 300 -Body @{
            scenarioId = $Id; report = $evidence.Report; transcript = $evidence.Transcript
        }
    } catch {
        Write-Warning "the judge returned no verdict: $($_.Exception.Message)"
        Write-ExamResult $row
        return 'error'
    }

    $row.status = 'graded'
    $row.judgeRunId = $verdict.runId
    $row.componentCorrect = $verdict.componentCorrect
    $row.causeCategoryCorrect = $verdict.causeCategoryCorrect
    $row.evidenceCited = $verdict.evidenceCited
    $row.remediationAppropriate = $verdict.remediationAppropriate
    $row.cheated = $verdict.cheated
    $row.judgeRationale = $verdict.rationale
    Write-ExamResult $row

    $score = 0
    if (-not $verdict.cheated) {
        foreach ($b in @($verdict.componentCorrect, $verdict.causeCategoryCorrect,
                         $verdict.evidenceCited, $verdict.remediationAppropriate)) {
            if ($b) { $score++ }
        }
    }
    $cheatNote = ''
    if ($verdict.cheated) { $cheatNote = '  (CHEATED - score forced to 0)' }
    Write-Step "$Id : graded $score/4$cheatNote"
    return 'graded'
}

# ---- plan + dispatch ---------------------------------------------------------

function Get-ExamPlan {
    <# Ids are always NN-name and groups are always bare words (ADR-006), so
       the two namespaces cannot collide and no flag is needed to tell them
       apart. #>
    param([string]$Requested, [string]$From)
    $ids = @()
    if (-not $Requested -or $Requested -eq '--all' -or $Requested -eq 'all') {
        $ids = @(Get-ScenarioIds -ExamOnly)
    } elseif ($Requested -match '^[0-9]{2}-') {
        $s = Get-Scenario $Requested   # throws on an unknown id
        if (-not $s.exam) { throw "'$Requested' is a drill, not an exam scenario" }
        $ids = @($Requested)
    } else {
        $ids = @(Get-ScenarioIds -Group $Requested -ExamOnly)
        if ($ids.Count -eq 0) { throw "no exam scenarios in group '$Requested' (groups: $((Get-ScenarioGroups) -join ', '))" }
    }
    if ($From) {
        $start = [array]::IndexOf($ids, $From)
        if ($start -lt 0) { throw "--from '$From' is not in this plan: $($ids -join ', ')" }
        $ids = @($ids[$start..($ids.Count - 1)])
    }
    return $ids
}

function Show-ExamUsage {
    Write-Host 'usage: obs exam <group> | <scenario-id> | --all [--from <id>] | list'
    Write-Host ''
    Write-Host '  groups:'
    foreach ($g in (Get-ScenarioGroups)) {
        $ids = @(Get-ScenarioIds -Group $g -ExamOnly)
        # Typical, not worst case: the alert usually lands near its expected
        # time rather than at the 2x deadline, and an investigation runs ~5
        # min rather than to the 15-min cap. A group that times out everywhere
        # takes about three times this.
        $mins = 0
        foreach ($id in $ids) { $mins += [int](((Get-Scenario $id).expected_time_to_alert_s + 300 + 200) / 60) }
        Write-Host ("    {0,-12} {1,-2} scenario(s), ~{2} min typical   {3}" -f $g, $ids.Count, $mins, ($ids -join ' '))
    }
    Write-Host ''
    Write-Host '  The laptop must stay on for the whole run (keep-awake is held automatically).'
    Write-Host '  Results land in exam_results; read them at /scorecard.'
}

# --- argument parsing: --from <id> anywhere, everything else positional -------
$from = ''
$positional = @()
for ($i = 0; $i -lt $Rest.Count; $i++) {
    $arg = "$($Rest[$i])"
    if ($arg -in '--from', '-from') { $i++; if ($i -lt $Rest.Count) { $from = "$($Rest[$i])" }; continue }
    $positional += $arg
}
if (-not $Target -and $positional.Count -gt 0) { $Target = $positional[0] }

# A bare `obs exam` prints the plan rather than starting a two-hour run: the
# full sweep is a real budget event and has to be asked for explicitly.
if (-not $Target -or ($Target -in 'help', '-h', '--help', 'list')) { Show-ExamUsage; return }

# @(): a one-scenario plan comes back from Get-ExamPlan as a bare STRING (PS
# unwraps single-element arrays on return), and `$plan[0]` on a string is its
# first CHARACTER - which is how the first run of this script went looking for
# a scenario called "1".
try { $plan = @(Get-ExamPlan -Requested $Target -From $from) }
catch { Write-Warning $_.Exception.Message; Write-Host ''; Show-ExamUsage; return }

$group = $Target
if ($Target -in '--all', 'all') { $group = 'all' }
if ($plan.Count -eq 1) { $group = (Get-Scenario $plan[0]).group }

Write-Step "exam: $($plan.Count) scenario(s) - $($plan -join ', ')"
if (-not (Test-ClockSkew)) { return }
if (-not (Test-Preflight)) { return }
Test-AgentCredentials | Out-Null   # warns, never blocks

# One live fault at a time, across every entrance to the lab. `obs exam` and
# the surprise drill can both start one, and nothing else stops them coinciding.
$held = Get-LabLock
if ($held) {
    Write-Warning "the lab is already held by $($held.what) (pid $($held.pid), since $($held.at)) - two live faults at once make both incidents unreadable. Wait for it, or stop it and re-run."
    return
}

Push-Location $Repo
Set-KeepAwake
Set-LabLock -What "exam $($plan -join ',')"
# PS decodes a NATIVE command's stdout with [Console]::OutputEncoding, which on
# a default Windows console is the OEM codepage - so a postmortem read back
# through `docker exec ... psql` arrives mangled in exactly the way the HTTP
# responses did before Invoke-Agents started decoding its own bytes. Held for
# the run, restored in the finally.
$prevConsoleEncoding = $null
try {
    $prevConsoleEncoding = [Console]::OutputEncoding
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
} catch { }
$examRunId = $null
try {
    $examRunId = New-ExamRun -Group $group
    Write-Step "exam run $examRunId (group=$group)"

    $tally = [ordered]@{ graded = 0; no_alert = 0; error = 0; not_run = 0 }
    $halted = $false
    foreach ($id in $plan) {
        if ($halted) {
            # The session died: every remaining question was never asked, and
            # saying so is the whole point of `not_run` (ADR-006).
            Write-ExamResult @{ examRunId = $examRunId; scenarioId = $id; status = 'not_run' }
            $tally['not_run']++
            continue
        }
        # An unexpected throw must cost ONE scenario, not the run: without this
        # the row never gets written and the scorecard silently has a hole
        # where a question was.
        try { $status = Invoke-ExamScenario -Id $id -ExamRunId $examRunId }
        catch {
            Write-Warning "$id threw: $($_.Exception.Message)"
            Write-ExamResult @{ examRunId = $examRunId; scenarioId = $id; status = 'error' }
            $status = 'error'
        }
        $tally[$status]++
        if ($status -eq 'not_run') {
            Write-Warning 'halting: the Claude session is not usable. Refresh it (any interactive `claude` use) and resume with --from'
            $halted = $true
        }
    }

    Write-Host ''
    Write-Step "exam run $examRunId complete"
    foreach ($k in $tally.Keys) { Write-Host ("    {0,-9} {1}" -f $k, $tally[$k]) }
    Write-Host "    scorecard: $WebUrl/scorecard"
} finally {
    if ($examRunId) {
        try { Invoke-Agents -Path "/exam/runs/$examRunId/finish" -Method 'POST' | Out-Null } catch { }
    }
    Clear-LabLock
    Clear-KeepAwake
    if ($prevConsoleEncoding) { try { [Console]::OutputEncoding = $prevConsoleEncoding } catch { } }
    Pop-Location
}
