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

### 4. Verify the VM is not reachable from the internet

Two checks, and they answer different questions. Do not treat either as the
other.

**Automated — `obs preflight`.** Reports which interface each VM port is bound
to, whether `obs-lockdown.service` is up, and whether `DOCKER-USER` still has
rules. It fails if any lab port is on `0.0.0.0` or `[::]`. That is the
_precondition_ for public exposure, and it is what silently regressed for 67
days: nothing can be publicly reachable without a wildcard bind, and a wildcard
bind is visible from inside. Run it after any change to a compose file, a k3d
config, or `ports.env`.

It cannot tell you about **reachability**. The laptop is on the tailnet, so it
reaches the VM whatever the firewall says.

**Manual — probe the public IPs from off-tailnet.** The only check that proves
reachability, and it cannot be automated from here without an off-tailnet
vantage point.

1. Disconnect Tailscale (tray icon → Disconnect), then confirm:
   `tailscale status` reports stopped, and
   `Test-NetConnection obs-vm -Port 3005 -InformationLevel Quiet` is `False`.
   If that is `True` you are still on the tailnet and the rest is meaningless.
2. Probe both public addresses:

```powershell
foreach ($ip in '167.233.217.0','2a01:4f8:c013:50ef::1') {
  "== $ip =="
  foreach ($p in 22,2222,3005,5010,6550,8080,8095) {
    $r = Test-NetConnection $ip -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue
    '{0,-6} {1}' -f $p, $(if ($r) { 'OPEN  <-- investigate' } else { 'closed' })
  }
}
```

3. Reconnect Tailscale.

Every port should be `closed`. Port 22 open means the Hetzner firewall is not
blocking ssh — survivable (sshd is keys-only) but not the intended end state.
Anything else open means a bind or a firewall layer is missing: re-run
`obs preflight` to find out which.

Worth repeating after any Hetzner firewall edit, since that layer is the
primary control and lives outside this repo.

### 5. Keep a way back in

Once the Hetzner firewall drops the SSH rule, **Tailscale is the only remote
path to this VM**. Two things have to be true or a bad day becomes a rescue
operation:

- **Node key expiry disabled.** Admin console → **Machines** → `obs-vm` → **⋯** →
  _Disable key expiry_. A key expires by default (typically ~6 months); when it
  does, tailscaled deauthenticates and the VM drops off the tailnet. With 22
  firewalled, that is indistinguishable from the VM being dead. Check the
  current value with:
  `ssh root@obs-vm 'tailscale status --json' | jq .Self.KeyExpiry`
- **A root password for the VNC console.** `cloud-init.yaml` generates one and
  writes it to `/root/obs-lab/.root-console`; read it with
  `ssh root@obs-vm cat /root/obs-lab/.root-console` and keep it somewhere off
  this machine. Without it the Hetzner console prompts for a password nobody
  has — the image ships none — and the only way back is Hetzner **Rescue mode**.
  The password is console-only: sshd is `PasswordAuthentication no` +
  `PermitRootLogin prohibit-password`, so it buys nothing over the network.

Worth re-reading `PasswordAuthentication no` in that light: before the console
password existed, no account had a hash at all, so password auth was disabled
by accident. Now that root has one, that directive is the only thing keeping it
off the network.

The **Tailscale ACL** is what actually authorises `ssh root@obs-vm` — tailnet
sessions are intercepted by Tailscale SSH and never reach sshd, so no sshd
setting constrains them. Review it at
[login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls); the
default `dst: ["autogroup:self"]` limits SSH to devices owned by the same user,
with `action: "check"` forcing periodic browser re-auth.

## Day-2 notes

- **Pause for weeks**: snapshot the server in the Hetzner console, delete it,
  and pay cents for the snapshot; recreate from the snapshot to resume.
- **Memory**: 8 GB fits cluster + CI if the runner is capped at one concurrent
  job (Phase 9) and Chaos Mesh waits until Phase 12; the 4 GB swap absorbs
  docker-build spikes. If builds still hurt, resize to CAX31 (16 GB).
- **The cluster lives in Docker**: `docker system prune` on the VM while the
  cluster is stopped deletes it (same trap as on the laptop).
