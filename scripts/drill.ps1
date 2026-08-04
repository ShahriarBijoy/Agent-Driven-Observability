<#
  The surprise drill (PLAN-2 P12, Task 10).

  `obs exam` is a rehearsal you scheduled: you pick the group, you watch the
  console, and you know which fault is coming. That measures the agent but not
  the on-call arrangement around it. The surprise drill removes the last two
  human inputs - WHICH question and WHEN - and hands them to a Windows
  scheduled task:

      obs drill install [--window 01:00-05:00] [--days Mon,Thu] [--mode exam]
      obs drill status
      obs drill now [--id <id>] [--mode exam|fail]
      obs drill uninstall

  Install registers ONE daily trigger at the window's start with a
  `RandomDelay` the length of the window, which is Task Scheduler's own
  randomiser - so the fire time is unpredictable to the person who installed it,
  not merely unpredictable to the agent.

  Two modes:
    exam   (default) one graded question through exam.ps1: alert -> investigate
           -> judge -> an `exam_results` row that shows up on /scorecard next to
           the sit-down runs. This is the one worth scheduling; an unannounced
           grade is the only grade that measures the real arrangement.
    fail   the Act-I drill (`obs fail <id>`): inject, dwell, revert, no grade.
           For when you want the lab exercised without spending judge tokens.

  Design notes:

  * THE DRILL NEVER PICKS THE SAME QUESTION TWICE IN A ROW. Pure uniform
    randomness is allowed to repeat, and a fault the agent saw yesterday is a
    memory test rather than a surprise. Last id is kept in the state file.
  * A GUARD THAT REFUSES IS A SUCCESS, NOT A FAILURE. If the lab is down, the
    cluster is in compose mode, agent-service is unreachable or another exam is
    already running, the drill logs why and exits 0. A red X in Task Scheduler
    every time the laptop happens to be off would train you to ignore it.
  * MISSED WINDOWS ARE NOT MADE UP (`StartWhenAvailable = $false`). A 3 am
    drill that fires at 2 pm because the laptop was asleep is a fault injected
    into a working day, not a rehearsal.
  * The task runs as the interactive user on purpose: the exam needs this
    machine's Claude Code OAuth session and the host processes (`obs agents`,
    `obs web`), none of which exist in a service context.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Action = 'status',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)

# NOT 'Stop': the same reason exam.ps1 says so at its top - PS 5.1 turns a
# native command's stderr into an ErrorRecord, and this script shells out to
# the exam runner, which shells out to psql and kubectl.
. (Join-Path $PSScriptRoot 'scenarios\_lib\pack.ps1')

$TaskPath = '\obs-lab\'
$TaskName = 'obs-surprise-drill'
$DrillDir = Join-Path $Repo '.artifacts\drills'
$StateFile = Join-Path $DrillDir 'state.json'
$HistoryFile = Join-Path $DrillDir 'history.jsonl'

