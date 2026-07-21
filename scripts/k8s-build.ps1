<#
.SYNOPSIS
  k8s-build - build, push, deploy, and smoke the subject system on the cluster.

.DESCRIPTION
  Profile A (PLAN-2 SS C): images are built ON the VM (native to it), pushed to
  the k3d-managed registry as localhost:<port>/<svc>:<sha>, and deployed from
  the laptop via kubectl apply -k. GitOps replaces this script in Phase 10.

  The build context is `git archive HEAD` - committed state only, shipped as a
  tar file over scp (PowerShell 5.1 corrupts binary pipelines, so no streaming).
  All five services share one image build; they differ only by tag + workdir.

  Actions:
    all      build -> deploy -> smoke   (default)
    build    archive HEAD, build on the VM, push :sha and :dev tags
    deploy   apply the lab overlay, pin deployments to the built :sha
    smoke    prove both halves of the registry path: the pushed tag is in the
             catalog (VM side) AND a pod can pull and run it (cluster side)
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('all', 'build', 'deploy', 'smoke')]
    [string]$Action = 'all'
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Services = @('gateway', 'embedder', 'retriever', 'model-proxy', 'load-generator')

# The address book (see scripts/obs.ps1 - same parse, same map).
$Ports = @{}
foreach ($line in Get-Content (Join-Path $Repo 'infra\ports.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$') {
        $Ports[$Matches[1]] = $Matches[2]
    }
}
$Vm = $Ports.OBS_VM_HOST
$RegPort = $Ports.OBS_REGISTRY_PORT
$Kubeconfig = Join-Path $env:USERPROFILE '.kube\obs-lab.yaml'
$Sha = (git -C $Repo rev-parse --short HEAD).Trim()

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Invoke-K8sBuild {
    # The registry is a k3d-managed container: 'k3d cluster stop' (obs k8s
    # down) takes it down too, and a push then dies mid-build with a cryptic
    # "connection refused" on :$RegPort. Fail early with the actual fix.
    ssh -o BatchMode=yes "root@$Vm" "curl -sf -m 5 http://localhost:$RegPort/v2/ >/dev/null"
    if ($LASTEXITCODE -ne 0) {
        throw "registry :$RegPort on $Vm is not answering - the cluster is stopped. Run 'obs k8s up' first."
    }

    $tar = Join-Path $env:TEMP "obs-lab-src-$Sha.tar"
    Write-Step "archiving HEAD ($Sha) -> $tar"
    git -C $Repo archive --format=tar -o $tar HEAD
    if ($LASTEXITCODE -ne 0) { throw "git archive failed" }

    Write-Step "shipping context to $Vm"
    ssh -o BatchMode=yes "root@$Vm" 'rm -rf /root/obs-lab/src && mkdir -p /root/obs-lab/src'
    scp -q -o BatchMode=yes $tar "root@${Vm}:/root/obs-lab/src.tar"
    Remove-Item $tar -Force

    Write-Step "building on $Vm + pushing :$Sha and :dev for: $($Services -join ', ')"
    $svcList = $Services -join ' '
    $remote = "set -e; tar -xf /root/obs-lab/src.tar -C /root/obs-lab/src; rm /root/obs-lab/src.tar; " +
              "cd /root/obs-lab/src; docker build -q -f infra/Dockerfile -t obs-app:$Sha .; " +
              "for svc in $svcList; do " +
              "docker tag obs-app:$Sha localhost:$RegPort/`$svc`:$Sha; " +
              "docker tag obs-app:$Sha localhost:$RegPort/`$svc`:dev; " +
              "docker push -q localhost:$RegPort/`$svc`:$Sha; " +
              "docker push -q localhost:$RegPort/`$svc`:dev; " +
              "done; echo BUILD_PUSH_OK"
    ssh -o BatchMode=yes "root@$Vm" $remote
    if ($LASTEXITCODE -ne 0) { throw "remote build/push failed" }
}

