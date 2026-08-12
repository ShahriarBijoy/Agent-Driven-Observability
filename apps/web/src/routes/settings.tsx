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
  ChevronRightIcon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
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
  { tenant: "test-bench", token: "dev-local-token", capacity: 1000, refill: 1000 },
  { tenant: "bravo", token: "dev-token-bravo", capacity: 1000, refill: 1000 },
  { tenant: "abuser", token: "dev-token-abuser", capacity: 20, refill: 10 },
] as const;

const MCP_PREFIX = "mcp__obslab__";
const displayTool = (name: string) =>
  name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name;

/** Select sentinel for "no pinned model" (Base UI wants a non-null value). */
const CLI_DEFAULT = "__default__";

/**
 * One section rhythm for the whole page. Everything here is a titled block of
 * settings, so nothing is wrapped in a card — the only boxes on the page are
 * the agent cards, which are the only things you can actually manipulate.
 */
function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("border-t border-border pt-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="max-w-2xl">
          <h2 className="font-heading text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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

function SettingsPage() {
  const { devTenant, devToken, agentSettings } = Route.useLoaderData();
  // The last server response wins over the loader's copy; until a save happens
  // the loader stays authoritative, so the down-then-Retry path still recovers.
  const [saved, setSaved] = useState<AgentSettings | null>(null);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const settings = saved ?? agentSettings;

  async function push(update: AgentSettingsUpdate) {
    setSave({ phase: "saving" });
    try {
      const next = await saveAgentSettings({ data: update });
      if (next === null) {
        setSave({ phase: "error", message: "Save failed" });
        return;
      }
      setSaved(next);
      setSave({ phase: "saved" });
      window.setTimeout(() => setSave((s) => (s.phase === "saved" ? { phase: "idle" } : s)), 2500);
    } catch {
      setSave({ phase: "error", message: "Save failed" });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <header className="panel-rise flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="max-w-2xl">
          <h1 className="font-heading text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Runtime configuration for the Claude agents, plus local dev auth. Agent changes take
            effect on the next run.
          </p>
        </div>
        {/* One save state governs the whole page, so it gets one indicator. */}
        <SaveIndicator state={save} />
      </header>

      {settings === null ? (
        <Section
          title="Agent runtime"
          description="Model and tool access for the Claude agents."
          className="panel-rise panel-rise-1"
        >
          <AgentServiceDown />
        </Section>
      ) : (
        <>
          <Section
            title="Model"
            description="The Claude model every agent runs on."
            className="panel-rise panel-rise-1"
          >
            <ModelPicker settings={settings} onChange={push} />
          </Section>

          <Section
            title="Tool access"
            description="Each agent ships with a locked baseline. Grant extras per agent; a denied tool call in a run feed usually means a missing grant."
            className="panel-rise panel-rise-2"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {settings.agents.map((agent) => (
                <AgentCard
                  key={agent.kind}
                  agent={agent}
                  tools={settings.tools}
                  busy={save.phase === "saving"}
                  onToggle={(a, tool) => {
                    if (save.phase === "saving") return;
                    void push({ toolGrants: nextGrants(settings, a, tool) });
                  }}
                />
              ))}
            </div>
          </Section>
        </>
      )}

      <Section
        title="Dev auth"
        description={
          <>
            Local only. No real auth until a later phase; fixed credentials from{" "}
            <code className="font-mono text-xs">.env</code>, resolved against the gateway's
            hardcoded registry.
          </>
        }
        className="panel-rise panel-rise-3"
      >
        <DevAuth devTenant={devTenant} devToken={devToken} />
      </Section>

      <Section
        title="Tenants"
        description="Switching applies to agent runs only."
        className="panel-rise panel-rise-4"
      >
        <Tenants />
      </Section>
    </div>
  );
}

/** Toggling one tool rebuilds the whole grant map, which is what the API takes. */
function nextGrants(
  settings: AgentSettings,
  target: AgentToolPolicy,
  tool: string,
): Record<string, string[]> {
  const grants: Record<string, string[]> = {};
  for (const a of settings.agents) {
    const next =
      a.kind === target.kind
        ? a.grantedTools.includes(tool)
          ? a.grantedTools.filter((t) => t !== tool)
          : [...a.grantedTools, tool]
        : a.grantedTools;
    if (next.length > 0) grants[a.kind] = next;
  }
  return grants;
}

// ---- agent runtime -----------------------------------------------------------

function AgentServiceDown() {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl bg-warning/10 p-4 text-sm ring-1 ring-warning/25">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="text-warning">Couldn't load settings from agent-service (:8093).</p>
        <p className="text-muted-foreground">
          It's either not running or on an older build without the settings API. (Re)start it with{" "}
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
  );
}

function ModelPicker({
  settings,
  onChange,
}: {
  settings: AgentSettings;
  onChange: (update: AgentSettingsUpdate) => Promise<void>;
}) {
  const modelLabel = (value: string | null) => {
    if (value === null || value === CLI_DEFAULT) {
      return settings.envModel ? `Default (${settings.envModel})` : "Default (CLI)";
    }
    return settings.availableModels.find((m) => m.id === value)?.label ?? value;
  };

  const modelHint =
    settings.modelSource === "settings"
      ? "Pinned from this page; stored in the lab database."
      : settings.modelSource === "env"
        ? `Using AGENT_MODEL from apps/agent-service/.env (${settings.envModel}).`
        : "No model pinned; the Claude Code CLI picks its default.";

  return (
    <div className="space-y-2">
      <Select
        value={settings.model ?? CLI_DEFAULT}
        onValueChange={(v) => void onChange({ model: v === CLI_DEFAULT ? null : (v as string) })}
      >
        <SelectTrigger className="w-full max-w-md" aria-label="Agent model">
          <SelectValue>{(value: string) => modelLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CLI_DEFAULT}>
            <span>Default</span>
            <span className="text-xs text-muted-foreground">
              {settings.envModel ? `AGENT_MODEL: ${settings.envModel}` : "Claude Code CLI default"}
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
    </div>
  );
}

// ---- per-agent card ----------------------------------------------------------

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
  const [baselineOpen, setBaselineOpen] = useState(false);
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
        {/* Granted leads: it is the only row on this card you can change. */}
        <AgentRow icon={KeyRoundIcon} label="Granted" alignTop>
          <div className="flex flex-wrap items-center gap-1">
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
              <DropdownMenuContent align="start" className="w-72">
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

        {/* The baseline is locked, so it folds away: six agents' worth of
            read-only chips was drowning the one row that takes input. */}
        <Collapsible open={baselineOpen} onOpenChange={setBaselineOpen}>
          <CollapsibleTrigger
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md py-2 text-[13px] text-muted-foreground",
              "transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          >
            <LockIcon className="size-3.5 shrink-0" />
            <span>Baseline</span>
            <span className="ml-auto flex items-center gap-1 tabular-nums">
              {agent.defaultTools.length} tool{agent.defaultTools.length === 1 ? "" : "s"}
              <ChevronRightIcon
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  baselineOpen && "rotate-90",
                )}
              />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1">
            <div className="flex flex-wrap gap-1 pb-1">
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
          </CollapsibleContent>
        </Collapsible>
      </FramePanel>
    </Frame>
  );
}

