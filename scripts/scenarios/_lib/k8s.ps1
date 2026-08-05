<#
  Cluster mechanics for the scenario pack, plus the assertions that read
  cluster state.

  The split with assert.ps1 is by vantage point, not by topic: assert.ps1 looks
  at the lab from OUTSIDE (probe the gateway, query Mimir) and answers "did the
  fault produce evidence an on-call would see"; this file looks from INSIDE the
  cluster (kubectl) and answers "is the mutation actually there". A verify.ps1
  for a k8s scenario normally needs one of each.

  Every kubectl call goes through the operator kubeconfig minted by `obs k8s
  up`. The agents never touch it - they get the scoped agent-ro /
  agent-remediate configs instead.
#>

. (Join-Path $PSScriptRoot 'env.ps1')

# The namespace every subject workload lives in. One constant, because a typo
# here reads as "no pods found" - which a verify would report as "fault gone".
$SubjectNs = 'subject'

function Get-LabKubeconfig {
    # The read-write operator kubeconfig minted by `obs k8s up`. Agents get the
    # scoped agent-ro / agent-remediate ones instead - never this.
    return (Join-Path $env:USERPROFILE '.kube\obs-lab.yaml')
}

function Invoke-Kubectl {
    <# Runs kubectl against the lab and returns its output lines. Callers branch
       on $LASTEXITCODE, which this leaves untouched.

       Args are passed as an explicit array - `Invoke-Kubectl @('get','pods')` -
       rather than through ValueFromRemainingArguments, because PS 5.1 tries to
       bind anything starting with '-' to the function's own parameters and
       kubectl arguments are nearly all flags. #>
    param([Parameter(Mandatory)][string[]]$KubectlArgs)
    & kubectl --kubeconfig (Get-LabKubeconfig) @KubectlArgs
}

