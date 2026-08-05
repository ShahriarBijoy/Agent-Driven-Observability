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

function Read-ErrorCode {
    <# The gateway's machine-readable failure reason, dug out of a thrown
       response body: { "error": { "code": "upstream_timeout" } }.

       Status codes alone cannot separate two of this pack's scenarios. A 429 is
       either `model_overloaded` (the upstream shedding load - the throttle
       drill's whole signal) or `rate_limited` (the per-tenant limiter doing its
       job), and a verify that could not tell them apart would pass on a
       perfectly healthy lab that simply throttled the probe.

       Takes the ErrorRecord, not the exception, and reads ErrorDetails.Message
       FIRST. Invoke-WebRequest has already consumed and disposed the error
       response by the time PS 5.1 hands the exception over, so
       GetResponseStream() returns an empty read - which showed up as a probe
       burst that counted 6 429s and 0 codes, i.e. a verify that could see the
       failures but never the reason for them. #>
    param($ErrorRecord)
    $body = ''
    if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
        $body = $ErrorRecord.ErrorDetails.Message
    } elseif ($null -ne $ErrorRecord.Exception.Response) {
        # Fallback for hosts where ErrorDetails is empty (some proxies, and
        # responses with no body at all).
        try {
            $stream = $ErrorRecord.Exception.Response.GetResponseStream()
            if ($null -ne $stream) { $body = (New-Object IO.StreamReader($stream)).ReadToEnd() }
        } catch { $body = '' }
    }
    if (-not $body) { return '' }
    try {
        $parsed = $body | ConvertFrom-Json
        if ($parsed.error.code) { return [string]$parsed.error.code }
    } catch { }
    return ''
}

