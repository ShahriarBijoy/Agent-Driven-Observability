<#
  The /admin/chaos control planes (ADR-005).

  Runtime knobs, not env vars or restarts: a partial patch is merged into the
  service's effective fault config per request. Because nothing in a pod spec
  changes, these injections are invisible to Argo by design - which is part of
  the signature the agent has to read (app-layer fault, infra untouched, no
  deploy).

  Shape differs by service and both are handled here:
    model-proxy  GET returns { base, override, effective }; knobs are
                 p500, latencyBaseMs, latencyGammaScaleMs, latencyMaxMs,
                 faultsEnabled
    retriever    GET returns the flat state; knobs are outage, errorRate
#>

. (Join-Path $PSScriptRoot 'env.ps1')

function Get-ChaosState {
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    return Invoke-RestMethod -Uri "$($ChaosBase[$Service])/admin/chaos" -TimeoutSec 5
}

function Set-ChaosKnobs {
    <# Merge a partial override. Returns the service's snapshot so callers can
       confirm the plane actually took it rather than trusting a 200. #>
    param(
        [Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service,
        [Parameter(Mandatory)][hashtable]$Knobs
    )
    $body = $Knobs | ConvertTo-Json -Compress
    return Invoke-RestMethod -Method Post -Uri "$($ChaosBase[$Service])/admin/chaos" `
        -Body $body -ContentType 'application/json' -TimeoutSec 5
}

function Clear-ChaosKnobs {
    <# Idempotent: DELETE on an already-clean plane is a no-op 200. #>
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    Invoke-RestMethod -Method Delete -Uri "$($ChaosBase[$Service])/admin/chaos" -TimeoutSec 5 | Out-Null
}

function Get-ActiveChaosValue {
    <# One knob's currently-effective value, normalising the two response
       shapes. Returns $null when the knob is absent. #>
    param(
        [Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service,
        [Parameter(Mandatory)][string]$Knob
    )
    $state = Get-ChaosState $Service
    if ($null -ne $state.effective) { $node = $state.effective } else { $node = $state }
    $prop = $node.PSObject.Properties[$Knob]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Test-ChaosPlaneReachable {
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    try { Get-ChaosState $Service | Out-Null; return $true }
    catch { Write-Warning "$Service chaos plane unreachable at $($ChaosBase[$Service])/admin/chaos"; return $false }
}
