<#
  15-stale-secret : inject

  The database password is rotated. The Kubernetes Secret still holds the old
  one. Nothing is deployed, no pod restarts, no spec changes - and for the first
  minute nothing happens at all, because every pooled connection was
  authenticated before the rotation and stays valid.

  Then connections reach their max_lifetime, get recycled, and the new ones fail
  with "password authentication failed for user lab". Failures RAMP rather than
  spike, which is the tell: the onset is a credential change at time T, not a
  release, and the reflex answer ("what shipped?") has nothing to find because
  nothing shipped.

  The remediation is the point of the scenario: the fix is to bring the Secret
  forward to the rotated credential, which is a privileged action on a named
  Secret - exactly the scope the on-call agent's `update_db_secret` tool holds.
  The rotated password is written to the lab vault the tool reads, so the agent
  can apply the fix behind one approval without the password ever appearing in
  a transcript.

  Idempotent: rotating twice simply rotates twice; the Secret stays stale either
  way, and the vault always holds the current password.

  No state file. Revert's job is "make the database agree with the Secret
  again", and the Secret - which inject never touches - already says what the
  answer is. Capturing the old password to a file on disk would add a copy of a
  live credential for no gain.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json

if (-not (Assert-K8sMode $meta.id)) { exit 1 }
if (-not (Test-ClusterReachable)) { exit 1 }

$current = Get-SecretValue -Name $meta.k8s.secret -Key $meta.k8s.password_key
if (-not $current) { Write-Warning "cannot read $($meta.k8s.password_key) from secret/$($meta.k8s.secret)"; exit 1 }

# Simple alphabet on purpose: this value is interpolated into an SQL literal
# and into a shell command inside the pod, and a quote character in either
# place would break the injection in a way that looks like a lab fault.
$rotated = "rotated-$([guid]::NewGuid().ToString('N').Substring(0, 12))"

Write-Step "15-stale-secret: rotating the $($meta.k8s.db_user) password in Postgres (the Secret is NOT touched)"
# Over the unix socket inside the pod, which the image trusts - no credential
# needed to change one, which is exactly how a rotation happens in practice.
Invoke-Kubectl @(
    '-n', $SubjectNs, 'exec', 'deploy/postgres', '--',
    'psql', '-U', $meta.k8s.db_user, '-d', $meta.k8s.db_name,
    '-c', "ALTER USER $($meta.k8s.db_user) WITH PASSWORD '$rotated';"
) | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning 'password rotation failed'; exit 1 }

# The lab vault: where a credential store would be, and where the on-call
# agent's update_db_secret tool looks. Written after the rotation, so the file
# never promises a password the database does not have.
$vault = Join-Path $Repo $meta.k8s.vault_file
New-Item -ItemType Directory -Force (Split-Path $vault) | Out-Null
Set-Content -Path $vault -Value $rotated -Encoding ascii
Write-Step "rotated credential written to the lab vault: $($meta.k8s.vault_file)"

Write-Step 'injected. The Secret is now stale; auth failures build over ~60s as pooled connections recycle.'
exit 0
