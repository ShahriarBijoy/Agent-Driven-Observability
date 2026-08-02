<#
  06-probe-regression : verify

  1. the fault is live  - the Deployment's readiness path is the broken one
  2. its signal exists  - a gateway pod is Running but not Ready
  3. delivery agrees    - the Rollout is wedged rather than completed

  Assertion 2 is why Get-PodFaultEvidence tracks `started` separately from
  `ready`: a pod that has not started yet is also not ready, and reporting that
  as a probe regression would let a slow image pull pass for this scenario.
  Started-and-not-ready is the specific state a wrong probe path produces.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$live = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].readinessProbe.httpGet.path}'
if ($live -eq $meta.k8s.bad_path) {
    Write-Step "fault live: $app readinessProbe path=$live"
} else {
    Write-Warning "fault NOT live: $app readinessProbe path=$live (want $($meta.k8s.bad_path))"
    $ok = $false
}

# --- 2. the signal exists -------------------------------------------------
if (-not (Assert-PodCondition -App $app -RunningNotReady -TimeoutSec 120)) { $ok = $false }

# --- 3. delivery agrees ---------------------------------------------------
if (-not (Assert-RolloutStuck -Name $app -TimeoutSec 60)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
