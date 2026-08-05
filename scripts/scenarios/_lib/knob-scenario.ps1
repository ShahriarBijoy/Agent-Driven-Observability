<#
  The shared injector for chaos-plane scenarios.

  Seven of this pack's scenarios (01-latency, 02-error-storm and the retained
  drills timeout, outage, brownout, flaky, throttle) differ only in which knobs
  they set and which signal that produces. Writing seven near-identical scripts
  would mean seven places for the retriever-vs-model-proxy split, the fan-out
  and the revert confirmation to drift apart, so the mechanism lives here and
  each scenario contributes a `chaos` block in its scenario.json plus a header
  comment saying what the fault means.

      "chaos": {
        "service": "retriever",                 // model-proxy | retriever
        "knobs":   { "errorRate": 0.3 },        // the override to merge
        "confirm": { "knob": "errorRate", "at_least": 0.3 },   // or "equal_to"
        "signal":  { "kind": "server-errors", "at_least": 1, "probes": 12 }
      }

  `confirm` is what proves the fault is live; `signal` is what proves it reached
  the telemetry an on-call reads. Signal kinds:

    server-errors  N probes must come back 5xx        (error storm, outage)
    slow           probes must SUCCEED, median >= ms   (latency)
    error-code     N probes carry a named error code   (timeout, throttle)
    knob-only      no probe assertion - see below      (flaky)

  `knob-only` is a deliberate, documented weakness rather than an oversight. The
  flaky drill's fault is a per-request chance of entering a 45-second bad
  window; between windows the service is genuinely healthy, so any probe burst
  short enough to run inside a verify would report "no signal" on a correctly
  injected fault. It is a drill, not an exam question, and the exam never
  depends on it.
#>

. (Join-Path $PSScriptRoot 'chaos-plane.ps1')
. (Join-Path $PSScriptRoot 'assert.ps1')

function Get-ScenarioMeta {
    <# The scenario.json sitting next to a scenario's scripts. Takes the
       directory so a step script can pass $PSScriptRoot and stay unaware of
       both its own id and the pack's layout. #>
    param([Parameter(Mandatory)][string]$Dir)
    $f = Join-Path $Dir 'scenario.json'
    if (-not (Test-Path $f)) { throw "no scenario.json in $Dir" }
    return (Get-Content $f -Raw | ConvertFrom-Json)
}

function ConvertTo-KnobTable {
    <# ConvertFrom-Json hands back a PSCustomObject; Set-ChaosKnobs wants a
       hashtable. Booleans must survive as booleans (retriever's `outage` is
       one) - a stringified 'True' fails the service's zod schema with a 422. #>
    param([Parameter(Mandatory)]$Knobs)
    $h = @{}
    foreach ($p in $Knobs.PSObject.Properties) { $h[$p.Name] = $p.Value }
    return $h
}

function Assert-KnobConfirm {
    <# The `confirm` block, applied. Shared by inject (did it take?) and verify
       (is it still live?) so the two can never disagree about what "injected"
       means. #>
    param([Parameter(Mandatory)]$Meta)
    $c = $Meta.chaos.confirm
    if ($null -eq $c) { throw "$($Meta.id): scenario.json has no chaos.confirm block" }
    if ($null -ne $c.at_least) {
        return (Assert-ChaosKnob -Service $Meta.chaos.service -Knob $c.knob -AtLeast $c.at_least)
    }
    # `equal_to`, not `equals`: a JSON key named "equals" collides with the
    # Equals() method every PSObject inherits, and property-vs-method
    # resolution is not a coin worth flipping inside an assertion.
    return (Assert-ChaosKnob -Service $Meta.chaos.service -Knob $c.knob -EqualTo $c.equal_to)
}

function Invoke-KnobInject {
    <# inject.ps1 for a chaos-plane scenario. Idempotent: merging the same
       override again is a no-op on an already-injected lab. #>
    param([Parameter(Mandatory)][string]$Dir)
    $meta = Get-ScenarioMeta $Dir
    $svc = $meta.chaos.service
    if (-not (Test-ChaosPlaneReachable $svc)) { return $false }

    $knobs = ConvertTo-KnobTable $meta.chaos.knobs
    $desc = ($knobs.Keys | ForEach-Object { "$_=$($knobs[$_])" }) -join ' '
    Write-Step "$($meta.id): $svc <- $desc"
    Set-ChaosKnobs -Service $svc -Knobs $knobs | Out-Null

    # Trust the plane's own snapshot, not the HTTP status: a 200 with the knob
    # unset would leave the exam grading an agent on a fault that never
    # happened.
    return (Assert-KnobConfirm $meta)
}

function Invoke-KnobVerify {
    <# verify.ps1 for a chaos-plane scenario: the fault is live AND its signal
       exists, reported separately so a failure says which half broke. #>
    param([Parameter(Mandatory)][string]$Dir)
    $meta = Get-ScenarioMeta $Dir
    $ok = Assert-KnobConfirm $meta

    $sig = $meta.chaos.signal
    $probeCount = if ($sig.probes) { [int]$sig.probes } else { 12 }
    switch ($sig.kind) {
        'server-errors' {
            $atLeast = if ($sig.at_least) { [int]$sig.at_least } else { 1 }
            $probes = Measure-GatewayProbes -Count $probeCount
            if (-not (Assert-ServerErrors -Probes $probes -AtLeast $atLeast -Context 'gateway')) { $ok = $false }
        }
        'slow' {
            # Each probe takes as long as the injected latency, so these bursts
            # are deliberately small; the timeout must clear the fault's own
            # ceiling or every probe would look like a client-side timeout.
            $probes = Measure-GatewayProbes -Count $probeCount -TimeoutSec 30 -DelayMs 0
            if (-not (Assert-SlowResponses -Probes $probes -MedianAtLeastMs ([int]$sig.median_ms))) { $ok = $false }
        }
        'error-code' {
            $atLeast = if ($sig.at_least) { [int]$sig.at_least } else { 1 }
            $probes = Measure-GatewayProbes -Count $probeCount -TimeoutSec 30
            if (-not (Assert-ProbeErrorCode -Probes $probes -Code $sig.code -AtLeast $atLeast)) { $ok = $false }
        }
        'knob-only' {
            Write-Host "      (signal assertion skipped: $($sig.note))"
        }
        default { throw "$($Meta.id): unknown chaos.signal.kind '$($sig.kind)'" }
    }
    return $ok
}

function Invoke-KnobRevert {
    <# revert.ps1 for a chaos-plane scenario. Idempotent by construction -
       DELETE on a clean plane is a no-op - so it is safe on a healthy lab and
       safe to run twice when a remediating agent already cleared it.

       Nothing here touches a pod spec, so there is no Argo state to restore. #>
    param([Parameter(Mandatory)][string]$Dir)
    $meta = Get-ScenarioMeta $Dir
    $svc = $meta.chaos.service
    if (-not (Test-ChaosPlaneReachable $svc)) { return $false }
    Clear-ChaosKnobs -Service $svc | Out-Null
    # Confirm rather than assume: a revert that silently failed would poison
    # every scenario that follows it in an exam run.
    return (Assert-ChaosCleared -Service $svc)
}
