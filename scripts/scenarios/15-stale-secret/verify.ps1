<#
  15-stale-secret : verify

  1. the fault is live  - the password in the Secret no longer authenticates
  2. its signal exists  - the gateway is returning 5xx as connections recycle

  Assertion 1 tests the credential the APPLICATIONS hold, which is the whole
  claim of the scenario: the database is fine, the pods are fine, and the only
  broken thing is the agreement between them. The check connects over the pod
  network rather than the loopback interface, because the postgres image trusts
  loopback - a check over 127.0.0.1 succeeds with any password at all and would
  have reported this fault as absent every single time.

  Assertion 2 polls for up to two and a half minutes. Pooled connections live 60
  seconds, so an immediate probe legitimately sees a perfectly healthy gateway;
  that delay is the scenario's signature, not a flaw in the test.
#>

. (Join-Path $PSScriptRoot '..\_lib\k8s.ps1')
. (Join-Path $PSScriptRoot '..\_lib\assert.ps1')

$meta = Get-Content (Join-Path $PSScriptRoot 'scenario.json') -Raw | ConvertFrom-Json
$ok = $true

# --- 1. the fault is live -------------------------------------------------
$secretPw = Get-SecretValue -Name $meta.k8s.secret -Key $meta.k8s.password_key
if (-not $secretPw) {
    Write-Warning "cannot read $($meta.k8s.password_key) from secret/$($meta.k8s.secret)"
    $ok = $false
} else {
    $psqlCmd = "PGPASSWORD='$secretPw' psql -U $($meta.k8s.db_user) -h $($meta.k8s.db_host) -d $($meta.k8s.db_name) -tAc 'select 1'"
    Invoke-Kubectl @('-n', $SubjectNs, 'exec', 'deploy/postgres', '--', 'sh', '-c', $psqlCmd) 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Warning "fault NOT live: the Secret's password still authenticates - nothing was rotated"
        $ok = $false
    } else {
        Write-Step "fault live: the Secret's password is rejected by Postgres"
    }
}

# --- 2. the signal exists -------------------------------------------------
$script:StaleSecretProbes = $null
$seen = Wait-Until -TimeoutSec 150 -IntervalSec 15 -Condition {
    $script:StaleSecretProbes = Measure-GatewayProbes -Count 6 -DelayMs 100
    return ($script:StaleSecretProbes.ServerErrors -ge 2)
}
if ($seen) {
    Write-Step "signal present: $($script:StaleSecretProbes.ServerErrors)/6 gateway probes returned 5xx"
} else {
    Write-Warning "signal MISSING: gateway is still serving after 150s. Saw: $(Format-ProbeSummary $script:StaleSecretProbes)"
    $ok = $false
}

if ($ok) { exit 0 } else { exit 1 }
