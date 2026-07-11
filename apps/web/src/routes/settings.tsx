import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
      <h1 className="panel-rise font-heading text-xl font-semibold tracking-tight">Settings</h1>

      <Card size="sm" className="panel-rise panel-rise-1">
        <CardHeader>
          <CardTitle>Dev auth</CardTitle>
          <CardDescription>
            Local only. No real auth until a later phase — fixed credentials from{" "}
            <code className="font-mono text-xs">.env</code>, resolved against the gateway's
            hardcoded registry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-32 text-xs text-muted-foreground">Default tenant</span>
            <code className="font-mono text-sm">{devTenant}</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-32 text-xs text-muted-foreground">Dev token</span>
            <code className="font-mono text-sm">
              {revealed ? devToken : "•".repeat(devToken.length)}
            </code>
            <Button size="xs" variant="outline" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "Hide" : "Reveal"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="panel-rise panel-rise-2">
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>Switching applies to agent runs only.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">Bucket capacity</TableHead>
                <TableHead className="text-right">Refill / s</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {TENANT_ROWS.map((t) => (
                <TableRow key={t.tenant}>
                  <TableCell className="font-mono">{t.tenant}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.token}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {t.capacity}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.refill}</TableCell>
                  <TableCell className="text-right">
                    {active === t.tenant ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        active
                      </Badge>
                    ) : TENANTS.includes(t.tenant) ? (
                      <Button size="xs" variant="ghost" onClick={() => tenantStore.set(t.tenant)}>
                        Switch
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card size="sm" className="panel-rise panel-rise-3">
        <CardHeader>
          <CardTitle>Agent permissions</CardTitle>
          <CardDescription>Enforced by agent-service.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Approval gate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AGENT_PERMISSIONS.map((p) => (
                <TableRow key={p.agent}>
                  <TableCell className="font-mono text-info">{p.agent}</TableCell>
                  <TableCell className="max-w-56 text-xs whitespace-normal text-muted-foreground">
                    {p.description}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.tools.map((tool) => (
                        <code
                          key={tool}
                          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {tool}
                        </code>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.needsApproval ? (
                      <Badge variant="secondary" className="bg-warning/15 text-warning">
                        required
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-success/15 text-success">
                        read-only
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
