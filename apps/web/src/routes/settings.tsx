import type {
  AgentSettings,
  AgentSettingsUpdate,
  AgentToolInfo,
  AgentToolPolicy,
} from "@obs/contracts";
import { GradientAvatar } from "@outpacelabs/avatars";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  CheckIcon,
  KeyRoundIcon,
  LockIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "~/components/ui/frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { TENANTS, tenantStore } from "~/lib/tenant";
import { cn } from "~/lib/utils";
import { getSettingsPage, saveAgentSettings } from "~/server/functions";

export const Route = createFileRoute("/settings")({
  loader: () => getSettingsPage(),
  component: SettingsPage,
});

/** Mirrors the gateway's hardcoded registry (apps/gateway auth slice, ADR-002 §4). */
const TENANT_ROWS = [
  { tenant: "acme", token: "dev-local-token", capacity: 1000, refill: 1000 },
  { tenant: "bravo", token: "dev-token-bravo", capacity: 1000, refill: 1000 },
  { tenant: "abuser", token: "dev-token-abuser", capacity: 20, refill: 10 },
] as const;

const MCP_PREFIX = "mcp__obslab__";
const displayTool = (name: string) =>
  name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;

/** Select sentinel for "no pinned model" (Base UI wants a non-null value). */
const CLI_DEFAULT = "__default__";

function SettingsPage() {
  const { devTenant, devToken, agentSettings } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <header className="panel-rise">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime configuration for the Claude agents, plus local dev auth. Agent changes take
          effect on the next run.
        </p>
      </header>

      {agentSettings === null ? <AgentServiceDown /> : <AgentRuntime initial={agentSettings} />}

      <DevAuth devTenant={devTenant} devToken={devToken} />
      <Tenants />
    </div>
  );
}

// ---- agent runtime (model + tool access) ------------------------------------

function AgentServiceDown() {
  const router = useRouter();
  return (
    <Card size="sm" className="panel-rise panel-rise-1">
      <CardHeader>
        <CardTitle>Agent runtime</CardTitle>
        <CardDescription>Model and tool access for the Claude agents.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-3 rounded-lg bg-warning/10 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="text-warning">Couldn't load settings from agent-service (:8093).</p>
            <p className="text-muted-foreground">
              It's either not running or on an older build without the settings API. (Re)start it
              with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">obs agents</code> and
              retry.
            </p>
          </div>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={() => void router.invalidate()}
          >
            <RefreshCwIcon className="size-3" />
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "saved" }
  | { phase: "error"; message: string };

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.phase === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" /> Saving
      </span>
    );
  }
  if (state.phase === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <CheckIcon className="size-3" /> Saved
      </span>
    );
  }
  if (state.phase === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <TriangleAlertIcon className="size-3" /> {state.message}
      </span>
    );
  }
  return null;
}

