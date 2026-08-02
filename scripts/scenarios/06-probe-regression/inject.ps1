<#
  06-probe-regression : inject

  A new revision ships a readiness probe pointing at a path that does not exist.
  The container starts fine and would serve traffic perfectly - but it never
  passes readiness, so it never joins the Service's endpoints and the rollout
  sits Progressing forever while the previous ReplicaSet carries every request.

  This is the quietest scenario in the pack, and that is the point. Nothing
  crashes, nothing 5xxes, the error budget barely moves, and the only symptoms
  are structural: pods Running but not Ready, endpoints unchanged, a rollout
  that has been "in progress" far longer than a rollout takes. An agent that
  reaches for the SLO dashboards finds nothing wrong; the answer is in the
  delivery state, and the fix is a probe path, not application code.

  The patch targets the probe path only, leaving port and thresholds alone, so
  the diff an investigator sees is one line.

  Idempotent: the capture happens once, and re-applying the same path is a
  no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$app = $meta.k8s.app
$probePath = '/spec/template/spec/containers/0/readinessProbe/httpGet/path'

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

if (-not (Test-ScenarioState $meta.id)) {
    $original = Get-DeploymentField -App $app -JsonPath '{.spec.template.spec.containers[0].readinessProbe.httpGet.path}'
    if (-not $original) { Write-Warning "$app has no readinessProbe httpGet path to break"; exit 1 }
    Save-ScenarioState -Id $meta.id -State @{ app = $app; path = $original }
    Write-Step "captured $app readinessProbe path=$original for revert"
}

Disable-AutoSync $meta.k8s.argo_app

# --patch-file, not -p: PS 5.1 strips the embedded double quotes out of inline
# JSON passed to a native command, which turns a json patch into a parse error.
#
# The brackets are added by hand because ConvertTo-Json serialises a
# one-element array as a bare OBJECT, and a json patch must be a LIST of
# operations - kubectl rejected it with "cannot unmarshal object into Go value
# of type []handlers.jsonPatchOp".
$patchFile = Join-Path $env:TEMP 'obs-06-probe-regression.json'
$op = @{ op = 'replace'; path = $probePath; value = $meta.k8s.bad_path } | ConvertTo-Json -Compress
Set-Content -Encoding ascii -Path $patchFile -Value "[$op]"

Write-Step "06-probe-regression: $app readinessProbe path -> $($meta.k8s.bad_path)"
Invoke-Kubectl @('-n', $SubjectNs, 'patch', "deployment/$app", '--type=json', '--patch-file', $patchFile) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl patch failed'; exit 1 }

Write-Step 'injected. The new pod runs but never goes Ready; KubePodNotReady holds 4m before firing.'
exit 0
