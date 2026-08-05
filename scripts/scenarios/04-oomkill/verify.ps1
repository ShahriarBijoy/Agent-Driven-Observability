<#
  04-oomkill : verify

  1. the fault is live  - the Deployment's memory limit is the lowered one
  2. its signal exists  - a retriever container reports OOMKilled

  Assertion 2 reads lastState as well as the current state, because that is
  where the evidence actually lives: the killed container is already gone and
  its replacement is starting, so only lastState.terminated.reason still names
  OOMKilled. An assertion that only looked at the current state would report
  "no signal" on a container being OOM-killed every thirty seconds.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$lim = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].resources.limits.memory}'
if ($lim -eq $meta.k8s.limits_memory) {
    Write-Step "fault live: $app memory limit=$lim"
} else {
    Write-Warning "fault NOT live: $app memory limit=$lim (want $($meta.k8s.limits_memory))"
    $ok = $false
}

# --- 2. the signal exists -------------------------------------------------
if (-not (Assert-PodCondition -App $app -TerminatedReason 'OOMKilled' -TimeoutSec 180)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
