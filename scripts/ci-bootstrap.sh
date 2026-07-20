#!/usr/bin/env bash
# CI-layer bootstrap - runs ON THE VM, invoked by scripts/ci.ps1 (obs ci up)
# after the gitea container is healthy. Idempotent: admin user 'obs'
# (password -> /root/obs-lab/.gitea-admin), an all-scope API token
# (-> /root/obs-lab/.gitea-token), a fresh runner registration token (ignored
# by act_runner when its identity already exists in the runner-data volume),
# then the runner + ci-shim services.
set -euo pipefail
cd /root/obs-lab

compose() {
  docker compose --env-file ports.env -f src/infra/compose.ci.yml "$@"
}

if ! compose exec -T -u 1000 gitea gitea admin user list | awk '{print $2}' | grep -qx obs; then
  pw=$(head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 20)
  compose exec -T -u 1000 gitea \
    gitea admin user create --admin --username obs --password "$pw" --email obs@obs-lab.local --must-change-password=false
  echo "obs:$pw" > .gitea-admin && chmod 600 .gitea-admin
  echo ">> created admin user 'obs' (password in /root/obs-lab/.gitea-admin)"
fi

if [ ! -s .gitea-token ]; then
  compose exec -T -u 1000 gitea \
    gitea admin user generate-access-token --username obs --token-name "obs-lab-$(date +%s)" --scopes all --raw > .gitea-token
  chmod 600 .gitea-token
  echo ">> minted API token (/root/obs-lab/.gitea-token)"
fi

OBS_CI_RUNNER_TOKEN=$(compose exec -T -u 1000 gitea gitea actions generate-runner-token | tr -d '[:space:]')
export OBS_CI_RUNNER_TOKEN
echo ">> compose up: runner + ci-shim"
compose up -d --build --wait runner ci-shim

# --- repos (P9 task 3) -------------------------------------------------------
# obs-lab: the subject source, primary remote for CI (the laptop pushes here;
# scripts/ci.ps1 wires the laptop-side remote + credential).
# obs-gitops: empty on purpose - it becomes Phase 10's desired-state repo.
GITEA_PORT=$(grep -oP '^OBS_GITEA_PORT=\K.*' ports.env)
API="http://localhost:${GITEA_PORT}/api/v1"
api() { curl -sf -H "Authorization: token $(cat .gitea-token)" -H "Content-Type: application/json" "$@"; }

ensure_repo() {
  if ! api "$API/repos/obs/$1" >/dev/null 2>&1; then
    api -X POST "$API/user/repos" \
      -d "{\"name\":\"$1\",\"description\":\"$2\",\"private\":true,\"default_branch\":\"main\",\"auto_init\":false}" >/dev/null
    echo ">> created repo obs/$1"
  fi
}
ensure_repo obs-lab "AI Observability Lab - subject source (primary remote for CI)"
ensure_repo obs-gitops "Desired state for the cluster (empty until Phase 10)"

# The deploy job needs cluster access: ship the operator kubeconfig into the
# repo as an Actions secret. Overwritten on every up, so a recreated cluster
# heals on the next `obs ci up`. (Server name obs-vm resolves in job
# containers via the runner's --add-host=obs-vm:host-gateway.)
if k3d cluster list obs-lab >/dev/null 2>&1; then
  KUBE_B64=$(k3d kubeconfig get obs-lab | base64 -w0)
  api -X PUT "$API/repos/obs/obs-lab/actions/secrets/KUBECONFIG_B64" \
    -d "{\"data\":\"$KUBE_B64\"}" >/dev/null && echo ">> actions secret KUBECONFIG_B64 refreshed"
fi

# Push-mirror obs-lab -> the existing GitHub repo, so history stays synced.
# The fine-grained PAT (Contents: RW on that one repo) is provisioned by hand
# to /root/obs-lab/.github-mirror-pat - never via the source tree. No PAT
# file, no mirror; rerun `obs ci up` after adding it.
if [ -s .github-mirror-pat ]; then
  if ! api "$API/repos/obs/obs-lab/push_mirrors" | grep -q 'github\.com'; then
    api -X POST "$API/repos/obs/obs-lab/push_mirrors" \
      -d "{\"remote_address\":\"https://github.com/ShahriarBijoy/Agent-Driven-Observability.git\",\"remote_username\":\"ShahriarBijoy\",\"remote_password\":\"$(cat .github-mirror-pat)\",\"interval\":\"8h0m0s\",\"sync_on_commit\":true}" >/dev/null
    echo ">> push-mirror wired: obs/obs-lab -> github.com/ShahriarBijoy/Agent-Driven-Observability (sync on commit)"
  fi
else
  echo ">> NOTE: no /root/obs-lab/.github-mirror-pat - GitHub push-mirror not configured"
fi
