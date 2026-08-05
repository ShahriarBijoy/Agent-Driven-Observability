<#
  The /admin/chaos control planes (ADR-005).

  Runtime knobs, not env vars or restarts: a partial patch is merged into the
  service's effective fault config per request. Because nothing in a pod spec
  changes, these injections are invisible to Argo by design - which is part of
  the signature the agent has to read (app-layer fault, infra untouched, no
  deploy).

  Shape differs by service and both are handled here:
    model-proxy  GET returns { base, override, effective }; knobs are
                 p500, p429, pStall, stallMs, latencyBaseMs, latencyGammaShape,
                 latencyGammaScaleMs, latencyMaxMs, pBadMinute, badMinuteMs,
                 badMinuteMultiplier, faultsEnabled
    retriever    GET returns the flat state; knobs are outage, errorRate

  ## Why this talks to PODS, not to the service address

  The override is module-level state inside one process. model-proxy runs FOUR
  replicas, so a POST through the gateway's /chaos/* ingress lands on exactly
  one of them: three quarters of the traffic would stay healthy, and a
  follow-up GET would read a different pod and report no chaos at all. An exam
  built on that would grade agents on a fault that was only a quarter present
  and unverifiable either way.

  So in k8s mode every operation fans out over all pods of the service, via
  `kubectl exec ... bun -e fetch(localhost)`. The request never leaves the pod,
  which also sidesteps the ingress. In compose mode there is one container per
  service and the published port is addressed directly.

  The JS handed to `bun -e` uses single quotes and JSON.stringify only - PS 5.1
  strips embedded double quotes out of native-command arguments, so an inline
  JSON literal would arrive at kubectl mangled.
#>

. (Join-Path $PSScriptRoot 'env.ps1')
. (Join-Path $PSScriptRoot 'k8s.ps1')

# In-pod listen ports (the containers publish nothing; compose maps these).
$ChaosPort = @{ 'model-proxy' = 8083; 'retriever' = 8082 }

function ConvertTo-JsLiteral {
    <# A knob hashtable as a JS object literal: @{ errorRate = 0.3 } ->
       {errorRate:0.3}. Numbers and booleans only, which every chaos knob is,
       so nothing here needs a quote character that PS would eat. #>
    param([Parameter(Mandatory)][hashtable]$Knobs)
    $parts = foreach ($k in $Knobs.Keys) {
        $v = $Knobs[$k]
        if ($v -is [bool]) { "${k}:$(if ($v) { 'true' } else { 'false' })" }
        else { "${k}:$([string]([double]$v))" }
    }
    return "{$($parts -join ',')}"
}

function Get-ChaosTargets {
    <# What to talk to: pod names in k8s mode, one pseudo-target 'compose' in
       compose mode. An empty array means the service has no running pods, which
       callers must report rather than silently treat as "no chaos". #>
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    if ($Mode -ne 'k8s') { return @('compose') }
    return @(Get-AppPods $Service | ForEach-Object { $_.metadata.name })
}

