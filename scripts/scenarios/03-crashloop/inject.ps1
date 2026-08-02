<#
  03-crashloop : inject

  A revision ships with an env value the service cannot parse, and the container
  dies before it ever binds a port. GATEWAY_PORT goes from "8080" to
  "not-a-port"; the gateway's zod config schema throws at module load, the
  process exits 1, and Kubernetes backs it off into CrashLoopBackOff.

  The signature the agent has to read:
    - one pod in CrashLoopBackOff, a startup parse error naming the env key
    - the rollout is wedged, so the change never completed
    - gateway is a Rollout: the canary takes one pod's slot and the three
      stable pods keep serving, so this is NOT an outage - the SLO barely moves
    - Argo flags the app OutOfSync, because the mutation is out-of-band

  The correct diagnosis is "revision N introduced a bad env value; it dies at
  startup", and the remediation is to go back to the previous template.

  Two deviations from the failure matrix, both deliberate:

  1. TARGET. The matrix puts the crashloop on gateway and the latency drill on
     retriever; this pack keeps gateway here (per the Phase 12 plan's
     retargeting) which makes it a Rollout-backed scenario - partial blast
     radius, wedged canary, stable pods serving. That is a strictly richer
     question than killing the single-replica retriever.

  2. ENV KEY. The matrix names DATABASE_URL. Gateway takes DATABASE_URL from a
     Secret via envFrom, so injecting it means ADDING a container env entry -
     and Argo's diff ignores fields git never declared. Verified live: a live
     added env var left the Application reporting Synced for minutes, and a
     manual sync with phase=Succeeded did not remove it. Patching GATEWAY_PORT
     instead modifies a value git DOES declare, so OutOfSync appears and the
     signature matches what the answer key claims.

  Idempotent: the state capture happens once, and re-setting the same env value
  is a no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$key = $meta.k8s.env_var

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

# Capture BEFORE mutating, and only once - a second inject must not record the
# faulted value as the thing to restore.
if (-not (Test-ScenarioState $meta.id)) {
    $original = Get-DeploymentField -App $app -JsonPath "{.spec.template.spec.containers[0].env[?(@.name=='$key')].value}"
    if (-not $original) {
        Write-Warning "$app has no committed $key env value to corrupt - has the manifest changed?"
        exit 1
    }
    Save-ScenarioState -Id $meta.id -State @{ app = $app; key = $key; value = $original }
    Write-Step "captured $app $key=$original for revert"
}

# Argo must not heal the drift: with `automated` present, v3 re-syncs on drift
# whenever the target revision is newer than the last attempted sync. Removing
# the policy for the inject window leaves OutOfSync visible, which is part of
# the signature.
Disable-AutoSync $meta.k8s.argo_app

Write-Step "03-crashloop: $app $key -> not-a-port (config parse fails at startup)"
Invoke-Kubectl @('-n', $SubjectNs, 'set', 'env', "deployment/$app", "$key=not-a-port") | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set env failed'; exit 1 }

Write-Step 'injected. The canary pod crashloops within ~1 min; KubePodCrashLooping holds 3m before firing.'
exit 0