function Invoke-K8sDeploy {
    # Never pin deployments to a tag that was never pushed - the rollout would
    # just hang in ImagePullBackOff until its timeout.
    $tags = ssh -o BatchMode=yes "root@$Vm" "curl -s http://localhost:$RegPort/v2/gateway/tags/list"
    if ($tags -notmatch $Sha) {
        throw "image :$Sha is not in the registry - run 'obs k8s build' first (HEAD moved since the last build)"
    }
    # A completed Job is immutable; clear it so apply can recreate.
    kubectl --kubeconfig $Kubeconfig -n subject delete job seed --ignore-not-found | Out-Null
    # P10: the manifests live in infra/gitops (per-service sync roots). This
    # direct apply is the OUT-OF-BAND bootstrap path - with Argo CD running it
    # flips every app OutOfSync (self-heal is off, so the pins below stick
    # until the next gitops sync). Normal deploys go through CI -> obs-gitops.
    Write-Step "kubectl apply -k infra/gitops/* (out-of-band - Argo will flag OutOfSync)"
    kubectl --kubeconfig $Kubeconfig apply -k (Join-Path $Repo 'infra\gitops\platform')
    if ($LASTEXITCODE -ne 0) { throw "apply failed" }
    foreach ($svc in $Services) {
        kubectl --kubeconfig $Kubeconfig apply -k (Join-Path $Repo "infra\gitops\services\$svc")
        if ($LASTEXITCODE -ne 0) { throw "apply of $svc failed" }
    }

    Write-Step "pinning deployments to :$Sha (change-cause annotated)"
    foreach ($svc in $Services) {
        kubectl --kubeconfig $Kubeconfig -n subject set image "deployment/$svc" "$svc=obs-registry:$RegPort/${svc}:$Sha" | Out-Null
        kubectl --kubeconfig $Kubeconfig -n subject annotate "deployment/$svc" `
            "kubernetes.io/change-cause=deploy :$Sha via k8s-build.ps1" --overwrite | Out-Null
    }

    Write-Step 'waiting for rollouts (postgres/redis first, then the services)'
    foreach ($d in @('postgres', 'redis', 'gateway', 'embedder', 'retriever', 'model-proxy')) {
        kubectl --kubeconfig $Kubeconfig -n subject rollout status "deployment/$d" --timeout=180s
        if ($LASTEXITCODE -ne 0) { throw "rollout of $d did not complete" }
    }
}

function Invoke-K8sSmoke {
    Write-Step "registry smoke 1/2: pushed tag visible in the catalog (VM side)"
    $tags = ssh -o BatchMode=yes "root@$Vm" "curl -s http://localhost:$RegPort/v2/gateway/tags/list"
    Write-Host "  $tags"
    if ($tags -notmatch $Sha) { throw "tag :$Sha not found in registry catalog" }

    Write-Step "registry smoke 2/2: cluster pulls the tag through the mirror"
    kubectl --kubeconfig $Kubeconfig -n subject delete pod registry-smoke --ignore-not-found 2>$null | Out-Null
    kubectl --kubeconfig $Kubeconfig -n subject run registry-smoke `
        --image="obs-registry:$RegPort/gateway:$Sha" --restart=Never `
        --image-pull-policy=Always --command -- bun --version | Out-Null
    kubectl --kubeconfig $Kubeconfig -n subject wait pod/registry-smoke --for=jsonpath='{.status.phase}'=Succeeded --timeout=120s
    if ($LASTEXITCODE -ne 0) {
        kubectl --kubeconfig $Kubeconfig -n subject describe pod registry-smoke | Select-String -Pattern 'Events:' -Context 0, 10
        throw "registry pull smoke failed"
    }
    $ver = kubectl --kubeconfig $Kubeconfig -n subject logs registry-smoke
    kubectl --kubeconfig $Kubeconfig -n subject delete pod registry-smoke | Out-Null
    Write-Host "  pod pulled :$Sha and ran bun $ver"
    Write-Step 'registry smoke PASSED (push half + pull half)'
}

switch ($Action) {
    'build'  { Invoke-K8sBuild }
    'deploy' { Invoke-K8sDeploy }
    'smoke'  { Invoke-K8sSmoke }
    'all'    { Invoke-K8sBuild; Invoke-K8sDeploy; Invoke-K8sSmoke }
}