function Get-KubeJson {
    <# kubectl -o json, parsed. Returns $null when the call failed or returned
       nothing, so callers can distinguish "no such object" from "empty list"
       (an empty list still parses into an object with .items = @()). #>
    param([Parameter(Mandatory)][string[]]$KubectlArgs)
    $raw = (Invoke-Kubectl ($KubectlArgs + @('-o', 'json')) 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Get-AppPods {
    <# Pods of one subject service, by the app label the manifests all carry.
       Returns @() when the cluster is unreachable, so a caller that treats the
       result as "no fault" must check reachability first. #>
    param([Parameter(Mandatory)][string]$App)
    $j = Get-KubeJson @('get', 'pods', '-n', $SubjectNs, '-l', "app=$App")
    if ($null -eq $j) { return @() }
    return @($j.items)
}

function Test-ClusterReachable {
    Invoke-Kubectl @('get', 'ns', $SubjectNs) 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "cannot reach the cluster with $(Get-LabKubeconfig) - is it up (obs k8s status)?"
        return $false
    }
    return $true
}

function Get-PodFaultEvidence {
    <# One pod's fault story as a flat list of "podname: reason" strings, over
       both the current and the previous container state. lastState is what
       makes an OOMKill visible at all: the container that was killed is already
       gone and its successor is Running, so only .lastState.terminated.reason
       still names OOMKilled. #>
    param([Parameter(Mandatory)]$Pod)
    $out = @()
    foreach ($cs in @($Pod.status.containerStatuses)) {
        if ($null -eq $cs) { continue }
        if ($cs.state.waiting.reason) { $out += "$($Pod.metadata.name): waiting=$($cs.state.waiting.reason)" }
        if ($cs.state.terminated.reason) { $out += "$($Pod.metadata.name): terminated=$($cs.state.terminated.reason)" }
        if ($cs.lastState.terminated.reason) { $out += "$($Pod.metadata.name): lastTerminated=$($cs.lastState.terminated.reason) restarts=$($cs.restartCount)" }
        if ($cs.started -eq $true -and $cs.ready -eq $false) { $out += "$($Pod.metadata.name): running-not-ready" }
    }
    return $out
}

function Assert-PodCondition {
    <# The fault-is-live half of a pod-template scenario's verify.

       Matches on the reason strings kubectl itself reports, so the assertion
       and the evidence an on-call would read are the same words:
         -WaitingReason     CrashLoopBackOff | ImagePullBackOff | ErrImagePull
                            (a list, matched as "any of" - a failing image pull
                            passes through ErrImagePull before it settles into
                            ImagePullBackOff, and which one is showing depends
                            purely on when the probe looked)
         -TerminatedReason  OOMKilled | Error   (checks lastState too)
         -RunningNotReady   started, failing its readiness probe

       Any ONE matching pod is enough: with a canary strategy the fault lands on
       one pod while the stable ones keep serving, and that partial blast radius
       is the signature, not a weaker version of it. #>
    param(
        [Parameter(Mandatory)][string]$App,
        [string[]]$WaitingReason = @(),
        [string]$TerminatedReason,
        [switch]$RunningNotReady,
        [int]$TimeoutSec = 120,
        [string]$Context = ''
    )
    $label = if ($Context) { $Context } else { $App }
    # Cleared first: a leftover hit from an earlier call in the same session
    # would be reported as this call's evidence.
    $script:AssertPodHit = ''
    $found = Wait-Until -TimeoutSec $TimeoutSec -Condition {
        foreach ($pod in (Get-AppPods $App)) {
            foreach ($cs in @($pod.status.containerStatuses)) {
                if ($null -eq $cs) { continue }
                if ($WaitingReason.Count -gt 0 -and $cs.state.waiting.reason -and
                    $WaitingReason -contains $cs.state.waiting.reason) {
                    $script:AssertPodHit = "$($pod.metadata.name) waiting=$($cs.state.waiting.reason)"; return $true
                }
                if ($TerminatedReason -and
                    ($cs.state.terminated.reason -eq $TerminatedReason -or $cs.lastState.terminated.reason -eq $TerminatedReason)) {
                    $script:AssertPodHit = "$($pod.metadata.name) terminated=$TerminatedReason restarts=$($cs.restartCount)"; return $true
                }
                if ($RunningNotReady -and $cs.started -eq $true -and $cs.ready -eq $false) {
                    $script:AssertPodHit = "$($pod.metadata.name) Running but not Ready"; return $true
                }
            }
        }
        return $false
    }
    $hit = $script:AssertPodHit
    if ($found) {
        Write-Step "fault live: $label -> $hit"
        return $true
    }
    $seen = @(Get-AppPods $App | ForEach-Object { Get-PodFaultEvidence $_ })
    $want = @()
    if ($WaitingReason.Count -gt 0) { $want += "waiting=$($WaitingReason -join '/')" }
    if ($TerminatedReason) { $want += "terminated=$TerminatedReason" }
    if ($RunningNotReady) { $want += 'running-not-ready' }
    Write-Warning "fault NOT live: no $label pod reached $($want -join ' | ') within ${TimeoutSec}s"
    if ($seen.Count -gt 0) { Write-Host "      pod state now: $($seen -join '; ')" }
    return $false
}

function Get-RolloutStatus {
    <# .status of an Argo Rollout, or $null when the object does not exist
       (gateway and model-proxy are Rollouts; embedder and retriever are plain
       Deployments). #>
    param([Parameter(Mandatory)][string]$Name)
    $j = Get-KubeJson @('get', 'rollout', $Name, '-n', $SubjectNs)
    if ($null -eq $j) { return $null }
    return $j.status
}

function Assert-RolloutStuck {
    <# A Rollout that cannot finish: Degraded (the canary failed outright) or
       still Progressing with fewer updated-and-available replicas than desired.

       This is the delivery-layer half of the gateway scenarios' signature. The
       pod assertion says "one pod is broken"; this one says "and the rollout it
       belongs to is wedged, so the change never completed". #>
    param([Parameter(Mandatory)][string]$Name, [int]$TimeoutSec = 120)
    $script:AssertRolloutPhase = '(no Rollout object)'
    $ok = Wait-Until -TimeoutSec $TimeoutSec -Condition {
        $st = Get-RolloutStatus $Name
        if ($null -eq $st) { return $false }
        $script:AssertRolloutPhase = "$($st.phase) - $($st.message)"
        if ($st.phase -eq 'Degraded') { return $true }
        if ($st.phase -eq 'Progressing' -and ([int]$st.updatedReplicas -lt [int]$st.replicas)) { return $true }
        return $false
    }
    if ($ok) { Write-Step "rollout $Name is stuck: $($script:AssertRolloutPhase)"; return $true }
    Write-Warning "rollout $Name is NOT stuck (status: $($script:AssertRolloutPhase)) within ${TimeoutSec}s"
    return $false
}

function Assert-RolloutHealthy {
    <# The post-revert gate for the Rollout-backed services. A revert that left
       the rollout Degraded would poison every scenario after it in an exam. #>
    param([Parameter(Mandatory)][string]$Name, [int]$TimeoutSec = 300)
    $script:AssertRolloutPhase = '(no Rollout object)'
    $ok = Wait-Until -TimeoutSec $TimeoutSec -IntervalSec 10 -Condition {
        $st = Get-RolloutStatus $Name
        if ($null -eq $st) { return $false }
        $script:AssertRolloutPhase = "$($st.phase) - $($st.message)"
        return ($st.phase -eq 'Healthy')
    }
    if ($ok) { Write-Step "rollout $Name is Healthy again"; return $true }
    Write-Warning "rollout $Name did not return to Healthy within ${TimeoutSec}s (status: $($script:AssertRolloutPhase))"
    return $false
}

function Get-ArgoSyncStatus {
    param([Parameter(Mandatory)][string]$App)
    $j = Get-KubeJson @('get', 'application', $App, '-n', 'argocd')
    if ($null -eq $j) { return $null }
    return $j.status.sync.status
}

function Request-ArgoRefresh {
    <# Ask Argo to re-diff one Application right now.

       Without this, a drift assertion is really a test of Argo's polling
       interval: the controller reconciles on its own schedule (three minutes by
       default), so a freshly injected change reads as Synced for minutes and a
       freshly reverted one reads as OutOfSync for just as long. The annotation
       is the same mechanism `argocd app get --refresh` uses. #>
    param([Parameter(Mandatory)][string]$App)
    Invoke-Kubectl @('-n', 'argocd', 'annotate', 'application', $App,
        'argocd.argoproj.io/refresh=normal', '--overwrite') 2>$null | Out-Null
}

function Assert-ArgoSyncStatus {
    <# Argo's verdict on one Application. Part of the signature for every LIVE
       inject against a tracked resource: the change is out-of-band, so Argo
       sees live drift from Git and flags OutOfSync. Git-mode scenarios assert
       the opposite - the change IS the desired state, so Argo stays Synced and
       the agent must not blame delivery. #>
    param(
        [Parameter(Mandatory)][string]$App,
        [Parameter(Mandatory)][ValidateSet('Synced', 'OutOfSync')][string]$Expect,
        [int]$TimeoutSec = 120
    )
    $ok = Wait-Until -TimeoutSec $TimeoutSec -Condition {
        Request-ArgoRefresh $App
        $script:AssertArgoStatus = Get-ArgoSyncStatus $App
        return ($script:AssertArgoStatus -eq $Expect)
    }
    if ($ok) { Write-Step "argo: $App is $Expect"; return $true }
    Write-Warning "argo: $App is '$($script:AssertArgoStatus)', expected $Expect (waited ${TimeoutSec}s)"
    return $false
}

function Assert-ArgoSyncFailed {
    <# Argo tried to apply the desired state and the API server refused.

       This is a different verdict from OutOfSync, and the difference is the
       whole distinction between sync-fail and 13-config-drift: OutOfSync means
       live and Git disagree, while a failed operation means Git itself cannot
       be applied and live state was never touched. Verified live during this
       phase: with an invalid manifest on main the Application reported
       sync=Synced, health=Healthy and NO conditions at all - because live state
       still matched the last revision that could be applied. A drift check
       would have found this incident completely invisible.

       The phase alone is not enough either. Auto-sync retries with backoff, so
       a failing operation sits at phase=Running for as long as it keeps
       retrying ("Retrying attempt #5 at ..."), and only its MESSAGE says
       anything went wrong. So the message and the per-resource sync results
       both count as evidence.

       -Revision is what keeps this honest. A failed operation stays on the
       Application indefinitely, so without tying the evidence to the commit
       that was just pushed, this assertion would pass on the WRECKAGE OF AN
       EARLIER RUN - reporting a fault as established before Argo had even
       looked at it. Callers pass the sha they pushed.

       Two shapes count as "Argo cannot apply this revision":

         a) the last operation is FOR that revision and it failed, or
         b) the app is OutOfSync AT that revision and the last apply attempt
            failed - which is what a queued sync looks like, because a failing
            operation retries with backoff and the next revision waits behind
            it. Both mean the same thing: what is on main is not in the
            cluster and the attempt to put it there did not work.

       After a revert neither holds: live matches Git again, so the app is
       Synced and the stale failure belongs to a revision nobody is on. #>
    param([Parameter(Mandatory)][string]$App, [string]$Revision = '', [int]$TimeoutSec = 180)
    $script:AssertArgoOp = '(none)'
    $ok = Wait-Until -TimeoutSec $TimeoutSec -IntervalSec 10 -Condition {
        Request-ArgoRefresh $App
        $j = Get-KubeJson @('get', 'application', $App, '-n', 'argocd')
        if ($null -eq $j) { return $false }
        $op = $j.status.operationState
        $phase = "$($op.phase)"
        $msg = "$($op.message)"
        $opRev = "$($op.operation.sync.revision)"
        $failedRes = @($op.syncResult.resources | Where-Object { $_.status -match 'SyncFailed|Failed' })
        $syncErr = @($j.status.conditions | Where-Object { $_.type -match 'SyncError|ComparisonError' })
        $short = if ($opRev) { $opRev.Substring(0, [Math]::Min(7, $opRev.Length)) } else { '-' }
        $script:AssertArgoOp = "phase=$phase opRev=$short sync=$($j.status.sync.status)"

        $applyFailed = (($phase -eq 'Failed') -or ($phase -eq 'Error') -or ($syncErr.Count -gt 0) -or
                        ($failedRes.Count -gt 0) -or ($msg -match 'unsuccessful|failed to apply|is invalid'))
        if (-not $applyFailed) { return $false }
        if (-not $Revision) { return $true }
        if ($opRev -eq $Revision) { return $true }
        return (($j.status.sync.status -eq 'OutOfSync') -and ("$($j.status.sync.revision)" -eq $Revision))
    }
    if ($ok) { Write-Step "argo: $App sync FAILED ($($script:AssertArgoOp))"; return $true }
    Write-Warning "argo: $App has no failed sync within ${TimeoutSec}s ($($script:AssertArgoOp))"
    return $false
}