function Write-Drill {
    <# Everything a drill does goes to BOTH the console and today's log, because
       the console is nobody's audience at 3 am. #>
    param([string]$Msg, [string]$Level = 'info')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "$stamp  $Msg"
    switch ($Level) {
        'warn' { Write-Host $line -ForegroundColor Yellow }
        'ok' { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line -ForegroundColor Cyan }
    }
    if (-not (Test-Path $DrillDir)) { New-Item -ItemType Directory -Path $DrillDir -Force | Out-Null }
    Add-Content -Path (Join-Path $DrillDir ("drill-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))) -Value $line -Encoding UTF8
}

function Get-DrillState {
    if (Test-Path $StateFile) {
        try { return (Get-Content $StateFile -Raw | ConvertFrom-Json) } catch { }
    }
    return $null
}

function Set-DrillState {
    param([Parameter(Mandatory)][hashtable]$State)
    if (-not (Test-Path $DrillDir)) { New-Item -ItemType Directory -Path $DrillDir -Force | Out-Null }
    ($State | ConvertTo-Json -Depth 4) | Set-Content -Path $StateFile -Encoding UTF8
}

function Write-DrillHistory {
    param([Parameter(Mandatory)][hashtable]$Entry)
    if (-not (Test-Path $DrillDir)) { New-Item -ItemType Directory -Path $DrillDir -Force | Out-Null }
    Add-Content -Path $HistoryFile -Value ($Entry | ConvertTo-Json -Depth 4 -Compress) -Encoding UTF8
}

function Select-DrillScenario {
    <# Uniform over the exam scenarios, minus whatever fired last time. With
       ten questions that is a 1-in-9 pick, still unguessable, and it cannot
       hand you the same fault two mornings running. #>
    param([string]$Exclude)
    $ids = @(Get-ScenarioIds -ExamOnly)
    if ($ids.Count -eq 0) { throw 'no exam scenarios in the pack' }
    $pool = @($ids | Where-Object { $_ -ne $Exclude })
    if ($pool.Count -eq 0) { $pool = $ids }
    return $pool[(Get-Random -Minimum 0 -Maximum $pool.Count)]
}

function Test-DrillGuards {
    <# Everything that must be true before a fault may be injected unattended.
       Returns $null when the drill may proceed, or the reason to skip. #>
    if ($Mode -ne 'k8s') { return "lab is in '$Mode' mode - every exam scenario needs the cluster (obs k8s up)" }
    if (-not (Test-Up "$GatewayUrl/health")) { return 'the gateway is not answering - the lab is down' }
    if (-not (Test-Up "$AgentsUrl/health")) { return 'agent-service is not up (obs agents) - nothing would investigate' }

    # Another exam already holds the lab. exam.ps1 is strictly sequential by
    # design and two live faults at once would make both incidents unreadable,
    # so a drill that lands mid-exam stands down rather than queues.
    #
    # This reads the LAB LOCK (pack.ps1), not process command lines. The
    # command-line scan this replaced could not see the common case: `obs exam`
    # dot-sources exam.ps1 inside the obs process, so no command line anywhere
    # contains "exam.ps1" and the guard waved the drill straight through. It
    # only ever caught an exam launched as `powershell -File exam.ps1`.
    $held = Get-LabLock
    if ($held) { return "$($held.what) is already holding the lab (pid $($held.pid), since $($held.at))" }

    return $null
}

function Invoke-DrillNow {
    <# One unannounced question. The result goes to $script:DrillExit rather
       than down the pipeline: Task Scheduler's only view of this is the exit
       code, and a PowerShell function RETURNS everything written to its output
       stream - so `exit (Invoke-DrillNow ...)` would hand `exit` the exam
       runner's entire console output instead of a number. Hence Out-Host on
       the child scripts too.

       0 for ran AND for skipped-by-guard; non-zero only when the drill itself
       broke. A red X in Task Scheduler every time the laptop happened to be
       off would train you to ignore it. #>
    param([string]$Id, [string]$DrillMode)

    $state = Get-DrillState
    $last = if ($state) { "$($state.lastScenarioId)" } else { '' }
    if (-not $Id) { $Id = Select-DrillScenario -Exclude $last }
    else { Get-Scenario $Id | Out-Null }   # throws on an unknown id

    Write-Drill "surprise drill: $Id (mode=$DrillMode, previous=$(if ($last) { $last } else { 'none' }))"

    $skip = Test-DrillGuards
    if ($skip) {
        Write-Drill "stood down: $skip" 'warn'
        Write-DrillHistory @{ at = (Get-Date).ToUniversalTime().ToString('o'); scenarioId = $Id; mode = $DrillMode; outcome = 'skipped'; reason = $skip }
        $script:DrillExit = 0
        return
    }

    # The chosen id is recorded BEFORE the run, not after: a drill killed
    # halfway still happened, and repeating it tomorrow because the write never
    # landed would be the memory test this exists to avoid.
    Set-DrillState @{ lastScenarioId = $Id; lastFiredAt = (Get-Date).ToUniversalTime().ToString('o'); mode = $DrillMode }

    $started = Get-Date
    $global:LASTEXITCODE = 0
    if ($DrillMode -eq 'fail') {
        & (Join-Path $PSScriptRoot 'obs.ps1') fail $Id 40 | Out-Host
    } else {
        & (Join-Path $PSScriptRoot 'exam.ps1') $Id | Out-Host
    }
    $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    $mins = [int]((Get-Date) - $started).TotalMinutes

    Write-Drill "drill finished: $Id after ${mins}m (exit $code)" $(if ($code -eq 0) { 'ok' } else { 'warn' })
    Write-DrillHistory @{ at = $started.ToUniversalTime().ToString('o'); scenarioId = $Id; mode = $DrillMode; outcome = 'ran'; durationMin = $mins; exitCode = $code }
    $script:DrillExit = 0
}

function Install-Drill {
    param([string]$Window, [string[]]$Days, [string]$DrillMode)

    if ($Window -notmatch '^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$') {
        throw "--window must look like 01:00-05:00 (got '$Window')"
    }
    $start = Get-Date -Hour ([int]$Matches[1]) -Minute ([int]$Matches[2]) -Second 0
    $end = Get-Date -Hour ([int]$Matches[3]) -Minute ([int]$Matches[4]) -Second 0
    # A window that ends "before" it starts crosses midnight (22:00-02:00).
    if ($end -le $start) { $end = $end.AddDays(1) }
    $spread = $end - $start
    if ($spread.TotalMinutes -lt 15) { throw 'the window must be at least 15 minutes wide, or it is not a surprise' }

    $exam = Join-Path $PSScriptRoot 'drill.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$exam`" now --mode $DrillMode" `
        -WorkingDirectory $Repo

    # RandomDelay IS the surprise: Task Scheduler picks a fresh offset inside
    # the window each day, so even the person who installed this cannot say
    # when tomorrow's fault lands.
    if ($Days -and $Days.Count -gt 0) {
        # -DaysOfWeek takes [DayOfWeek], which parses 'Monday' but not 'Mon' -
        # and 'Mon' is what anyone types. Expand by prefix.
        $names = [enum]::GetNames([DayOfWeek])
        $resolved = @()
        foreach ($d in $Days) {
            $hit = @($names | Where-Object { $_ -like "$d*" })
            if ($hit.Count -ne 1) { throw "--days: '$d' is not a day of the week ($($names -join ', '))" }
            $resolved += [DayOfWeek]$hit[0]
        }
        $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $resolved -At $start -RandomDelay $spread
    } else {
        $trigger = New-ScheduledTaskTrigger -Daily -At $start -RandomDelay $spread
    }

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable:$false `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

    $desc = "AI Observability Lab surprise drill: one random $DrillMode question between $Window. Installed by scripts/drill.ps1."
    Register-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Description $desc -Force | Out-Null

    Write-Drill "installed $TaskPath$TaskName - $(if ($resolved) { $resolved -join ',' } else { 'daily' }), random time in $Window, mode=$DrillMode" 'ok'
    Show-DrillStatus
}

function Uninstall-Drill {
    $t = Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) { Write-Drill 'no surprise drill is installed' 'warn'; return }
    Unregister-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -Confirm:$false
    Write-Drill "removed $TaskPath$TaskName" 'ok'
}

function Show-DrillStatus {
    $t = Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) {
        Write-Host 'surprise drill: not installed'
        Write-Host '  obs drill install [--window 01:00-05:00] [--days Mon,Thu] [--mode exam|fail]'
    } else {
        $info = Get-ScheduledTaskInfo -TaskPath $TaskPath -TaskName $TaskName
        Write-Host "surprise drill: $($t.State)"
        Write-Host "  next fire   $($info.NextRunTime)   (the exact minute is Task Scheduler's random offset)"
        Write-Host "  last fire   $($info.LastRunTime)   result $($info.LastTaskResult)"
        Write-Host "  action      $($t.Actions[0].Arguments)"
    }

    $state = Get-DrillState
    if ($state) { Write-Host "  last question  $($state.lastScenarioId) at $($state.lastFiredAt)" }
    if (Test-Path $HistoryFile) {
        Write-Host ''
        Write-Host '  recent drills:'
        foreach ($line in (Get-Content $HistoryFile -Tail 8)) {
            try {
                $e = $line | ConvertFrom-Json
                # Every outcome gets its own branch: a 'failed' row rendered
                # through the 'ran' template reads as "ran m, exit " - a drill
                # that never started, printed as one that finished.
                $detail = switch ($e.outcome) {
                    'skipped' { "stood down - $($e.reason)" }
                    'failed' { "FAILED - $($e.reason)" }
                    default { "ran $($e.durationMin)m, exit $($e.exitCode)" }
                }
                # History is stored in UTC (it outlives daylight saving); shown
                # in local time, because the question a reader has is "was that
                # last night?" and the drill log next to it is local too.
                $when = try { [datetime]::Parse($e.at, $null, [Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime().ToString('yyyy-MM-dd HH:mm') } catch { "$($e.at)" }
                Write-Host ("    {0,-17} {1,-18} {2}" -f $when, $e.scenarioId, $detail)
            } catch { }
        }
    }
    Write-Host ''
    Write-Host "  logs $DrillDir"
}

# ---- argument parsing --------------------------------------------------------

$window = '01:00-05:00'
$days = @()
$drillMode = 'exam'
$id = ''
for ($i = 0; $i -lt $Rest.Count; $i++) {
    switch -Regex ("$($Rest[$i])") {
        '^--?window$' { $i++; if ($i -lt $Rest.Count) { $window = "$($Rest[$i])" }; continue }
        '^--?days$' { $i++; if ($i -lt $Rest.Count) { $days = @("$($Rest[$i])".Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }; continue }
        '^--?mode$' { $i++; if ($i -lt $Rest.Count) { $drillMode = "$($Rest[$i])".ToLower() }; continue }
        '^--?id$' { $i++; if ($i -lt $Rest.Count) { $id = "$($Rest[$i])" }; continue }
        default { if (-not $id -and "$($Rest[$i])" -match '^[0-9]{2}-') { $id = "$($Rest[$i])" } }
    }
}
if ($drillMode -notin 'exam', 'fail') { Write-Warning "--mode must be exam or fail (got '$drillMode')"; return }

switch ($Action.ToLower()) {
    'install' {
        try { Install-Drill -Window $window -Days $days -DrillMode $drillMode }
        catch { Write-Warning $_.Exception.Message }
    }
    'uninstall' { Uninstall-Drill }
    'remove' { Uninstall-Drill }
    'now' {
        $script:DrillExit = 1
        try { Invoke-DrillNow -Id $id -DrillMode $drillMode; exit $script:DrillExit }
        catch {
            Write-Drill "drill failed: $($_.Exception.Message)" 'warn'
            Write-DrillHistory @{ at = (Get-Date).ToUniversalTime().ToString('o'); scenarioId = $id; mode = $drillMode; outcome = 'failed'; reason = "$($_.Exception.Message)" }
            exit 1
        }
    }
    'status' { Show-DrillStatus }
    default {
        Write-Host 'usage: obs drill [status] | install [--window 01:00-05:00] [--days Mon,Thu] [--mode exam|fail] | now [--id <id>] | uninstall'
    }
}
