<#
  03-crashloop : verify

  Three assertions, reported separately so a failure says which one broke:
    1. the fault is live   - the Deployment carries the bad env value
    2. its signal exists   - a gateway pod is in CrashLoopBackOff
    3. delivery agrees     - the Rollout is wedged rather than completed

  Assertion 3 is what makes this scenario distinguishable from an ordinary pod
  restart. A crash that resolved would leave a Healthy rollout; a crash caused
  by the new template leaves the canary stuck forever while the stable
  ReplicaSet keeps serving - and that mixed state is the evidence that a
  REVISION, not the environment, is at fault.

  Argo's OutOfSync verdict is deliberately NOT asserted here even though it is
  part of the signature: it depends on Argo's refresh cycle rather than on the
  fault, so gating on it would fail verifies for reasons an on-call would never
  see. The answer key mentions it; the gate does not depend on it.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$key = $meta.k8s.env_var
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$live = Get-DeploymentField -App $app -JsonPath "{.spec.template.spec.containers[0].env[?(@.name=='$key')].value}"
if ($live -eq 'not-a-port') {
    Write-Step "fault live: $app $key=$live"
} else {
    Write-Warning "fault NOT live: $app $key=$live (want not-a-port)"
    $ok = $false
}

# --- 2. the signal exists -------------------------------------------------
if (-not (Assert-PodCondition -App $app -WaitingReason 'CrashLoopBackOff' -TimeoutSec 150)) { $ok = $false }

# --- 3. delivery agrees ---------------------------------------------------
if (-not (Assert-RolloutStuck -Name $app -TimeoutSec 60)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
