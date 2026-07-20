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
