<#
  13-config-drift : verify

  1. the fault is live  - the live ConfigMap carries the drifted value
  2. its signal exists  - Argo reports the platform Application OutOfSync

  This is the one scenario whose signal IS the gitops verdict, so unlike the
  pod-template scenarios it does gate on Argo - and the assertion asks Argo to
  re-diff rather than waiting for its own reconcile loop, so the result reflects
  the fault instead of the polling interval.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$cm = $meta.k8s.configmap
$key = $meta.k8s.key
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$live = (Invoke-Kubectl @('-n', $SubjectNs, 'get', "configmap/$cm", '-o', "jsonpath={.data.$key}") 2>$null)
if ("$live".Trim() -eq $meta.k8s.drifted_value) {
    Write-Step "fault live: $cm $key=$live"
} else {
    Write-Warning "fault NOT live: $cm $key=$live (want $($meta.k8s.drifted_value))"
    $ok = $false
}

# --- 2. the signal exists -------------------------------------------------
if (-not (Assert-ArgoSyncStatus -App $meta.k8s.argo_app -Expect 'OutOfSync' -TimeoutSec 120)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