function Invoke-ChaosRequest {
    <# One request against one target. Returns the parsed response, or $null if
       the call failed. #>
    param(
        [Parameter(Mandatory)][string]$Service,
        [Parameter(Mandatory)][string]$Target,
        [ValidateSet('GET', 'POST', 'DELETE')][string]$Method = 'GET',
        [hashtable]$Knobs
    )
    if ($Target -eq 'compose') {
        $uri = "$($ChaosBase[$Service])/admin/chaos"
        try {
            if ($Method -eq 'POST') {
                return Invoke-RestMethod -Method Post -Uri $uri -TimeoutSec 10 `
                    -Body ($Knobs | ConvertTo-Json -Compress) -ContentType 'application/json'
            }
            return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec 10
        } catch { return $null }
    }

    $url = "http://localhost:$($ChaosPort[$Service])/admin/chaos"
    if ($Method -eq 'POST') {
        $js = "const r=await fetch('$url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify($(ConvertTo-JsLiteral $Knobs))});console.log(await r.text())"
    } elseif ($Method -eq 'DELETE') {
        $js = "const r=await fetch('$url',{method:'DELETE'});console.log(await r.text())"
    } else {
        $js = "const r=await fetch('$url');console.log(await r.text())"
    }
    $out = (Invoke-Kubectl @('-n', $SubjectNs, 'exec', $Target, '--', 'bun', '-e', $js) 2>$null) -join ''
    if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
    try { return ($out | ConvertFrom-Json) } catch { return $null }
}

function Get-ChaosSnapshots {
    <# One entry per target: @{ Target; Override; Effective }.

       Both response shapes are normalised here. model-proxy answers with
       { base, override, effective }; retriever answers with its flat state,
       which is simultaneously its override and what takes effect. #>
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    $out = @()
    foreach ($t in (Get-ChaosTargets $Service)) {
        $resp = Invoke-ChaosRequest -Service $Service -Target $t -Method GET
        if ($null -eq $resp) { continue }
        if ($null -ne $resp.effective) {
            $out += @{ Target = $t; Override = $resp.override; Effective = $resp.effective }
        } else {
            $out += @{ Target = $t; Override = $resp; Effective = $resp }
        }
    }
    return $out
}

function Set-ChaosKnobs {
    <# Merge a partial override into EVERY instance of the service. Returns the
       post-write snapshots so callers can confirm the plane took it rather than
       trusting an HTTP 200. #>
    param(
        [Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service,
        [Parameter(Mandatory)][hashtable]$Knobs
    )
    $targets = @(Get-ChaosTargets $Service)
    if ($targets.Count -eq 0) { Write-Warning "no $Service instances to inject into"; return @() }
    foreach ($t in $targets) {
        $resp = Invoke-ChaosRequest -Service $Service -Target $t -Method POST -Knobs $Knobs
        if ($null -eq $resp) { Write-Warning "chaos POST failed on $Service/$t" }
    }
    return (Get-ChaosSnapshots $Service)
}

function Clear-ChaosKnobs {
    <# Idempotent: DELETE on an already-clean plane is a no-op 200. Every
       instance, for the same reason inject fans out - a revert that missed one
       pod leaves a quarter of the traffic still faulty into the next scenario. #>
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    foreach ($t in (Get-ChaosTargets $Service)) {
        $resp = Invoke-ChaosRequest -Service $Service -Target $t -Method DELETE
        if ($null -eq $resp) { Write-Warning "chaos DELETE failed on $Service/$t" }
    }
    return (Get-ChaosSnapshots $Service)
}

function Test-ChaosPlaneReachable {
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    # @() around every snapshot call, without exception: PS unrolls a
    # one-element array into the element itself, and .Count on a lone hashtable
    # returns its KEY count - which is how a single-replica retriever first
    # reported "cleared on all 3 instances".
    $snaps = @(Get-ChaosSnapshots $Service)
    if ($snaps.Count -eq 0) {
        Write-Warning "$Service chaos plane unreachable (mode=$Mode) - is the lab up?"
        return $false
    }
    return $true
}

function Get-ChaosKnobValues {
    <# One knob's effective value on every instance. $null entries mean the knob
       is absent from that instance's config. #>
    param(
        [Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service,
        [Parameter(Mandatory)][string]$Knob
    )
    $vals = @()
    foreach ($s in @(Get-ChaosSnapshots $Service)) {
        $prop = $s.Effective.PSObject.Properties[$Knob]
        if ($null -eq $prop) { $vals += $null } else { $vals += $prop.Value }
    }
    return $vals
}

function Assert-ChaosKnob {
    <# The fault-is-live half of a chaos-plane scenario's verify: EVERY instance
       must carry the knob. Anything less is a partially injected fault, which
       is worse than none - the signal is diluted by a factor nobody recorded,
       and the answer key describes a fault the lab only half had. #>
    param(
        [Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service,
        [Parameter(Mandatory)][string]$Knob,
        $AtLeast,
        $EqualTo
    )
    $vals = @(Get-ChaosKnobValues -Service $Service -Knob $Knob)
    if ($vals.Count -eq 0) {
        Write-Warning "fault NOT live: no $Service instance answered the chaos plane"
        return $false
    }
    $bad = @()
    foreach ($v in $vals) {
        if ($null -eq $v) { $bad += '(absent)'; continue }
        if ($null -ne $AtLeast -and [double]$v -lt [double]$AtLeast) { $bad += "$v"; continue }
        if ($null -ne $EqualTo -and "$v" -ne "$EqualTo") { $bad += "$v"; continue }
    }
    $want = if ($null -ne $AtLeast) { ">= $AtLeast" } else { "= $EqualTo" }
    if ($bad.Count -gt 0) {
        Write-Warning "fault NOT live: $Service $Knob is $($vals -join ', ') on $($vals.Count) instance(s), want $want everywhere"
        return $false
    }
    Write-Step "fault live: $Service $Knob = $($vals -join ', ') on $($vals.Count) instance(s)"
    return $true
}

function Assert-ChaosCleared {
    <# The revert gate. Reads the OVERRIDE, not the effective config: model-proxy
       ships a deliberately noisy base (p500 0.01, pStall 0.01) so "effective
       fault rate is zero" is never true there and would fail a perfectly good
       revert. What must be zero is what this pack added. #>
    param([Parameter(Mandatory)][ValidateSet('model-proxy', 'retriever')][string]$Service)
    $snaps = @(Get-ChaosSnapshots $Service)
    if ($snaps.Count -eq 0) {
        Write-Warning "cannot confirm the revert: no $Service instance answered the chaos plane"
        return $false
    }
    $dirty = @()
    foreach ($s in $snaps) {
        foreach ($p in $s.Override.PSObject.Properties) {
            # Retriever's flat state is always present; only non-zero values
            # there mean chaos is still applied.
            if ($p.Value -eq 0 -or $p.Value -eq $false) { continue }
            $dirty += "$($s.Target): $($p.Name)=$($p.Value)"
        }
    }
    if ($dirty.Count -gt 0) {
        Write-Warning "revert did not take: $($dirty -join '; ')"
        return $false
    }
    Write-Step "$Service chaos cleared on all $($snaps.Count) instance(s)"
    return $true
}
