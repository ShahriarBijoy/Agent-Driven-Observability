<#
  Scenario pack: discovery, metadata and step dispatch.

  The pack is the ONLY definition of chaos in the lab. `obs fail`, `obs chaos`
  and `obs exam` are all callers of it, so there is one implementation and one
  revert path.

  The contract every scenario honours:
    inject.ps1   idempotent; starts no load; schedules no revert
    verify.ps1   exit 0 only when the fault is live AND its signal exists
    revert.ps1   on command only; idempotent; safe on an already-healthy lab

  Revert is a command, never a timer. A timed auto-revert races a remediating
  agent and makes remediation tests non-deterministic - that is exactly what
  the 2026-07-23 crashloop test hit, where the drill's own `rollout undo`
  fought the agent's and the deployment ping-ponged back onto the bad revision.
#>

. (Join-Path $PSScriptRoot 'env.ps1')

function Get-ScenarioRoot { Split-Path -Parent $PSScriptRoot }

function Get-Scenario {
    <# Parsed scenario.json plus its directory. Throws on an unknown id. #>
    param([Parameter(Mandatory)][string]$Id)
    $dir = Join-Path (Get-ScenarioRoot) $Id
    $meta = Join-Path $dir 'scenario.json'
    if (-not (Test-Path $meta)) { throw "unknown scenario '$Id' (no $meta)" }
    $parsed = Get-Content $meta -Raw | ConvertFrom-Json
    $h = @{}
    foreach ($p in $parsed.PSObject.Properties) { $h[$p.Name] = $p.Value }
    $h['Path'] = $dir
    return $h
}

function Get-ScenarioIds {
    <# Sorted ids. -Group filters to one exam group; -ExamOnly drops the
       retained non-exam drills (pod-kill, brownout, ...). #>
    param([string]$Group = '', [switch]$ExamOnly)
    $ids = @()
    foreach ($d in (Get-ChildItem (Get-ScenarioRoot) -Directory | Where-Object { $_.Name -ne '_lib' })) {
        $s = Get-Scenario $d.Name
        if ($Group -and ($s.group -ne $Group)) { continue }
        if ($ExamOnly -and (-not $s.exam)) { continue }
        $ids += $d.Name
    }
    return ($ids | Sort-Object)
}

function Get-ScenarioGroups {
    $groups = @()
    foreach ($id in (Get-ScenarioIds -ExamOnly)) {
        $g = (Get-Scenario $id).group
        if ($groups -notcontains $g) { $groups += $g }
    }
    return $groups
}

function Invoke-ScenarioStep {
    <# Runs one step and returns its exit code. Scripts signal failure with
       `exit 1`, so callers branch on the return value, never on output. #>
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][ValidateSet('inject', 'verify', 'revert')][string]$Step
    )
    $s = Get-Scenario $Id
    $script = Join-Path $s.Path "$Step.ps1"
    if (-not (Test-Path $script)) { throw "$Id has no $Step.ps1" }
    $global:LASTEXITCODE = 0
    & $script
    return $LASTEXITCODE
}

function Show-ScenarioTable {
    param([string]$Group = '')
    $ids = Get-ScenarioIds -Group $Group
    Write-Host ("  {0,-20} {1,-11} {2,-5} {3}" -f 'ID', 'GROUP', 'MODE', 'TITLE')
    foreach ($id in $ids) {
        $s = Get-Scenario $id
        $group = if ($s.exam) { $s.group } else { '-' }
        Write-Host ("  {0,-20} {1,-11} {2,-5} {3}" -f $id, $group, $s.inject_mode, $s.title)
    }
    Write-Host ''
    Write-Host "group '-' = retained drill, not an exam question."
    Write-Host "inject_mode: git = ships through CI/gitops, so the change IS the desired state and"
    Write-Host "Argo stays Synced; live = out-of-band. A live inject shows OutOfSync only when it"
    Write-Host "MODIFIES a field git declares - Argo's diff ignores fields git never mentioned."
}

# ---- the lab lock ------------------------------------------------------------
#
# Who is currently holding the lab with a live fault. The pack is where this
# belongs: every injector goes through it, and "may I inject?" is a question
# about the lab, not about any one caller.
#
# It exists because the surprise drill's original guard scanned process command
# lines for `exam.ps1` — and `obs exam` DOT-SOURCES that script inside the obs
# process, so the string never appears in any command line. A drill firing
# during a sit-down exam would have sailed past the guard and injected a second
# fault on top of a live one, which makes both incidents unreadable and is the
# one thing the runner is strictly sequential to avoid.
$LabLockFile = Join-Path $Repo '.artifacts\lab.lock'