function Assert-ArgoSyncRecovered {
    <# The paired post-revert gate: the Application is Synced and Healthy, and
       nothing is still retrying.

       It does NOT wait for a Succeeded operation, and that took a live run to
       learn. When the broken revision is reverted, live state already matches
       Git - the bad manifest was never applied - so Argo has nothing to do and
       never runs another sync. The last operation on record stays the FAILED
       one, for a revision that is now history. Waiting for phase=Succeeded
       there waits forever.

       So the failure is only disqualifying while it belongs to the revision
       Argo is currently on. A stale failure against a superseded revision is
       exactly what a recovered gitops incident looks like.

       Patience is still needed for the other direction: a sync that is
       mid-backoff keeps retrying the doomed revision for a minute or two after
       the revert lands. #>
    param([Parameter(Mandatory)][string]$App, [int]$TimeoutSec = 300)
    $script:AssertArgoOp = '(none)'
    $ok = Wait-Until -TimeoutSec $TimeoutSec -IntervalSec 10 -Condition {
        Request-ArgoRefresh $App
        $j = Get-KubeJson @('get', 'application', $App, '-n', 'argocd')
        if ($null -eq $j) { return $false }
        $op = $j.status.operationState
        $phase = "$($op.phase)"
        $failedRev = "$($op.operation.sync.revision)"
        $currentRev = "$($j.status.sync.revision)"
        $syncErr = @($j.status.conditions | Where-Object { $_.type -match 'SyncError|ComparisonError' })
        $script:AssertArgoOp = "sync=$($j.status.sync.status) health=$($j.status.health.status) lastOp=$phase"
        if ($j.status.sync.status -ne 'Synced') { return $false }
        if ($j.status.health.status -ne 'Healthy') { return $false }
        if ($syncErr.Count -gt 0) { return $false }
        # Still working through the bad revision's retries.
        if ($phase -eq 'Running') { return $false }
        # A failure that belongs to the revision we are on now is a live one.
        if ($phase -eq 'Failed' -and $failedRev -and $failedRev -eq $currentRev) { return $false }
        return $true
    }
    if ($ok) { Write-Step "argo: $App has recovered ($($script:AssertArgoOp))"; return $true }
    Write-Warning "argo: $App has not recovered within ${TimeoutSec}s ($($script:AssertArgoOp))"
    return $false
}

