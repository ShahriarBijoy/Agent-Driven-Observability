<#
  Inject state: what a scenario has to remember in order to undo itself.

  The pack's revert contract is "on command, idempotent, safe on a healthy lab",
  and the obvious mechanism - `kubectl rollout undo` - satisfies none of it.
  Undo TOGGLES between the last two revisions, so running revert twice
  re-injects the fault; Test-Scenario runs it twice on purpose, which is how
  that surfaced. An Argo sync is no better: it leaves out-of-band fields alone
  (verified live - a live-added env var survived a Succeeded sync), so it can
  revert some mutations and silently not others.

  So a scenario that mutates a field captures that field's value BEFORE
  changing it, and revert writes the captured value back. That is idempotent in
  both directions, needs no revision arithmetic, and stays correct when a
  remediating agent got there first.

  State lives under .artifacts/exam/ - git-ignored, outside every agent grant,
  and outside scripts/exam-keys/ so it can never be confused for an answer key.
#>

. (Join-Path $PSScriptRoot 'env.ps1')

function Get-ScenarioStatePath {
    param([Parameter(Mandatory)][string]$Id)
    return (Join-Path $Repo ".artifacts\exam\$Id.state.json")
}

function Test-ScenarioState {
    param([Parameter(Mandatory)][string]$Id)
    return (Test-Path (Get-ScenarioStatePath $Id))
}

function Save-ScenarioState {
    <# Write the pre-inject capture. Callers must only reach this when no state
       exists yet: a second inject that re-captured would record the FAULTED
       value as the thing to restore, turning revert into a no-op that reports
       success. #>
    param([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][hashtable]$State)
    $path = Get-ScenarioStatePath $Id
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    $State | ConvertTo-Json -Compress | Set-Content -Encoding ascii -Path $path
}

function Get-ScenarioState {
    <# The capture, or $null when the scenario was never injected - which is the
       healthy-lab case every revert has to survive. #>
    param([Parameter(Mandatory)][string]$Id)
    $path = Get-ScenarioStatePath $Id
    if (-not (Test-Path $path)) { return $null }
    try { return (Get-Content $path -Raw | ConvertFrom-Json) }
    catch { Write-Warning "unreadable inject state at $path - delete it and revert by hand"; return $null }
}

function Clear-ScenarioState {
    <# Called only after a revert has been CONFIRMED. Deleting it earlier would
       throw away the only record of what the lab looked like before. #>
    param([Parameter(Mandatory)][string]$Id)
    $path = Get-ScenarioStatePath $Id
    if (Test-Path $path) { Remove-Item -Force $path }
}
