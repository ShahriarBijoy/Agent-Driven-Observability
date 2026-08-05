<#
  15-stale-secret : revert

  Rotates the database password back to whatever the Secret currently holds, and
  removes the lab vault file.

  That direction is deliberate. Making the DATABASE match the SECRET is
  idempotent by definition - run it on a healthy lab and it sets the password
  that is already in force - and it stays correct after the on-call agent's own
  remediation, which updates the Secret: revert then simply re-asserts the
  agent's fix instead of fighting it. The 2026-07-23 crashloop test is the
  reason that property is not optional: a revert that races a remediating agent
  makes every remediation test meaningless.

  The vault file goes last, and only after the rotation succeeded - deleting the
  operator's copy of a password that is still live would be the one unrecoverable
  step in this pack.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json

if (-not (Test-ClusterReachable)) { exit 1 }

$secretPw = Get-SecretValue -Name $meta.k8s.secret -Key $meta.k8s.password_key
if (-not $secretPw) { Write-Warning "cannot read $($meta.k8s.password_key) from secret/$($meta.k8s.secret)"; exit 1 }

Write-Step '15-stale-secret: rotating the database password back to what the Secret holds'
Invoke-Kubectl @(
    '-n', $SubjectNs, 'exec', 'deploy/postgres', '--',
    'psql', '-U', $meta.k8s.db_user, '-d', $meta.k8s.db_name,
    '-c', "ALTER USER $($meta.k8s.db_user) WITH PASSWORD '$secretPw';"
) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'password rotation failed - the lab is still broken'; exit 1 }

# Confirm over the pod network, where the password is actually checked.
$psqlCmd = "PGPASSWORD='$secretPw' psql -U $($meta.k8s.db_user) -h $($meta.k8s.db_host) -d $($meta.k8s.db_name) -tAc 'select 1'"
Invoke-Kubectl @('-n', $SubjectNs, 'exec', 'deploy/postgres', '--', 'sh', '-c', $psqlCmd) 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "revert did not take: the Secret's password is still rejected"
    exit 1
}

$vault = Join-Path $Repo $meta.k8s.vault_file
if (Test-Path $vault) {
    Remove-Item -Force $vault
    Write-Step "removed the lab vault file ($($meta.k8s.vault_file))"
}

Write-Step '15-stale-secret reverted: database and Secret agree again'
exit 0
