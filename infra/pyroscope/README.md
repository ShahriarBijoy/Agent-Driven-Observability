# infra/pyroscope

Pyroscope (continuous profiling) — Phase 6.

`pyroscope.yaml` runs Pyroscope monolithic with local-filesystem storage on
`:4040`. Grafana provisions it as the **Pyroscope** data source, and the Tempo
data source's `tracesToProfiles` links a span to the CPU profile of its service
— the "why was this request slow" drill-down.

## Where the profiles come from

The subject services run on **Bun**, which uses JavaScriptCore, not V8. Pyroscope's
Node integration (`@pyroscope/nodejs`) relies on the V8 CPU profiler, so it
**cannot** profile a Bun process. Profiles therefore come from **eBPF** — kernel
-level, language-agnostic — via a dedicated Alloy profiler
(`infra/alloy/profiler.alloy`).

That profiler is **opt-in** (compose `profiling` profile) because it needs a
Linux host — or Docker Desktop's Linux VM — with eBPF + kernel BTF, running
privileged with `pid: host`:

```bash
docker compose -f infra/compose.yml -f infra/compose.observability.yml \
  --profile profiling up -d alloy-profiler
```

Then drive traffic and open the **Gateway · Profiles** dashboard, or follow
_Profiles for this span_ from a slow trace in Tempo. If the flame graph is empty,
the profiler isn't running or the host kernel lacks eBPF/BTF; the label mapping
in `profiler.alloy` may also need tuning for your Docker runtime.

Dev-only — filesystem storage is not for production.
