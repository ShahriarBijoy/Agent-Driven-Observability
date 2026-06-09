import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@obs/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AGENT_PERMISSIONS } from "~/lib/agent-permissions";
import { TENANTS, tenantStore } from "~/lib/tenant";
import { getDevAuth } from "~/server/functions";

export const Route = createFileRoute("/settings")({
  loader: () => getDevAuth(),
  component: SettingsPage,
});

/** Mirrors the gateway's hardcoded registry (apps/gateway auth slice, ADR-002 §4). */
const TENANT_ROWS = [
  { tenant: "acme", token: "dev-local-token", capacity: 1000, refill: 1000 },
  { tenant: "bravo", token: "dev-token-bravo", capacity: 1000, refill: 1000 },
  { tenant: "abuser", token: "dev-token-abuser", capacity: 20, refill: 10 },
] as const;

function SettingsPage() {
  const { devTenant, devToken } = Route.useLoaderData();
  const active = tenantStore.use();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <h1 className="panel-rise font-display text-2xl font-medium text-ink">Settings</h1>

      <Card className="panel-rise panel-rise-1">
        <CardHeader>
          <CardTitle>Dev auth</CardTitle>
          <Badge tone="warn">local only — no real auth until a later phase</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-28 font-mono text-[11px] text-ink-faint uppercase">
              default tenant
            </span>
            <code className="font-mono text-sm text-ink">{devTenant}</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-28 font-mono text-[11px] text-ink-faint uppercase">dev token</span>
            <code className="font-mono text-sm text-ink">
              {revealed ? devToken : "•".repeat(devToken.length)}
            </code>
            <Button size="sm" variant="ghost" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "hide" : "reveal"}
            </Button>
          </div>
          <p className="pt-1 text-xs text-ink-faint">
            Fixed credentials from <code>.env</code> (<code>DEV_TOKEN</code>,{" "}
            <code>DEV_TENANT</code>). The gateway's auth slice resolves them against its hardcoded
            registry.
          </p>
        </CardContent>
      </Card>

      <Card className="panel-rise panel-rise-2">
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <span className="font-mono text-[10px] text-ink-faint uppercase">
            switching applies to agent runs only
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>tenant</TH>
                <TH>token</TH>
                <TH>bucket capacity</TH>
                <TH>refill / s</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {TENANT_ROWS.map((t) => (
                <TR key={t.tenant}>
                  <TD className="font-mono text-ink">{t.tenant}</TD>
                  <TD className="font-mono text-xs">{t.token}</TD>
                  <TD className="font-mono tabular-nums">{t.capacity}</TD>
                  <TD className="font-mono tabular-nums">{t.refill}</TD>
                  <TD>
                    {active === t.tenant ? (
                      <Badge tone="signal">active</Badge>
                    ) : TENANTS.includes(t.tenant) ? (
                      <Button size="sm" variant="ghost" onClick={() => tenantStore.set(t.tenant)}>
                        switch
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="panel-rise panel-rise-3">
        <CardHeader>
          <CardTitle>Agent permissions</CardTitle>
          <span className="font-mono text-[10px] text-ink-faint uppercase">
            enforced by agent-service in phase 5
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>agent</TH>
                <TH>purpose</TH>
                <TH>tools</TH>
                <TH>approval gate</TH>
              </TR>
            </THead>
            <TBody>
              {AGENT_PERMISSIONS.map((p) => (
                <TR key={p.agent}>
                  <TD className="font-mono text-data">{p.agent}</TD>
                  <TD className="max-w-56 text-xs">{p.description}</TD>
                  <TD>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.tools.map((tool) => (
                        <code
                          key={tool}
                          className="rounded-xs bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-faint"
                        >
                          {tool}
                        </code>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    {p.needsApproval ? (
                      <Badge tone="warn">required</Badge>
                    ) : (
                      <Badge tone="good">read-only</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
