import { Link, useRouter } from "@tanstack/react-router";
import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { TimeAgo } from "~/components/time-ago";
import { themeStore } from "~/lib/theme";
import { useMountEffect } from "~/lib/use-mount-effect";
import type { PendingApprovalNotice } from "~/server/db";
import { decideApproval, getPendingApprovals } from "~/server/functions";

const POLL_MS = 3_000;

/**
 * Global approval-gate notifications: polls for undecided approvals and keeps
 * one persistent top-center toast per gate, wherever the operator is in the
 * app. The toast is actionable in place (approve / deny / open the run) and
 * dismisses itself when the gate is decided elsewhere — the run page, the
 * on-call page, or another tab.
 *
 * Mounted once in the root layout; also owns the app's sole sonner Toaster.
 */
export function ApprovalToaster() {
  const theme = themeStore.use();

  useMountEffect(() => {
    // approvalIds that already got a toast this session. Entries leave the set
    // only when the gate stops being pending, so a manual dismiss stays
    // dismissed instead of reappearing on the next poll.
    const toasted = new Set<string>();
    let stopped = false;

    async function poll() {
      const pending = await getPendingApprovals().catch((): PendingApprovalNotice[] => []);
      if (stopped) return;
      const pendingIds = new Set(pending.map((p) => p.approvalId));
      for (const id of [...toasted]) {
        if (!pendingIds.has(id)) {
          toast.dismiss(id);
          toasted.delete(id);
        }
      }
      for (const notice of pending) {
        if (toasted.has(notice.approvalId)) continue;
        toasted.add(notice.approvalId);
        toast.custom((toastId) => <ApprovalToast notice={notice} toastId={toastId} />, {
          id: notice.approvalId,
          duration: Number.POSITIVE_INFINITY,
        });
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  });

  return (
    <Toaster
      position="top-center"
      theme={theme}
      gap={10}
      style={{ "--width": "420px" } as CSSProperties}
    />
  );
}

function ApprovalToast({
  notice,
  toastId,
}: {
  notice: PendingApprovalNotice;
  toastId: string | number;
}) {
  const router = useRouter();
  const [deciding, setDeciding] = useState<"approved" | "denied" | null>(null);

  async function decide(decision: "approved" | "denied") {
    setDeciding(decision);
    try {
      await decideApproval({
        data: { runId: notice.runId, approvalId: notice.approvalId, decision },
      });
      toast.dismiss(toastId);
      toast.success(
        decision === "approved" ? "Approved — agent resuming" : "Denied — agent stopped",
        {
          position: "top-center",
          duration: 3_500,
        },
      );
      await router.invalidate();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="w-(--width) rounded-xl border border-warning/40 bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/10">
      <p className="flex items-center gap-2 text-sm font-medium text-warning">
        <ShieldAlertIcon className="size-4 shrink-0" />
        Approval required
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
          <TimeAgo iso={notice.requestedAt} />
        </span>
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {notice.agent} · {notice.runTitle}
      </p>
      <p className="mt-1.5 line-clamp-3 text-sm text-foreground/90">{notice.summary}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={deciding !== null} onClick={() => void decide("approved")}>
          {deciding === "approved" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={deciding !== null}
          onClick={() => void decide("denied")}
        >
          {deciding === "denied" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <XIcon data-icon="inline-start" />
          )}
          Deny
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          className="ml-auto text-muted-foreground"
          render={
            <Link
              to="/agents/runs/$runId"
              params={{ runId: notice.runId }}
              onClick={() => toast.dismiss(toastId)}
            />
          }
        >
          View run
        </Button>
      </div>
    </div>
  );
}
