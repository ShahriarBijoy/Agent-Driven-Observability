/**
 * The dashboard catalogue behind /telemetry.
 *
 * Grafana provisions more dashboards than the portal shows, on purpose:
 * appearing here is a deliberate act, not a side effect of dropping a JSON
 * into infra/grafana/provisioning/dashboards. Each entry carries a human
 * label and a one-line claim about what it proves, so the page reads as a
 * tour rather than a file listing.
 */
import { grafanaRangeParams, TIME_RANGES, type TimeRange } from "./time-range";

export const DASHBOARD_GROUPS = ["Application", "Kubernetes", "Delivery"] as const;
export type DashboardGroup = (typeof DASHBOARD_GROUPS)[number];

export interface Dashboard {
  /** Grafana dashboard uid (the `/d/<uid>` segment). */
  uid: string;
  label: string;
  /** One line on what this dashboard is evidence of. */
  caption: string;
  group: DashboardGroup;
  /**
   * Template variables pinned into the embed URL.
   *
   * Without these an embed inherits whatever Grafana happens to resolve
   * first, which is fine at a desk and a coin-flip during a demo. The
   * kubernetes-mixin dashboards ship `datasource=default` (a placeholder,
   * not the Mimir uid) and unset cluster/namespace; argo-rollouts ships
   * `rollout_namespace=default` with an empty rollout name and renders blank.
   */
  vars?: Record<string, string>;
  /**
   * Shortest window this dashboard is legible at. Delivery metrics tick on a
   * slower clock than request metrics — DORA over the last 15 minutes reads
   * "0 deploys", which looks like a broken panel rather than a quiet morning.
   * The global picker still applies above this floor.
   */
  minRange?: TimeRange;
}

/** External label stamped on every series by Alloy (see infra/grafana/mixins/mixin.libsonnet). */
const CLUSTER = "obs-lab";
/** Namespace the subject system runs in. */
const SUBJECT_NS = "subject";

/**
 * kubernetes-mixin uids are jsonnet-derived hashes of the dashboard name, not
 * names — stable across rebuilds of infra/grafana/mixins/build.sh, but opaque.
 * The comment is the only thing tying them back to a title.
 */
export const DASHBOARDS: readonly Dashboard[] = [
  {
    uid: "gateway-red",
    label: "Gateway · RED",
    caption: "Rate, errors, duration — the anchor panel.",
    group: "Application",
  },
  {
    uid: "rag-pipeline",
    label: "RAG Pipeline",
    caption: "Retriever → embedder → model, stage by stage.",
    group: "Application",
  },
  {
    uid: "data-quality",
    label: "Data Quality",
    caption: "Freshness and null checks from the dq-runner.",
    group: "Application",
  },
  // Profiles (uid gateway-profiles) is deliberately NOT listed. The flame
  // graph can only fill in compose mode: infra/alloy/profiler.alloy discovers
  // targets over the laptop's Docker socket, and in k8s mode the gateway is a
  // pod on the cluster, so there is nothing there for it to find. Pyroscope
  // stays up (its datasource and the dashboard still resolve in Grafana) —
  // it just has no business being on a tour of things that work.
  {
    // Kubernetes / Compute Resources / Cluster
    uid: "efa86fd1d0c121a26444b636a3f509a8",
    label: "Cluster",
    caption: "Whole-cluster CPU and memory against requests.",
    group: "Kubernetes",
    vars: { datasource: "mimir", cluster: CLUSTER },
  },
  {
    // Kubernetes / Compute Resources / Namespace (Pods)
    uid: "85a562078cdf77779eaa1add43ccec1e",
    label: "Namespace · subject",
    caption: "The app's own footprint, pod by pod.",
    group: "Kubernetes",
    vars: { datasource: "mimir", cluster: CLUSTER, namespace: SUBJECT_NS },
  },
  {
    uid: "k8s-events",
    label: "Events",
    caption: "Pod kills, OOMs and restarts as a live stream.",
    group: "Kubernetes",
  },
  {
    uid: "k8s-cardinality",
    label: "Cardinality budget",
    caption: "What the telemetry itself costs to keep.",
    group: "Kubernetes",
  },
  {
    uid: "argocd-official",
    label: "Argo CD",
    caption: "Sync and health of every application.",
    group: "Delivery",
    vars: { datasource: "mimir" },
  },
  {
    uid: "argo-rollouts-official",
    label: "Argo Rollouts",
    caption: "Canary analysis on the gateway.",
    group: "Delivery",
    vars: { datasource: "mimir", rollout_namespace: SUBJECT_NS, rollout_name: "gateway" },
  },
  {
    uid: "cicd-dora",
    label: "Delivery · DORA",
    caption: "Lead time, deploy frequency, change-failure rate.",
    group: "Delivery",
    minRange: "24h",
  },
];

/** Opens first, and what the demo script points at. */
export const DEFAULT_DASHBOARD_UID = "gateway-red";

export function findDashboard(uid: string | undefined): Dashboard {
  return DASHBOARDS.find((d) => d.uid === uid) ?? DASHBOARDS[0]!;
}

/** Catalogue in group order, skipping groups with no entries. */
export function groupedDashboards(): { group: DashboardGroup; dashboards: Dashboard[] }[] {
  return DASHBOARD_GROUPS.map((group) => ({
    group,
    dashboards: DASHBOARDS.filter((d) => d.group === group),
  })).filter((g) => g.dashboards.length > 0);
}

/**
 * The window a dashboard actually gets: the picker's, or the dashboard's
 * floor when the picker is below it. TIME_RANGES is ordered shortest-first,
 * so the later index is the wider window.
 */
export function effectiveRange(dashboard: Dashboard, range: TimeRange): TimeRange {
  if (!dashboard.minRange) return range;
  return TIME_RANGES.indexOf(range) < TIME_RANGES.indexOf(dashboard.minRange)
    ? dashboard.minRange
    : range;
}

export interface EmbedOptions {
  grafanaUrl: string;
  dashboard: Dashboard;
  theme: string;
  range: TimeRange;
  /** kiosk strips Grafana's chrome; drop it for the "open in Grafana" link. */
  kiosk?: boolean;
}

export function dashboardUrl({
  grafanaUrl,
  dashboard,
  theme,
  range,
  kiosk = true,
}: EmbedOptions): string {
  // Assembled by hand rather than with URLSearchParams: kiosk is a bare flag,
  // and URLSearchParams would render it `kiosk=`.
  const params: string[] = [];
  if (kiosk) params.push("kiosk");
  params.push(`theme=${encodeURIComponent(theme)}`);
  for (const [name, value] of Object.entries(dashboard.vars ?? {})) {
    params.push(`var-${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  // grafanaRangeParams owns the from/to spelling, so the time window stays
  // identical to every other embed in the app.
  params.push(grafanaRangeParams(effectiveRange(dashboard, range)));
  return `${grafanaUrl}/d/${dashboard.uid}?${params.join("&")}`;
}
