#!/bin/sh
# obs-lab: keep published container ports reachable from the tailnet only.
#
# Why this exists: k3d and compose publish their host ports (gateway 8080, k3d
# API 6550, registry 5010, Gitea 3005/2222, ci-shim 8095) by binding 0.0.0.0.
# On a cloud VM that means the public internet, and the k3d registry accepts
# ANONYMOUS PUSH -- an unauthenticated path to running attacker images in the
# cluster. Credential scanners find the gateway within minutes.
#
# Why DOCKER-USER and not ufw: Docker publishes ports through its own NAT and
# FORWARD rules. Those packets never traverse INPUT, so an INPUT-based host
# firewall silently does nothing. DOCKER-USER is the one chain Docker promises
# not to clobber, and it is consulted before the DOCKER chain accepts a
# published port.
#
# Scope: we drop only what arrives on the public NIC. Tailnet traffic
# (tailscale0), inter-container traffic (docker0 / br-*) and reply packets are
# untouched, so the cluster, the registry mirror, image pulls and the laptop all
# keep working. sshd is a host process filtered on INPUT, so this cannot lock
# you out.
#
# This is defence in depth, NOT the primary control. The Hetzner Cloud Firewall
# (inbound 22 only, or nothing at all) is upstream of the VM and should also be
# in place -- see README.md.
set -e

WAN="${OBS_WAN_IF:-eth0}"

apply() {
  for ipt in iptables ip6tables; do
    "$ipt" -C DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN 2>/dev/null \
      || "$ipt" -I DOCKER-USER 1 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
    "$ipt" -C DOCKER-USER -i "$WAN" -j DROP 2>/dev/null \
      || "$ipt" -A DOCKER-USER -i "$WAN" -j DROP
  done
}

clear_rules() {
  for ipt in iptables ip6tables; do
    "$ipt" -D DOCKER-USER -i "$WAN" -j DROP 2>/dev/null || true
    "$ipt" -D DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN 2>/dev/null || true
  done
}

case "$1" in
  apply) apply ;;
  clear) clear_rules ;;
  status)
    echo "--- v4 DOCKER-USER ---"; iptables -S DOCKER-USER
    echo "--- v6 DOCKER-USER ---"; ip6tables -S DOCKER-USER
    ;;
  *) echo "usage: obs-lockdown apply|clear|status" >&2; exit 2 ;;
esac