function Get-LabLock {
    <# The live holder, or $null when the lab is free.

       Checks the holder's PROCESS START TIME as well as its pid, because pids
       are reused: without that, a lock left behind by a killed exam would
       block every drill until somebody deleted a file by hand — and a guard
       that fails closed forever is just a broken guard. #>
    if (-not (Test-Path $LabLockFile)) { return $null }
    $lock = try { Get-Content $LabLockFile -Raw | ConvertFrom-Json } catch { $null }
    if (-not $lock -or -not $lock.pid) { return $null }
    $proc = Get-Process -Id ([int]$lock.pid) -ErrorAction SilentlyContinue
    if (-not $proc) { return $null }
    if ($lock.processStartedAt) {
        $started = try { [datetime]::Parse($lock.processStartedAt, $null, [Globalization.DateTimeStyles]::RoundtripKind) } catch { $null }
        # Same pid, different process: the holder died and Windows reissued it.
        if ($started -and ([Math]::Abs(($started - $proc.StartTime).TotalSeconds) -gt 5)) { return $null }
    }
    return $lock
}

function Set-LabLock {
    <# Claim the lab. Callers check Get-LabLock first; this only records. #>
    param([Parameter(Mandatory)][string]$What)
    $dir = Split-Path $LabLockFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $me = Get-Process -Id $PID
    @{
        pid = $PID
        processStartedAt = $me.StartTime.ToString('o')
        what = $What
        at = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Depth 3 | Set-Content -Path $LabLockFile -Encoding UTF8
}

function Clear-LabLock {
    <# Release, but only our own: a crashed holder's lock is already ignored by
       Get-LabLock, and deleting somebody else's would defeat the guard. #>
    if (-not (Test-Path $LabLockFile)) { return }
    $lock = try { Get-Content $LabLockFile -Raw | ConvertFrom-Json } catch { $null }
    if ($lock -and [int]$lock.pid -ne $PID) { return }
    Remove-Item $LabLockFile -Force -ErrorAction SilentlyContinue
}

function Test-Scenario {
    <# The test cycle every scenario must pass before it is trusted in an exam:

         inject -> verify (must PASS)
                -> revert -> verify (must FAIL to find the fault)
                -> revert again (idempotence)

       The second verify is the one that catches a weak scenario: if verify
       still passes after revert it is asserting something that was already
       true, so it would never have proved the fault was live.

       A scenario declaring "transient": true is exempt from that one gate, and
       from nothing else. pod-kill is the only such scenario: deleting a pod is
       over the instant it happens, its evidence is the recovery itself, and
       there is no state a revert could undo. Demanding that its verify stop
       passing after a no-op revert would be demanding that the scenario forget
       what just happened. The exemption is declared per scenario rather than
       inferred, so a genuinely broken verify cannot quietly claim it. #>
    param([Parameter(Mandatory)][string]$Id)

    Write-Step "[selftest] $Id : inject"
    if ((Invoke-ScenarioStep $Id 'inject') -ne 0) {
        Write-Warning "[selftest] $Id : inject failed"
        return $false
    }

    Write-Step "[selftest] $Id : verify (expect PASS)"
    if ((Invoke-ScenarioStep $Id 'verify') -ne 0) {
        Write-Warning "[selftest] $Id : verify did not see the fault it just injected"
        Invoke-ScenarioStep $Id 'revert' | Out-Null
        return $false
    }

    Write-Step "[selftest] $Id : revert"
    if ((Invoke-ScenarioStep $Id 'revert') -ne 0) {
        Write-Warning "[selftest] $Id : revert failed - the lab may be left broken"
        return $false
    }

    if ((Get-Scenario $Id).transient) {
        Write-Step "[selftest] $Id : skipping the post-revert verify (transient scenario - nothing to undo)"
    } else {
        Write-Step "[selftest] $Id : verify (expect FAIL - the fault is gone)"
        if ((Invoke-ScenarioStep $Id 'verify') -eq 0) {
            Write-Warning "[selftest] $Id : verify still sees the fault after revert"
            return $false
        }
    }

    Write-Step "[selftest] $Id : revert again (idempotence)"
    if ((Invoke-ScenarioStep $Id 'revert') -ne 0) {
        Write-Warning "[selftest] $Id : revert is not idempotent"
        return $false
    }

    Write-Step "[selftest] $Id : PASS"
    return $true
}
