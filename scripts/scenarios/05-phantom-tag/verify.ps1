<#
  05-phantom-tag : verify

  1. the fault is live  - the Deployment references the phantom tag
  2. its signal exists  - a gateway pod is stuck on the image pull
  3. delivery agrees    - the Rollout is wedged rather than completed

  The pull failure is matched as ErrImagePull OR ImagePullBackOff: the kubelet
  passes through the first before backing off into the second, so which one is
  visible depends entirely on when the assertion looked. Pinning it to one
  would make this verify a stopwatch rather than a test.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$image = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].image}'
if ($image -like "*:$($meta.k8s.phantom_tag)") {
    Write-Step "fault live: $app image=$image"
} else {
    Write-Warning "fault NOT live: $app image=$image (want the :$($meta.k8s.phantom_tag) tag)"
    $ok = $false
}

# --- 2. the signal exists -------------------------------------------------
if (-not (Assert-PodCondition -App $app -WaitingReason @('ErrImagePull', 'ImagePullBackOff') -TimeoutSec 120)) { $ok = $false }

# --- 3. delivery agrees ---------------------------------------------------
if (-not (Assert-RolloutStuck -Name $app -TimeoutSec 60)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