function Invoke-GatewayProbe {
    <# One /v1/chat request, described three ways:
         Status     HTTP status as an int - 0 when no response arrived at all
                    (connection refused, DNS failure, client-side timeout)
         Code       the gateway's error code, '' on success
         ElapsedMs  wall time, which is the ONLY signal a latency scenario has:
                    01-latency succeeds on every request and moves nothing but
                    the clock. #>
    param([int]$TimeoutSec = 15)

    $headers = @{ 'Authorization' = "Bearer $ProbeToken" }
    $body = '{"prompt":"exam verification probe"}'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -Uri "$GatewayUrl/v1/chat" -Method Post -Headers $headers `
            -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSec -UseBasicParsing
        $sw.Stop()
        return @{ Status = [int]$r.StatusCode; Code = ''; ElapsedMs = [int]$sw.ElapsedMilliseconds }
    } catch {
        $sw.Stop()
        if ($null -ne $_.Exception.Response) {
            return @{
                Status    = [int]$_.Exception.Response.StatusCode.value__
                Code      = (Read-ErrorCode $_)
                ElapsedMs = [int]$sw.ElapsedMilliseconds
            }
        }
        return @{ Status = 0; Code = 'no_response'; ElapsedMs = [int]$sw.ElapsedMilliseconds }
    }
}

function Measure-GatewayProbes {
    <# Fire N probes and bucket the results. Returns a hashtable:
         Total, Ok (2xx), ServerErrors (5xx), RateLimited (429),
         ClientErrors (other 4xx), NoResponse (0), Codes (code -> count),
         Latencies (every ElapsedMs), MedianMs

       429 is bucketed apart from the other 4xx on purpose. The gateway rate
       limits per tenant, so a rapid probe burst can legitimately be shed - that
       is the subject system working as designed, not a broken probe. Only the
       other 4xx (401 for a bad token, 422 for a stale body shape) mean the
       probe itself is wrong.

       Codes and Latencies exist because two scenarios have no 5xx at all: the
       throttle drill's evidence is a 429 carrying `model_overloaded`, and
       01-latency's is a run of successful requests that each took seconds. #>
    param([int]$Count = 12, [int]$TimeoutSec = 15, [int]$DelayMs = 250)

    $r = @{
        Total     = $Count; Ok = 0; ServerErrors = 0; RateLimited = 0
        ClientErrors = 0; NoResponse = 0
        Codes     = @{}
        Latencies = @()
        MedianMs  = 0
    }
    for ($i = 0; $i -lt $Count; $i++) {
        $p = Invoke-GatewayProbe -TimeoutSec $TimeoutSec
        $status = [int]$p.Status
        if ($status -eq 0) { $r.NoResponse++ }
        elseif ($status -ge 500) { $r.ServerErrors++ }
        elseif ($status -eq 429) { $r.RateLimited++ }
        elseif ($status -ge 400) { $r.ClientErrors++ }
        else { $r.Ok++ }
        if ($p.Code) {
            if ($r.Codes.ContainsKey($p.Code)) { $r.Codes[$p.Code]++ } else { $r.Codes[$p.Code] = 1 }
        }
        $r.Latencies += [int]$p.ElapsedMs
        # Spacing the burst keeps the per-tenant limiter from swallowing the
        # sample the assertion depends on.
        if ($DelayMs -gt 0 -and $i -lt ($Count - 1)) { Start-Sleep -Milliseconds $DelayMs }
    }
    $sorted = @($r.Latencies | Sort-Object)
    if ($sorted.Count -gt 0) { $r.MedianMs = [int]$sorted[[int][Math]::Floor($sorted.Count / 2)] }
    return $r
}

function Get-ProbeCodeCount {
    <# How many probes came back with one specific gateway error code. #>
    param([Parameter(Mandatory)][hashtable]$Probes, [Parameter(Mandatory)][string]$Code)
    if ($Probes.Codes.ContainsKey($Code)) { return [int]$Probes.Codes[$Code] }
    return 0
}

function Format-ProbeSummary {
    param([Parameter(Mandatory)][hashtable]$Probes)
    $codes = ($Probes.Codes.Keys | ForEach-Object { "$_=$($Probes.Codes[$_])" }) -join ' '
    $s = "$($Probes.Ok) ok / $($Probes.ServerErrors) 5xx / $($Probes.RateLimited) 429 / $($Probes.ClientErrors) 4xx / $($Probes.NoResponse) no-response, median $($Probes.MedianMs)ms"
    if ($codes) { $s = "$s [$codes]" }
    return $s
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
    <# The mirror assertion: the lab is serving.

       -Tolerate exists because "zero 5xx" is not what a healthy lab looks like.
       model-proxy's base config fails ~1% of requests and stalls another ~1%
       past the gateway's upstream timeout, on purpose, so a recovery check that
       demanded a perfect burst would report the lab broken roughly one run in
       six. Callers asserting recovery pass a small tolerance; callers asserting
       a specific fault is absent keep the default. #>
    param(
        [Parameter(Mandatory)][hashtable]$Probes,
        [int]$Tolerate = 0,
        [string]$Context = 'gateway'
    )
    if (-not (Assert-ProbeHealthy -Probes $Probes -Context $Context)) { return $false }
    if ($Probes.ServerErrors -gt $Tolerate) {
        Write-Warning "$Context still returning 5xx: $($Probes.ServerErrors)/$($Probes.Total) (tolerating $Tolerate)"
        return $false
    }
    return $true
}

function Assert-SlowResponses {
    <# 01-latency's signal: requests SUCCEED and take too long.

       Asserting on the median rather than the max is deliberate. One slow
       request proves nothing - a cold pod, a GC pause and a noisy VM all
       produce outliers - but a median past the threshold means the whole
       distribution moved, which is what an on-call sees as a p95 alert. #>
    param(
        [Parameter(Mandatory)][hashtable]$Probes,
        [int]$MedianAtLeastMs = 1500,
        [double]$MaxServerErrorRatio = 0.25,
        [string]$Context = 'gateway'
    )
    if (-not (Assert-ProbeHealthy -Probes $Probes -Context $Context)) { return $false }
    # A latency scenario that turned into an error scenario is no longer the
    # one the answer key describes - but "zero 5xx" would be the wrong test.
    # model-proxy ships a noisy base config on purpose (p500 0.01, pStall 0.01
    # against an 8s upstream timeout), so roughly 2% of requests fail on a
    # perfectly healthy lab and a small burst would fail this assertion for
    # reasons that have nothing to do with the fault.
    $errRatio = $Probes.ServerErrors / [double]$Probes.Total
    if ($errRatio -gt $MaxServerErrorRatio) {
        Write-Warning "$Context returned $($Probes.ServerErrors)/$($Probes.Total) 5xx - this scenario's signature is slow-but-succeeding, so something else is wrong"
        return $false
    }
    if ($Probes.MedianMs -lt $MedianAtLeastMs) {
        Write-Warning "signal MISSING: $Context median latency $($Probes.MedianMs)ms (want >= ${MedianAtLeastMs}ms)"
        return $false
    }
    Write-Step "signal present: $Context median latency $($Probes.MedianMs)ms over $($Probes.Total) probes ($($Probes.Ok) succeeded)"
    return $true
}

function Assert-ProbeErrorCode {
    <# For scenarios whose evidence is a specific gateway error code rather
       than a status class - `model_overloaded` (upstream shedding, 429) vs
       `rate_limited` (the per-tenant limiter, also 429), or
       `upstream_timeout` (504) vs `upstream_error` (502). #>
    param(
        [Parameter(Mandatory)][hashtable]$Probes,
        [Parameter(Mandatory)][string]$Code,
        [int]$AtLeast = 1,
        [string]$Context = 'gateway'
    )
    if ($Probes.ClientErrors -gt 0) {
        Write-Warning "$Context probe is misconfigured: $($Probes.ClientErrors)/$($Probes.Total) returned a non-429 4xx (check the bearer token and body, not the fault)"
        return $false
    }
    $n = Get-ProbeCodeCount -Probes $Probes -Code $Code
    if ($n -lt $AtLeast) {
        Write-Warning "signal MISSING: $n/$($Probes.Total) $Context probes returned '$Code' (want >= $AtLeast). Saw: $(Format-ProbeSummary $Probes)"
        return $false
    }
    Write-Step "signal present: $n/$($Probes.Total) $Context probes returned '$Code'"
    return $true
}

# --- the evidence plane -----------------------------------------------------
# Mimir is laptop-side in both modes (the cluster ships to it), so these query
# localhost even when the subject system is on the VM. That separation is the
# point: killing the cluster outright leaves every byte of history queryable.
$MimirUrl = "http://localhost:$($Ports.OBS_MIMIR_PORT)/prometheus/api/v1/query"

function Invoke-MimirQuery {
    <# One instant query against the lab's Mimir. Returns the result array
       (possibly empty), or $null if Mimir could not be reached at all - the
       caller must not read an unreachable evidence plane as "no signal". #>
    param([Parameter(Mandatory)][string]$Query)
    try {
        $resp = Invoke-RestMethod -Uri $MimirUrl -Method Post -TimeoutSec 15 `
            -Headers @{ 'X-Scope-OrgID' = 'anonymous' } -Body @{ query = $Query }
        return @($resp.data.result)
    } catch {
        Write-Warning "Mimir query failed against $MimirUrl - is the observability plane up (obs up)?"
        return $null
    }
}

