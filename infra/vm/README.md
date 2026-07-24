# The "prod" VM — Profile A remote cluster host

Act II (PLAN-2 §C, Profile A) moves the failure domain off the 16 GB laptop:
the **k3d cluster and, later, the CI layer** (Gitea + runner + registry) run on
one small cloud VM, while the laptop keeps the LGTM observability stack,
agent-service, and the web UI. The two halves talk over **Tailscale** — the VM
needs zero public inbound ports, and powering it off becomes the lab's ultimate
chaos scenario.

Spec: **4 vCPU / 8 GB / 60+ GB disk, Ubuntu 24.04 + Docker**. The reference
choice is a **Hetzner CAX21** (ARM, ~€8.5/mo, hourly billing — delete anytime).
ARM is fine throughout: Bun, k3s, Argo, and Chaos Mesh all ship arm64, and CI
builds run on the VM so images are native by construction.

## One-time setup

### 1. Tailscale (both ends)

1. Create a tailnet: sign in at <https://login.tailscale.com/start>
   (Google/GitHub/Microsoft login all work).
2. Laptop: `winget install --id tailscale.tailscale -e`, then log in
   (tray icon → _Log in_, or `tailscale up`).
3. (Recommended) Mint an auth key so the VM joins the tailnet unattended:
   Admin console → **Settings → Keys → Auth keys → Generate auth key** —
   enable **Pre-approved**, leave _Reusable_ off. Copy the `tskey-auth-…`
   value into `TS_AUTHKEY` in `cloud-init.yaml` before pasting it.

### 2. Hetzner server

Console: <https://console.hetzner.com> → new project (e.g. `obs-lab`) →
**Add server**:

| Setting      | Value                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Location     | Falkenstein / Nuremberg / Helsinki (any EU; latency is fine)                                    |
| Image        | **Ubuntu 24.04**                                                                                |
| Type         | Shared vCPU → **Arm64 → CAX21** (4 vCPU / 8 GB / 80 GB)                                         |
| Networking   | Public IPv4 + IPv6 (defaults)                                                                   |
| SSH key      | Add the laptop's `~/.ssh/id_ed25519.pub`                                                        |
| Cloud config | Paste `cloud-init.yaml` (with `TS_AUTHKEY` filled in)                                           |
| Firewall     | Create one: allow inbound **SSH (22)** only — Tailscale is outbound-only and needs nothing open |
| Name         | `obs-vm`                                                                                        |

> **The firewall is not optional, and "I'll add it later" fails open.** This VM
> was run for a while without one. Docker and k3d published the gateway (8080),
> the Kubernetes API (6550), the image registry (5010), Gitea (3005/2222) and
> the ci-shim (8095) on `0.0.0.0` — all reachable from the internet. Credential
> scanners found the gateway and were probing `/.env`, `/.aws/credentials` and
> `/.git/config` continuously; the registry accepted **anonymous push**, which
> is a direct path to running attacker images in the cluster.
>
> Three independent layers now prevent that, and you want all three:
>
> 1. **Hetzner Cloud Firewall** — upstream of the VM, so it holds even if the
>    host is misconfigured. Inbound 22 only.
> 2. **Bind addresses** — `OBS_BIND_IP` in `infra/ports.env`; `obs k8s up`
>    resolves it to the VM's tailscale0 address and refuses to create the
>    cluster if it cannot. The registry binds loopback.
> 3. **`obs-lockdown.service`** — drops anything arriving on the public NIC that
>    is headed for a container, via the `DOCKER-USER` chain. This layer exists
>    because Docker's published ports bypass `INPUT` entirely, so `ufw` and
>    friends do not see them.
>
> Check the current state any time with
> `ssh root@obs-vm /usr/local/sbin/obs-lockdown status`.

Provisioning runs ~4–6 minutes after boot. Done when `obs-vm` appears in the
Tailscale admin console / `tailscale status` on the laptop, and
`/etc/obs-lab/.provisioned` exists on the VM.

### 3. Verify from the laptop

```powershell
tailscale status                 # obs-vm listed, with a 100.x.y.z address
ssh root@obs-vm "docker version --format '{{.Server.Version}}'; k3d version; kubectl version --client; tailscale status | head -1"
```

`ssh root@obs-vm` works two ways: Tailscale SSH (tailnet identity, because the
VM ran `tailscale up --ssh`) or plain OpenSSH with the key Hetzner injected.
Once Tailscale is confirmed you can delete the SSH rule from the Hetzner
firewall — the tailnet path doesn't use it. Deleting it is the _safest_ end
state: an empty inbound ruleset, with every path to the VM going over the
tailnet. Do not confuse "no rule allowing 22" with "no firewall attached" —
the second one allows everything.

## Day-2 notes

- **Pause for weeks**: snapshot the server in the Hetzner console, delete it,
  and pay cents for the snapshot; recreate from the snapshot to resume.
- **Memory**: 8 GB fits cluster + CI if the runner is capped at one concurrent
  job (Phase 9) and Chaos Mesh waits until Phase 12; the 4 GB swap absorbs
  docker-build spikes. If builds still hurt, resize to CAX31 (16 GB).
- **The cluster lives in Docker**: `docker system prune` on the VM while the
  cluster is stopped deletes it (same trap as on the laptop).
