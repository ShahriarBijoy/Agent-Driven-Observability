import { describe, expect, it } from "vitest";
import {
  DASHBOARD_GROUPS,
  DASHBOARDS,
  DEFAULT_DASHBOARD_UID,
  dashboardUrl,
  effectiveRange,
  findDashboard,
  groupedDashboards,
} from "./dashboards";

const GRAFANA = "http://localhost:3001";

function urlFor(uid: string) {
  return dashboardUrl({
    grafanaUrl: GRAFANA,
    dashboard: findDashboard(uid),
    theme: "dark",
    range: "1h",
  });
}

describe("catalogue", () => {
  it("has no duplicate uids", () => {
    const uids = DASHBOARDS.map((d) => d.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("opens on the anchor dashboard", () => {
    expect(DASHBOARDS[0]?.uid).toBe(DEFAULT_DASHBOARD_UID);
    expect(findDashboard(undefined).uid).toBe(DEFAULT_DASHBOARD_UID);
  });

  it("falls back to the anchor for an unknown uid", () => {
    expect(findDashboard("no-such-dashboard").uid).toBe(DEFAULT_DASHBOARD_UID);
  });

  it("gives every dashboard a label and a caption", () => {
    for (const d of DASHBOARDS) {
      expect(d.label, d.uid).not.toBe("");
      expect(d.caption, d.uid).not.toBe("");
    }
  });

  it("groups every dashboard exactly once, in group order", () => {
    const grouped = groupedDashboards();
    expect(grouped.map((g) => g.group)).toEqual([...DASHBOARD_GROUPS]);
    expect(grouped.flatMap((g) => g.dashboards)).toHaveLength(DASHBOARDS.length);
  });
});

describe("dashboardUrl", () => {
  it("embeds in kiosk mode with the app theme and time range", () => {
    expect(urlFor("gateway-red")).toBe(
      `${GRAFANA}/d/gateway-red?kiosk&theme=dark&from=now-1h&to=now`,
    );
  });

  it("drops kiosk for the open-in-Grafana link", () => {
    const url = dashboardUrl({
      grafanaUrl: GRAFANA,
      dashboard: findDashboard("gateway-red"),
      theme: "light",
      range: "15m",
      kiosk: false,
    });
    expect(url).toBe(`${GRAFANA}/d/gateway-red?theme=light&from=now-15m&to=now`);
  });

  // The mixin dashboards ship datasource=default (a placeholder, not the Mimir
  // uid) and an unset cluster; unpinned they render empty or arbitrary.
  it("pins the mixin cluster and namespace variables", () => {
    const url = urlFor("85a562078cdf77779eaa1add43ccec1e");
    expect(url).toContain("var-datasource=mimir");
    expect(url).toContain("var-cluster=obs-lab");
    expect(url).toContain("var-namespace=subject");
  });

  // Shipped default is rollout_namespace=default with an empty rollout name,
  // which renders a blank dashboard.
  it("pins the rollout under analysis", () => {
    const url = urlFor("argo-rollouts-official");
    expect(url).toContain("var-rollout_namespace=subject");
    expect(url).toContain("var-rollout_name=gateway");
  });

  it("leaves dashboards without pinned variables alone", () => {
    expect(urlFor("k8s-events")).not.toContain("var-");
  });
});

// DORA over the last 15 minutes reads "0 deploys" — an empty panel that looks
// like a fault rather than a slower clock.
describe("minimum window", () => {
  const dora = findDashboard("cicd-dora");
  const red = findDashboard("gateway-red");

  it("widens a picker below the dashboard's floor", () => {
    expect(effectiveRange(dora, "15m")).toBe("24h");
    expect(effectiveRange(dora, "1h")).toBe("24h");
  });

  it("honours a picker at or above the floor", () => {
    expect(effectiveRange(dora, "24h")).toBe("24h");
  });

  it("leaves dashboards without a floor on the picker's window", () => {
    expect(effectiveRange(red, "15m")).toBe("15m");
    expect(effectiveRange(red, "24h")).toBe("24h");
  });

  it("applies the floor to the embed URL", () => {
    expect(urlFor("cicd-dora")).toContain("from=now-24h");
  });
});
