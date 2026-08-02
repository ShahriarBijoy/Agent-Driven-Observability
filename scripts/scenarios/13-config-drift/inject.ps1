<#
  13-config-drift : inject

  Somebody edits live cluster state directly. The subject-telemetry ConfigMap's
  OTLP endpoint is changed to a host that does not exist - the kind of "quick
  fix" that never makes it back into Git.

  The sting is that NOTHING BREAKS. Pods read this ConfigMap at startup, so the
  running services keep exporting telemetry to the right place and every
  dashboard stays green. The damage is latent: the next restart, whenever it
  comes and for whatever unrelated reason, silently ships a service with no
  telemetry. That is the lesson - drift is a delivery incident that has not
  happened yet, and the only thing that reports it is the gitops engine.

  So this scenario's signal is Argo's verdict, not an SLO: platform flips
  OutOfSync with a one-key live-vs-desired diff, and the on-out-of-sync webhook
  is what pages. `automated` is removed for the inject window because Argo CD v3
  re-syncs on drift whenever the target revision is newer than the last
  attempted sync, which would heal the fault before anyone saw it.

  Idempotent: the capture happens once, and re-patching the same value is a
  no-op.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$cm = $meta.k8s.configmap
$key = $meta.k8s.key

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

if (-not (Test-ScenarioState $meta.id)) {
    $original = (Invoke-Kubectl @('-n', $SubjectNs, 'get', "configmap/$cm", '-o', "jsonpath={.data.$key}") 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $original) {
        Write-Warning "$cm has no $key - is the platform app synced?"
        exit 1
    }
    Save-ScenarioState -Id $meta.id -State @{ configmap = $cm; key = $key; value = "$original".Trim() }
    Write-Step "captured $cm $key=$original for revert"
}

Disable-AutoSync $meta.k8s.argo_app

# --patch-file, not -p: PS 5.1 strips embedded double quotes out of native
# command arguments, so inline JSON reaches kubectl unparseable.
$patchFile = Join-Path $env:TEMP 'obs-13-config-drift.json'
@{ data = @{ $key = $meta.k8s.drifted_value } } | ConvertTo-Json -Compress |
    Set-Content -Encoding ascii -Path $patchFile

Write-Step "13-config-drift: $cm $key -> $($meta.k8s.drifted_value)"
Invoke-Kubectl @('-n', $SubjectNs, 'patch', "configmap/$cm", '--type', 'merge', '--patch-file', $patchFile) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl patch failed'; exit 1 }

Write-Step 'injected. Nothing breaks - platform flips OutOfSync and the drift webhook is the only symptom.'
exit 0
