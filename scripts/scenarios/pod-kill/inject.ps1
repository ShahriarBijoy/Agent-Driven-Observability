<#
  pod-kill : inject   (retained drill, not an exam question)

  Every gateway pod is deleted mid-traffic. Kubernetes reschedules them, the
  error rate blips for a few seconds, and the lab is healthy again before anyone
  can open a dashboard.

  What it rehearses is the opposite of every other scenario here: the correct
  answer is "nothing is wrong". A transient pod restart with full recovery is
  not a regression, and an agent that invents a root cause for it - a bad
  deploy, a memory leak, a dependency - is failing in the way that costs real
  on-call teams the most time.

  This is the pack's only TRANSIENT scenario: the fault is over the moment it
  is injected, so there is nothing for revert to undo and the self-test skips
  its post-revert gate (see _lib/pack.ps1). Everything else in the contract
  still applies.

  Not an exam question: the exam runner waits for an alert and grades a
  diagnosis, and this scenario deliberately produces neither.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

# No Disable-AutoSync: deleting a pod changes no spec, so there is no drift for
# Argo to see - which is itself part of the signature (infra event, not a
# delivery event).
Write-Step "pod-kill: deleting every $app pod"
Invoke-Kubectl @('-n', $SubjectNs, 'delete', 'pod', '-l', "app=$app") | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning "kubectl delete pod failed"; exit 1 }

Write-Step 'injected. Expect a short 5xx blip, then full recovery within ~30s.'
exit 0