function Assert-MimirSeries {
    <# Assert the fault reached the metrics an agent will actually read.

       Polls, because the path from a failing request to a queryable sample runs
       through the app's exporter, Alloy and Mimir's ingester - tens of seconds
       on a good day. A scenario asserting on Mimir without a timeout would fail
       purely on scrape timing. #>
    param(
        [Parameter(Mandatory)][string]$Query,
        [double]$MinValue = 0,
        [int]$AtLeast = 1,
        [int]$TimeoutSec = 120,
        [string]$Context = 'mimir'
    )
    $script:AssertMimirCount = 0
    $ok = Wait-Until -TimeoutSec $TimeoutSec -IntervalSec 10 -Condition {
        $rows = Invoke-MimirQuery $Query
        if ($null -eq $rows) { return $false }
        $matching = @($rows | Where-Object { [double]$_.value[1] -ge $MinValue })
        $script:AssertMimirCount = $matching.Count
        return ($matching.Count -ge $AtLeast)
    }
    if ($ok) {
        Write-Step "signal present: $Context matched $($script:AssertMimirCount) series (>= $MinValue) for: $Query"
        return $true
    }
    Write-Warning "signal MISSING: $Context matched $($script:AssertMimirCount) series (want >= $AtLeast at >= $MinValue) within ${TimeoutSec}s for: $Query"
    return $false
}

# --- the CI evidence plane --------------------------------------------------
# ci-shim turns Gitea's webhooks into Prometheus text at /metrics, which Alloy
# scrapes into Mimir. The CI-layer services live on the VM in BOTH modes (the
# laptop never runs a forge), so this is VM-addressed where Mimir above is not.
$CiShimUrl = "http://$($Ports.OBS_VM_HOST):$($Ports.OBS_CI_SHIM_PORT)"

function Get-CiShimCounter {
    <# One counter sample straight from ci-shim, or $null when the series does
       not exist or the shim is unreachable.

       Read at the SOURCE rather than through Mimir on purpose. The pipeline
       alert queries `increase(...[15m])`, so Mimir answers "was there a failure
       recently" - which is still true for fifteen minutes after a scenario is
       reverted, and would make a verify pass on a pipeline that is already
       green again. The raw counter answers the question a verify actually has:
       is the number higher than it was before this inject. Reading it here also
       proves the shim received the workflow_run webhook at all, which is the
       step everything downstream - the alert, the DORA panels - depends on. #>
    param([Parameter(Mandatory)][string]$Name, [hashtable]$Labels = @{})

    $text = ''
    try { $text = (Invoke-WebRequest "$CiShimUrl/metrics" -TimeoutSec 10 -UseBasicParsing).Content }
    catch { Write-Warning "ci-shim /metrics is unreachable at $CiShimUrl - run 'obs ci up'"; return $null }

    foreach ($line in ($text -split "`n")) {
        $line = $line.Trim()
        if (-not $line.StartsWith("$Name{")) { continue }
        $close = $line.LastIndexOf('}')
        if ($close -lt 0) { continue }
        $labelText = $line.Substring($Name.Length + 1, $close - $Name.Length - 1)
        $matched = $true
        foreach ($k in $Labels.Keys) {
            # Anchored on a comma or an end so `result="failure"` cannot be
            # satisfied by some future `result="failure_ignored"`.
            $pattern = '(^|,)' + [regex]::Escape($k) + '="' + [regex]::Escape([string]$Labels[$k]) + '"($|,)'
            if ($labelText -notmatch $pattern) { $matched = $false; break }
        }
        if ($matched) { return [double]$line.Substring($close + 1).Trim() }
    }
    return $null
}
