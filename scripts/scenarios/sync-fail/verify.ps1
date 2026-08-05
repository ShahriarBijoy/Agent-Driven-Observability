<#
  sync-fail : verify

  1. the fault is live  - the invalid manifest is on obs-gitops main
  2. its signal exists  - Argo's sync operation for that revision FAILED

  Assertion 2 asks for a failed operation specifically, not for OutOfSync. A
  manifest that cannot be applied leaves live state untouched and perfectly in
  agreement with the last revision that COULD be applied, so a drift check would
  find nothing. That distinction is the reason this drill exists alongside
  13-config-drift.
#>

. (Join-Path $PSScriptRoot '..\_lib\gitea.ps1')
. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
if (-not (Test-GiteaUp)) { exit 1 }

$work = New-GiteaWorkClone -Repo $meta.git.repo -WorkName 'obs-scn-sync-fail-verify'
if (-not $work) { exit 1 }
$ok = $true
$head = ''

try {
    $content = Get-Content (Join-Path $work $meta.git.file) -Raw
    if ($content -match [regex]::Escape($meta.git.marker)) {
        Write-Step "fault live: '$($meta.git.marker)' is on main in $($meta.git.file)"
    } else {
        Write-Warning "fault NOT live: $($meta.git.file) on main has no '$($meta.git.marker)'"
        exit 1
    }
    $head = (git -C $work rev-parse HEAD).Trim()
} finally {
    Remove-GiteaWork $work
}

# Pinned to the revision that is on main RIGHT NOW. A failed sync stays on the
# Application forever, so an unpinned check would pass on the leftovers of the
# previous run before Argo had even fetched this one.
if (-not (Assert-ArgoSyncFailed -App $meta.k8s.argo_app -Revision $head -TimeoutSec 240)) { $ok = $false }

if ($ok) { exit 0 } else { exit 1 }