/**
 * Fixed label column so the values share a left edge. They used to be
 * right-aligned, which gave every row a different starting x and made a card
 * of short chips unreadable.
 */
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
    <div className={cn("flex gap-3 py-2 first:pt-0", alignTop ? "items-start" : "items-center")}>
      <span
        className={cn(
          "flex w-[4.5rem] shrink-0 items-center gap-2 text-muted-foreground",
          alignTop && "pt-0.5",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[13px]">{label}</span>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---- dev auth + tenants ------------------------------------------------------

function DevAuth({ devTenant, devToken }: { devTenant: string; devToken: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <dl className="space-y-2">
      <div className="flex items-center gap-3">
        <dt className="w-32 shrink-0 text-xs text-muted-foreground">Default tenant</dt>
        <dd className="font-mono text-sm">{devTenant}</dd>
      </div>
      <div className="flex items-center gap-3">
        <dt className="w-32 shrink-0 text-xs text-muted-foreground">Dev token</dt>
        <dd className="flex items-center gap-3">
          {/* Fixed-width mask: a dot per character advertises the length. */}
          <code className="font-mono text-sm">{revealed ? devToken : "••••••••••••"}</code>
          <Button size="xs" variant="outline" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
        </dd>
      </div>
    </dl>
  );
}

function Tenants() {
  const active = tenantStore.use();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tenant</TableHead>
          <TableHead>Token</TableHead>
          <TableHead className="text-right">Bucket capacity</TableHead>
          <TableHead className="text-right">Refill / s</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
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
  );
}