function Disable-AutoSync {
    # Live-inject guard (P10): drop `automated` from one Application so an
    # injected fault shows as OutOfSync WITHOUT being healed. selfHeal=false
    # is not sufficient - v3 auto-sync retriggers on drift whenever the
    # target revision is newer than the last attempted sync.
    param([Parameter(Mandatory)][string]$App)
    $f = Join-Path $env:TEMP 'obs-autosync-off.json'
    Set-Content -Encoding ascii -Path $f -Value '{"spec":{"syncPolicy":{"automated":null}}}'
    Invoke-Kubectl @('-n', 'argocd', 'patch', 'application', $App, '--type', 'merge', '--patch-file', $f) 2>$null | Out-Null
}

function Restore-AutoSync {
    # The paired restore for Disable-AutoSync: re-apply the committed
    # Application CR, which puts `automated` back exactly as Git has it.
    # Every revert.ps1 that called Disable-AutoSync must call this.
    param([Parameter(Mandatory)][string]$App)
    $cr = Join-Path $Repo "infra\k8s\argocd\apps\$App.yaml"
    if (-not (Test-Path $cr)) { Write-Warning "no committed Application CR at $cr"; return }
    Invoke-Kubectl @('apply', '-f', $cr) 2>$null | Out-Null
}

function Get-DeploymentField {
    <# One jsonpath off a Deployment, for the capture-then-restore reverts the
       pod-template scenarios use. Returns the raw string, '' when absent.

       This is deliberately NOT `kubectl rollout undo`: undo toggles between the
       last two revisions, so a second revert would re-inject the fault (see
       _lib/state.ps1). Capturing the exact field and writing it back is
       idempotent in both directions. #>
    param([Parameter(Mandatory)][string]$App, [Parameter(Mandatory)][string]$JsonPath)
    $v = (Invoke-Kubectl @('-n', $SubjectNs, 'get', "deployment/$App", '-o', "jsonpath=$JsonPath") 2>$null)
    if ($LASTEXITCODE -ne 0) { return '' }
    return ("$v").Trim()
}

function Get-SecretValue {
    <# One decoded key out of a Secret in the subject namespace.

       Returned, never logged. The scenarios that need a credential (15-stale-
       secret) use it to ask "does the credential the applications hold still
       work" - a question that cannot be answered without holding it briefly. #>
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$Key)
    $b64 = (Invoke-Kubectl @('-n', $SubjectNs, 'get', "secret/$Name", '-o', "jsonpath={.data.$Key}") 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $b64) { return '' }
    try { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("$b64".Trim())) }
    catch { return '' }
}

function Wait-DeploymentRollout {
    <# Wait for a plain Deployment to finish rolling out. Not used for gateway
       or model-proxy: their Deployments are scaled to zero by Rollouts, so
       `rollout status` there reports success about a template nothing is
       running - use Assert-RolloutHealthy for those. #>
    param([Parameter(Mandatory)][string]$App, [int]$TimeoutSec = 180)
    Invoke-Kubectl @('-n', $SubjectNs, 'rollout', 'status', "deployment/$App", "--timeout=${TimeoutSec}s") 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}
