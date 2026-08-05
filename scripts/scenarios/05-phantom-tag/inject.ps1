<#
  05-phantom-tag : inject

  The gateway is pointed at an image tag that does not exist in the registry -
  the same repository, a tag CI never built. The kubelet cannot pull it, the new
  pod sits in ErrImagePull and then ImagePullBackOff, and the rollout wedges
  while the old pods keep serving.

  This is the delivery question the pack asks that has nothing to do with the
  application: everything downstream of the bad tag behaved perfectly. Git is
  fine, the sync succeeded, the manifest is exactly what was asked for - the
  image simply is not there. The agent is expected to cross-check the tag
  against what CI actually built rather than reading the app's own logs, of
  which there are none, because the container never started.

  Only the TAG is replaced; the repository is kept exactly as deployed, so the
  failure is unambiguously "this tag does not exist" and not "this registry is
  unreachable" - two very different incidents.

  Idempotent: the capture happens once, and re-setting the same image is a
  no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

if (-not (Test-ScenarioState $meta.id)) {
    $image = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].image}'
    if (-not $image) { Write-Warning "cannot read $app's current image"; exit 1 }
    Save-ScenarioState -Id $meta.id -State @{ app = $app; image = $image }
    Write-Step "captured $app image=$image for revert"
}

$state = Get-ScenarioState $meta.id
# Split on the LAST colon: the registry address carries one too
# (obs-registry:5010/gateway:sha), so splitting on the first would rewrite the
# port and turn a missing-tag incident into a missing-registry one.
$idx = $state.image.LastIndexOf(':')
if ($idx -lt 0) { Write-Warning "image '$($state.image)' has no tag to replace"; exit 1 }
$phantom = "$($state.image.Substring(0, $idx)):$($meta.k8s.phantom_tag)"

Disable-AutoSync $meta.k8s.argo_app

Write-Step "05-phantom-tag: $app image -> $phantom (a tag CI never built)"
Invoke-Kubectl @('-n', $SubjectNs, 'set', 'image', "deployment/$app", "$app=$phantom") | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl set image failed'; exit 1 }

Write-Step 'injected. ErrImagePull within seconds, ImagePullBackOff shortly after; KubeContainerWaiting holds 3m.'
exit 0
