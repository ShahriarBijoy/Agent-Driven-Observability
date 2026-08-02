<#
  Signal assertions shared by every scenario's verify.ps1.

  A scenario's verify has to prove two independent things - the fault is live,
  AND its signal reached the telemetry the agent will read. The second is the
  one that keeps an exam honest: a chaos plane happily accepts a knob whether or
  not any traffic is hitting the faulty path, and grading an agent on an
  incident that produced no evidence is worse than not running the scenario.

  Probes here therefore classify responses rather than counting exceptions.
  Invoke-WebRequest throws on any non-2xx, so a misconfigured probe (401 for a
  missing bearer token, 422 for a stale body shape) looks exactly like a
  successful fault injection unless the status code is inspected - which is
  precisely the false positive this file exists to prevent.
#>

. (Join-Path $PSScriptRoot 'env.ps1')

# Dev tenant tokens (ADR-002 SS4). The gateway resolves a tenant from the
# bearer token and 401s without one; override for a non-default tenant.
$ProbeToken = if ($env:OBS_PROBE_TOKEN) { $env:OBS_PROBE_TOKEN } else { 'dev-local-token' }

function Invoke-GatewayProbe {
    <# One /v1/chat request. Returns the HTTP status code as an int - 0 when the
       request never got a response at all (connection refused, DNS failure,
       timeout), which is itself a distinguishable signal. #>
    param([int]$TimeoutSec = 15)

    $headers = @{ 'Authorization' = "Bearer $ProbeToken" }
    $body = '{"prompt":"exam verification probe"}'
    try {
        $r = Invoke-WebRequest -Uri "$GatewayUrl/v1/chat" -Method Post -Headers $headers `
            -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSec -UseBasicParsing
        return [int]$r.StatusCode
    } catch {
        if ($null -ne $_.Exception.Response) { return [int]$_.Exception.Response.StatusCode.value__ }
        return 0
    }
}

function Measure-GatewayProbes {
    <# Fire N probes and bucket the results. Returns a hashtable:
         Total, Ok (2xx), ServerErrors (5xx), RateLimited (429),
         ClientErrors (other 4xx), NoResponse (0)

       429 is bucketed apart from the other 4xx on purpose. The gateway rate
       limits per tenant, so a rapid probe burst can legitimately be shed - that
       is the subject system working as designed, not a broken probe. Only the
       other 4xx (401 for a bad token, 422 for a stale body shape) mean the
       probe itself is wrong. #>
    param([int]$Count = 12, [int]$TimeoutSec = 15, [int]$DelayMs = 250)

    $r = @{ Total = $Count; Ok = 0; ServerErrors = 0; RateLimited = 0; ClientErrors = 0; NoResponse = 0 }
    for ($i = 0; $i -lt $Count; $i++) {
        $code = Invoke-GatewayProbe -TimeoutSec $TimeoutSec
        if ($code -eq 0) { $r.NoResponse++ }
        elseif ($code -ge 500) { $r.ServerErrors++ }
        elseif ($code -eq 429) { $r.RateLimited++ }
        elseif ($code -ge 400) { $r.ClientErrors++ }
        else { $r.Ok++ }
        # Spacing the burst keeps the per-tenant limiter from swallowing the
        # sample the assertion depends on.
        if ($DelayMs -gt 0 -and $i -lt ($Count - 1)) { Start-Sleep -Milliseconds $DelayMs }
    }
    return $r
}

function Assert-ProbeHealthy {
    <# Guard for the probe itself. A non-429 4xx means the probe is wrong (bad
       token, stale body shape) - the caller must fail the whole verify rather
       than report a signal it did not actually observe. #>
    param([Parameter(Mandatory)][hashtable]$Probes, [string]$Context = 'probe')
    if ($Probes.ClientErrors -gt 0) {
        Write-Warning "$Context is misconfigured: $($Probes.ClientErrors)/$($Probes.Total) probes returned a non-429 4xx (check the bearer token and request body, not the fault)"
        return $false
    }
    if ($Probes.RateLimited -eq $Probes.Total) {
        Write-Warning "$Context was rate limited on every probe - no usable sample; retry with a longer -DelayMs"
        return $false
    }
    return $true
}

function Assert-ServerErrors {
    <# Assert the gateway is actually returning 5xx. #>
    param(
        [Parameter(Mandatory)][hashtable]$Probes,
        [int]$AtLeast = 1,
        [string]$Context = 'gateway'
    )
    if (-not (Assert-ProbeHealthy -Probes $Probes -Context $Context)) { return $false }
    if ($Probes.ServerErrors -lt $AtLeast) {
        Write-Warning "signal MISSING: $($Probes.ServerErrors)/$($Probes.Total) $Context probes returned 5xx (want >= $AtLeast)"
        return $false
    }
    Write-Step "signal present: $($Probes.ServerErrors)/$($Probes.Total) $Context probes returned 5xx"
    return $true
}

function Assert-NoServerErrors {
    <# The mirror assertion, for reverts and for scenarios whose signature is
       'slow but succeeding' (01-latency): every probe must come back 2xx. #>
    param([Parameter(Mandatory)][hashtable]$Probes, [string]$Context = 'gateway')
    if (-not (Assert-ProbeHealthy -Probes $Probes -Context $Context)) { return $false }
    if ($Probes.ServerErrors -gt 0) {
        Write-Warning "$Context still returning 5xx: $($Probes.ServerErrors)/$($Probes.Total)"
        return $false
    }
    return $true
}
