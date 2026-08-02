<#
  02-error-storm : verify

  Two assertions, reported separately so a failure says which half broke:
    1. the fault is live      - the retriever plane reports errorRate >= 0.3
    2. its signal exists      - the gateway actually returns 5xx under probe

  Assertion 2 matters more than it looks. The chaos plane accepting a knob does
  not prove requests are failing: if traffic never reaches the retriever, the
  exam would grade an agent on an incident that produced no telemetry. The probe
  classifies status codes rather than counting thrown exceptions, because
  Invoke-WebRequest throws on 401 and 422 too - the first version of this file
  reported "signal present: 12/12" against a cleanly reverted lab, purely
  because the probe was missing its bearer token.
#>

. (Join-Path $PSScriptRoot '..\_lib\chaos-plane.ps1')
. (Join-Path $PSScriptRoot '..\_lib\assert.ps1')

$ok = $true

# --- 1. the fault is live -------------------------------------------------
$rate = Get-ActiveChaosValue -Service 'retriever' -Knob 'errorRate'
if ($null -eq $rate -or $rate -lt 0.3) {
    Write-Warning "fault NOT live: retriever errorRate=$rate (want >= 0.3)"
    $ok = $false
} else {
    Write-Step "fault live: retriever errorRate=$rate"
}

# --- 2. the signal exists -------------------------------------------------
# 12 probes against a 30% failure rate: P(zero 5xx) ~ 1.4%, low enough not to
# flake, cheap enough to run between every scenario in an exam.
$probes = Measure-GatewayProbes -Count 12
if (-not (Assert-ServerErrors -Probes $probes -AtLeast 1 -Context 'gateway')) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
