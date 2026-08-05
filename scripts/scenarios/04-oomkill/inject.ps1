<#
  04-oomkill : inject

  The retriever's memory limit drops far below what the runtime needs, so the
  kernel kills the container the moment its working set reaches the new ceiling.
  Restarts climb, the working set flat-tops at exactly the limit, and
  last_terminated_reason reads OOMKilled.

  The discrimination this scenario tests is OOMKilled versus crashed. Both look
  like "the pod keeps restarting" on a pod list; only the termination reason and
  the flat-topped memory graph say the container was killed for exceeding a
  limit somebody lowered, rather than dying of its own bug. The remediation
  follows from that: restore the limit, do not go hunting in the code.

  Retriever is a plain Deployment, so the new template surges a second pod while
  the existing one keeps serving - the SLO stays quiet and the evidence is in
  the pod, not in the error rate.

  Idempotent: the capture happens once, and re-applying the same resources is a
  no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

if (-not (Test-ScenarioState $meta.id)) {
    $req = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].resources.requests.memory}'
    $lim = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].resources.limits.memory}'
    if (-not $req -or -not $lim) {
        Write-Warning "$app has no committed memory requests/limits to lower - has the manifest changed?"
        exit 1
    }
    Save-ScenarioState -Id $meta.id -State @{ app = $app; requests = $req; limits = $lim }
    Write-Step "captured $app memory requests=$req limits=$lim for revert"
}

Disable-AutoSync $meta.k8s.argo_app

Write-Step "04-oomkill: $app memory requests -> $($meta.k8s.requests_memory), limits -> $($meta.k8s.limits_memory)"
Invoke-Kubectl @(
    '-n', $SubjectNs, 'set', 'resources', "deployment/$app",
    "--requests=memory=$($meta.k8s.requests_memory)",
    "--limits=memory=$($meta.k8s.limits_memory)"
) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set resources failed'; exit 1 }

Write-Step 'injected. The new pod is OOMKilled within ~1 min; KubeContainerOOMKilled fires as soon as the restart is scraped.'
exit 0