function AgentRuntime({ initial }: { initial: AgentSettings }) {
  const [settings, setSettings] = useState(initial);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const modelLabel = (value: string | null) => {
    if (value === null || value === CLI_DEFAULT) {
      return settings.envModel ? `Default (${settings.envModel})` : "Default (CLI)";
    }
    return settings.availableModels.find((m) => m.id === value)?.label ?? value;
  };

  async function push(update: AgentSettingsUpdate) {
    setSave({ phase: "saving" });
    try {
      const next = await saveAgentSettings({ data: update });
      if (next === null) {
        setSave({ phase: "error", message: "Save failed" });
        return;
      }
      setSettings(next);
      setSave({ phase: "saved" });
      window.setTimeout(() => setSave((s) => (s.phase === "saved" ? { phase: "idle" } : s)), 2500);
    } catch {
      setSave({ phase: "error", message: "Save failed" });
    }
  }

  function toggleTool(agent: AgentToolPolicy, tool: string) {
    if (save.phase === "saving") return;
    const grants: Record<string, string[]> = {};
    for (const a of settings.agents) {
      const next =
        a.kind === agent.kind
          ? a.grantedTools.includes(tool)
            ? a.grantedTools.filter((t) => t !== tool)
            : [...a.grantedTools, tool]
          : a.grantedTools;
      if (next.length > 0) grants[a.kind] = next;
    }
    void push({ toolGrants: grants });
  }

  const modelHint =
    settings.modelSource === "settings"
      ? "Pinned from this page; stored in the lab database."
      : settings.modelSource === "env"
        ? `Using AGENT_MODEL from apps/agent-service/.env (${settings.envModel}).`
        : "No model pinned; the Claude Code CLI picks its default.";

  return (
    <>
      <Card size="sm" className="panel-rise panel-rise-1">
        <CardHeader>
          <CardTitle>Model</CardTitle>
          <CardDescription>The Claude model every agent runs on.</CardDescription>
          <CardAction>
            <SaveIndicator state={save} />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          <Select
            value={settings.model ?? CLI_DEFAULT}
            onValueChange={(v) => void push({ model: v === CLI_DEFAULT ? null : (v as string) })}
          >
            <SelectTrigger className="w-full max-w-md" aria-label="Agent model">
              <SelectValue>{(value: string) => modelLabel(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLI_DEFAULT}>
                <span>Default</span>
                <span className="text-xs text-muted-foreground">
                  {settings.envModel
                    ? `AGENT_MODEL: ${settings.envModel}`
                    : "Claude Code CLI default"}
                </span>
              </SelectItem>
              {settings.availableModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span>{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.detail}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{modelHint}</p>
        </CardContent>
      </Card>

      <section className="panel-rise panel-rise-2 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-medium">Tool access</h2>
            <p className="text-sm text-muted-foreground">
              Each agent ships with a locked baseline. Grant extras per agent; a denied tool call in
              a run feed usually means a missing grant.
            </p>
          </div>
          <SaveIndicator state={save} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {settings.agents.map((agent) => (
            <AgentCard
              key={agent.kind}
              agent={agent}
              tools={settings.tools}
              busy={save.phase === "saving"}
              onToggle={toggleTool}
            />
          ))}
        </div>
      </section>
    </>
  );
}

// ---- per-agent card (ReUI Frame + gradient avatar) ---------------------------

function AgentCard({
  agent,
  tools,
  busy,
  onToggle,
}: {
  agent: AgentToolPolicy;
  tools: AgentToolInfo[];
  busy: boolean;
  onToggle: (agent: AgentToolPolicy, tool: string) => void;
}) {
  const toolInfo = new Map(tools.map((t) => [t.name, t]));
  const grantable = tools.filter(
    (t) => !agent.defaultTools.includes(t.name) && !agent.grantedTools.includes(t.name),
  );

  return (
    <Frame spacing="sm">
      <FrameHeader>
        <GradientAvatar seed={`obslab/${agent.kind}`} size={32} radius={10} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <FrameTitle className="truncate font-mono text-[13px]">{agent.kind}</FrameTitle>
          <FrameDescription className="truncate text-xs">{agent.description}</FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className={cn("text-sm", busy && "pointer-events-none opacity-70")}>
        <AgentRow icon={ShieldCheckIcon} label="Mode">
          {agent.permissionMode === "bypassPermissions" ? (
            <Badge variant="secondary" className="bg-warning/15 text-warning">
              unattended, approval-gated
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-success/15 text-success">
              denies tools outside list
            </Badge>
          )}
        </AgentRow>

        <AgentRow icon={LockIcon} label="Baseline" alignTop>
          <div className="flex flex-wrap justify-end gap-1">
            {agent.defaultTools.map((name) => (
              <span
                key={name}
                title={`${toolInfo.get(name)?.description ?? name}. Part of this agent's baseline.`}
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {displayTool(name)}
              </span>
            ))}
          </div>
        </AgentRow>

        <AgentRow icon={KeyRoundIcon} label="Granted" alignTop>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {agent.grantedTools.map((name) => (
              <button
                key={name}
                type="button"
                title={`${toolInfo.get(name)?.description ?? name}. Click to revoke.`}
                onClick={() => onToggle(agent, name)}
                className="group inline-flex cursor-pointer items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary transition-colors outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {displayTool(name)}
                <XIcon className="size-2.5 opacity-60 group-hover:opacity-100" />
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="xs" variant="outline" className="h-[22px] gap-1 px-1.5 text-[11px]">
                    <PlusIcon className="size-2.5" />
                    Grant
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Grant a tool to {agent.kind}</DropdownMenuLabel>
                  {grantable.length === 0 ? (
                    <div className="px-1.5 py-1 text-xs text-muted-foreground">
                      Every tool is already available.
                    </div>
                  ) : (
                    grantable.map((tool) => (
                      <DropdownMenuItem key={tool.name} onClick={() => onToggle(agent, tool.name)}>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-mono text-xs">{displayTool(tool.name)}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {tool.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </AgentRow>
      </FramePanel>
    </Frame>
  );
}

function AgentRow({
  icon: Icon,
  label,
  alignTop,
  children,
}: {
  icon: LucideIcon;
  label: string;
  alignTop?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 py-2 first:pt-0 last:pb-0",
        alignTop ? "items-start" : "items-center",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center gap-2 text-muted-foreground",
          alignTop && "pt-0.5",
        )}
      >
        <Icon className="size-3.5" />
        <span className="text-[13px]">{label}</span>
      </span>
      {children}
    </div>
  );
}

// ---- dev auth + tenants ------------------------------------------------------

function DevAuth({ devTenant, devToken }: { devTenant: string; devToken: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Card size="sm" className="panel-rise panel-rise-3">
      <CardHeader>
        <CardTitle>Dev auth</CardTitle>
        <CardDescription>
          Local only. No real auth until a later phase; fixed credentials from{" "}
          <code className="font-mono text-xs">.env</code>, resolved against the gateway's hardcoded
          registry.
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
  );
}

function Tenants() {
  const active = tenantStore.use();
  return (
    <Card size="sm" className="panel-rise panel-rise-4">
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
                <TableCell className="font-mono text-xs text-muted-foreground">{t.token}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{t.capacity}</TableCell>
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
  );
}
