# Snapshot the agent audit log

**Trigger:** on-call wants a point-in-time snapshot of recent agent activity
(e.g. before a deploy, or to attach to an incident).

## Gather

1. Count runs by agent and status: `pg_select` on `agent_runs`
   (`SELECT agent, status, count(*) FROM agent_runs GROUP BY agent, status`).
2. Count tool calls in the last hour: `pg_select` on `agent_tool_calls`
   (`SELECT tool, count(*) FROM agent_tool_calls WHERE ts > now() - interval '1 hour' GROUP BY tool`).

## Export

1. Write the snapshot to disk so it can be attached elsewhere — **state-mutating,
   requires approval**: `echo "<your summary>" > .artifacts/agent-audit-snapshot.txt`.

## Verify

1. Confirm the file exists and is non-empty: `ls -l .artifacts/agent-audit-snapshot.txt`.
