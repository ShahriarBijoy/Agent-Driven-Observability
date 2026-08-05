<#
  13-config-drift : revert

  Writes the captured value back and restores the Application's committed sync
  policy, which puts live state and Git back into agreement - the same fix a
  human would apply, and the reason the answer key's acceptable remediation is
  "sync it back, then recommend self-heal".

  Confirmed against Argo, not just against the ConfigMap: this scenario's whole
  claim is about what the gitops engine sees, so a revert that fixed the value
  but left the app OutOfSync would be a lie in exactly the same dimension.

  With no state file this exits 0 having done nothing.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\state.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$state = Get-ScenarioState $meta.id

if ($null -eq $state) {
    Write-Step '13-config-drift: nothing to revert (no inject state)'
    Restore-AutoSync $meta.k8s.argo_app
    exit 0
}

$patchFile = Join-Path $env:TEMP 'obs-13-config-drift-restore.json'
@{ data = @{ $state.key = $state.value } } | ConvertTo-Json -Compress |
    Set-Content -Encoding ascii -Path $patchFile

Write-Step "13-config-drift: restoring $($state.configmap) $($state.key)=$($state.value)"
Invoke-Kubectl @('-n', $SubjectNs, 'patch', "configmap/$($state.configmap)", '--type', 'merge', '--patch-file', $patchFile) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'kubectl patch failed - the drift is still live'; exit 1 }

Restore-AutoSync $meta.k8s.argo_app

$live = (Invoke-Kubectl @('-n', $SubjectNs, 'get', "configmap/$($state.configmap)", '-o', "jsonpath={.data.$($state.key)}") 2>$null)
if ("$live".Trim() -ne $state.value) {
    Write-Warning "revert did not take: $($state.configmap) $($state.key)=$live"
    exit 1
}

if (-not (Assert-ArgoSyncStatus -App $meta.k8s.argo_app -Expect 'Synced' -TimeoutSec 120)) {
    Write-Warning 'the value is restored but Argo still reports drift - check: obs gitops status'
    exit 1
}

Clear-ScenarioState $meta.id
Write-Step '13-config-drift reverted: live matches Git, platform Synced'
exit 0
