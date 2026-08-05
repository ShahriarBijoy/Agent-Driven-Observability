<#
  pod-kill : verify

  1. the fault happened  - at least one gateway pod is younger than the kill
                           window, i.e. these are replacements
  2. the lab recovered   - the rollout is Healthy and probes come back clean

  Both halves are needed because this scenario's evidence IS its recovery.
  "Young pods" alone would also describe a crashloop; "healthy" alone would
  describe a lab where nothing happened. Together they say what actually
  happened: the pods were replaced and the service came back.

  It follows that this verify keeps passing for as long as the replacements are
  young - roughly the window below - which is why the scenario declares itself
  transient and the self-test skips the post-revert gate rather than pretending
  a no-op revert could make it fail.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\assert.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$window = [int]$meta.k8s.fresh_pod_window_s
$ok = $true

# --- 1. the fault happened ------------------------------------------------
$now = (Get-Date).ToUniversalTime()
$young = @(Get-AppPods $app | Where-Object {
        $started = $_.status.startTime
        if (-not $started) { return $false }
        (($now - ([datetime]$started).ToUniversalTime()).TotalSeconds -lt $window)
    })
if ($young.Count -gt 0) {
    Write-Step "fault live: $($young.Count) $app pod(s) restarted within the last ${window}s"
} else {
    Write-Warning "fault NOT live: no $app pod is younger than ${window}s - nothing was killed recently"
    $ok = $false
}

# --- 2. the lab recovered -------------------------------------------------
if (-not (Assert-RolloutHealthy -Name $app -TimeoutSec 180)) { $ok = $false }

# One tolerated failure: the lab's own base fault rate (~2% of requests) makes
# a perfect 8-probe burst the exception rather than the rule.
$probes = Measure-GatewayProbes -Count 8
if (-not (Assert-NoServerErrors -Probes $probes -Tolerate 1 -Context 'gateway')) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
