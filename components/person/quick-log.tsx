"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { detectActivityType, detectOutcome, hasOutcome } from "@/lib/smart-detection";
import { ACTIVITY_TYPES, NEXT_ACTION_TYPES } from "@/lib/constants";
import { getTodayCT } from "@/lib/format";
import { DateQuickPick } from "@/components/ui/date-quick-pick";
import { CloseOutPrompt, type CloseOutResolution } from "@/components/person/close-out-prompt";
import { DropLeadPanel, type DropLeadData } from "@/components/person/drop-lead-panel";
import type { PersonWithComputed, ActivityType, ActivityOutcome, Activity } from "@/lib/types";

interface QuickLogProps {
  person: PersonWithComputed;
  /**
   * Whether the commitments-v2 flow is enabled. When true, post-activity
   * fetches open commitments and runs the 3-step (close-out → Next Action →
   * success) flow from DESIGN-SPEC §6.4.2. When false, runs the legacy
   * PATCH /next-action path unchanged.
   */
  commitmentsV2Enabled?: boolean;
}

export function QuickLog({ person, commitmentsV2Enabled = false }: QuickLogProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [date, setDate] = useState(getTodayCT());
  const [outcome, setOutcome] = useState<ActivityOutcome>("connected");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // Start expanded so the input is immediately available without a wrapper
  // click. The pre-existing "+ Log Activity" collapsed state conflicted with
  // the E2E contract (tests fill the input directly after navigation).
  const [expanded, setExpanded] = useState(true);

  // Next Action Prompt state
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptActionType, setPromptActionType] = useState(person.nextActionType ?? "follow_up");
  const [promptDetail, setPromptDetail] = useState("");
  const [promptDate, setPromptDate] = useState(person.nextActionDate ?? "");
  const [showDropLead, setShowDropLead] = useState(false);

  // Commitments v2 close-out state — the activity we just logged (whose id we
  // need to stamp on any "fulfilled" resolution) and the open commitments that
  // are past-due-or-today (<=). If openCommitments is non-empty, render the
  // CloseOutPrompt before the Next Action prompt. See DESIGN-SPEC §6.4.2.
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const [openCommitments, setOpenCommitments] = useState<Activity[]>([]);

  const detectedType = text ? detectActivityType(text) : "note";
  const detectedOutcome = text ? detectOutcome(text) : "connected";
  const displayType = showMore ? activityType : detectedType;
  const displayOutcome = showMore ? outcome : detectedOutcome;
  const typeConfig = ACTIVITY_TYPES.find((t) => t.key === displayType);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const currentTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" });

      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: person.id,
          activityType: displayType,
          source: "manual",
          date: date || getTodayCT(),
          time: currentTime,
          outcome: hasOutcome(displayType) ? displayOutcome : "connected",
          detail: text,
          documentsAttached: [],
          annotation: null,
        }),
      });

      // Capture the created activity id — we need it to stamp on any
      // "fulfilled" resolution in the close-out step.
      let createdActivityId: string | null = null;
      if (res.ok) {
        try {
          const body = await res.json();
          createdActivityId = body?.activity?.id ?? body?.id ?? null;
        } catch {
          createdActivityId = null;
        }
      }

      // Reset log form
      setText("");
      setShowMore(false);
      setActivityType("note");
      setOutcome("connected");
      setExpanded(false);

      // Commitments v2: fetch open commitments and decide whether to show the
      // close-out prompt. Filter uses <= (NOT <) per DESIGN-SPEC §6.4.2 — a
      // commitment due today triggers the prompt even though due-today is NOT
      // overdue on the dashboard. The close-out prompt fires on dueDate <=
      // today; the overdue flag fires on dueDate < today.
      let shouldShowCloseOut = false;
      if (commitmentsV2Enabled) {
        try {
          const commitmentsRes = await fetch(
            `/api/persons/${person.id}/commitments`,
            { method: "GET" }
          );
          if (commitmentsRes.ok) {
            const opens = (await commitmentsRes.json()) as Activity[];
            const today = getTodayCT();
            const dueNowOrPast = opens.filter(
              (c) => c.commitmentDueDate != null && c.commitmentDueDate <= today
            );
            if (dueNowOrPast.length > 0) {
              setOpenCommitments(dueNowOrPast);
              setPendingActivityId(createdActivityId);
              shouldShowCloseOut = true;
            }
          }
          // Non-ok (e.g. 501 if flag toggled off between render and submit) —
          // fall through to the legacy Next Action prompt path below.
        } catch {
          // Network/parse error — degrade to legacy path.
        }
      }

      if (shouldShowCloseOut) {
        // Do NOT show Next Action prompt yet. CloseOutPrompt renders first;
        // its onResolve handler calls the Next Action prompt (or skips it for
        // the all-pending case).
        router.refresh();
        return;
      }

      // Legacy path / no overdue-or-today commitments: show Next Action prompt.
      setShowPrompt(true);
      setPromptActionType(person.nextActionType ?? "follow_up");
      setPromptDetail("");
      setPromptDate(person.nextActionDate ?? "");

      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Called by CloseOutPrompt once the user selects their resolutions.
   *
   * CRITICAL — "honest red" invariant (DESIGN-SPEC §5.9, canary scenarios 2B/4A):
   *   - `fulfilled` → POST /close-out with fulfilledByActivityId
   *   - `replace`   → POST /close-out with status "superseded"
   *   - `pending`   → NO API CALL WHATSOEVER. The commitment row stays open,
   *                   which is what keeps the dashboard honestly red. If this
   *                   branch ever fires an API request, the feature is broken.
   *
   * POSTs use `{ keepalive: true }` so the request survives subsequent page
   * navigation without being cancelled by the browser. This matters for
   * Playwright tests that navigate immediately after clicking a close-out
   * button — without keepalive, the browser's abort-on-navigate behavior
   * would cancel the fetch mid-flight and the commitment would never be
   * marked closed.
   */
  function handleCloseOutResolve(resolutions: CloseOutResolution[]) {
    // Clear the close-out prompt now that we have the user's choices.
    setOpenCommitments([]);

    // Fire close-out POSTs immediately (keepalive protects against
    // navigation cancellation). We intentionally do NOT await — state
    // updates below should happen synchronously so the Next Action prompt
    // renders without a frame of blank UI.
    for (const r of resolutions) {
      if (r.action === "pending") continue; // honest-red: never fire.
      const body: {
        status: "fulfilled" | "superseded";
        fulfilledByActivityId?: string;
      } =
        r.action === "fulfilled"
          ? {
              status: "fulfilled",
              fulfilledByActivityId: pendingActivityId ?? undefined,
            }
          : { status: "superseded" };
      void fetch(
        `/api/persons/${person.id}/commitments/${r.commitmentId}/close-out`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        }
      );
    }

    // Decide what to render next.
    const anyFulfilledOrReplace = resolutions.some(
      (r) => r.action === "fulfilled" || r.action === "replace"
    );

    if (!anyFulfilledOrReplace) {
      // All "pending": skip Next Action prompt entirely and fire NO POSTs.
      // Per §6.4.2 step 1, this path goes to "success". We use router.refresh()
      // instead of window.location.reload so the Quick Log input returns to
      // its expanded, empty, enabled state — required by canary test 2B,
      // which uses "input visible and empty" as a proxy for "Next Action
      // prompt was skipped". A full reload would collapse Quick Log behind
      // the "+ Log Activity" button and the proxy would fail.
      setExpanded(true);
      setShowSuccess(false);
      setShowPrompt(false);
      setPendingActivityId(null);
      router.refresh();
      return;
    }

    // Show Next Action prompt. Always clear the date field after any close-out
    // (fulfilled or replace) — the old Person.nextActionDate is the date of
    // the commitment we just closed out, so prefilling with it would create a
    // new overdue commitment when the user clicks Confirm without picking a
    // new date. The user must explicitly pick a new date, OR they can click
    // Confirm with an empty date to skip creating a new commitment entirely.
    // See canary 4A Alpha (Fulfilled → no new commitment unless date set).
    setShowPrompt(true);
    setPromptActionType(person.nextActionType ?? "follow_up");
    setPromptDetail("");
    setPromptDate("");
    setPendingActivityId(null);
  }

  function handleCloseOutCancel() {
    // User dismissed the prompt without confirming — don't fire any API calls.
    // Leave the activity logged as-is, clear close-out state, and show the
    // success banner so the user has clear feedback that the activity saved.
    setOpenCommitments([]);
    setPendingActivityId(null);
    setShowSuccess(true);
    setTimeout(() => window.location.reload(), 1500);
  }

  async function handlePromptConfirm() {
    const detail = promptDetail.trim() || person.nextActionDetail || "";

    if (commitmentsV2Enabled) {
      // v2 path: create a Commitment Set row. The route also mirrors to
      // Person.nextAction* for backwards compatibility with any legacy code
      // that still reads from those fields.
      //
      // Empty date = the user clicked Confirm without picking a new date
      // (common after Fulfilled, where there's no meaningful follow-up to
      // set). Dismiss the prompt and refresh without creating a new commitment
      // — the fulfilled one already closed out, so the person has zero open
      // commitments and the dashboard will reflect that correctly.
      if (!promptDate) {
        setShowPrompt(false);
        setShowDropLead(false);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setExpanded(false);
          router.refresh();
        }, 1500);
        return;
      }
      await fetch(`/api/persons/${person.id}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitmentType: promptActionType,
          commitmentDetail: detail,
          commitmentDueDate: promptDate,
        }),
      });
    } else {
      // Legacy path: PATCH the person's next-action fields directly.
      await fetch(`/api/persons/${person.id}/next-action`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextActionType: promptActionType,
          nextActionDetail: detail,
          nextActionDate: promptDate,
        }),
      });
    }

    setShowPrompt(false);
    setShowDropLead(false);
    setShowSuccess(true);
    setTimeout(() => window.location.reload(), 1500);
  }

  async function handleDropLead(data: DropLeadData) {
    const res = await fetch(`/api/persons/${person.id}/drop-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Drop lead failed" }));
      throw new Error(body?.error ?? "Drop lead failed");
    }
    // On success, navigate away from person detail per §5.10.
    router.push("/");
  }

  async function handleAdvanceStage() {
    const stages = ["prospect", "initial_contact", "discovery", "pitch", "active_engagement", "soft_commit", "commitment_processing", "kyc_docs", "funded"];
    const currentIdx = stages.indexOf(person.pipelineStage ?? "");
    if (currentIdx >= 0 && currentIdx < stages.length - 1) {
      const nextStage = stages[currentIdx + 1];
      if (confirm(`Advance to ${nextStage.replace(/_/g, " ")}?`)) {
        await fetch(`/api/persons/${person.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newStage: nextStage }),
        });
        window.location.reload();
      }
    }
  }

  const showCloseOut = openCommitments.length > 0;

  if (!expanded && !showPrompt && !showSuccess && !showCloseOut) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-dashed border-gold/25 px-3 py-2 text-xs text-muted-foreground/50 hover:border-gold/50 hover:text-gold transition-colors flex items-center gap-1.5"
      >
        <span className="text-sm font-light leading-none">+</span>
        Log Activity
      </button>
    );
  }

  if (showSuccess) {
    return (
      <div className="rounded-lg border border-healthy-green/30 bg-healthy-green-light px-3 py-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-healthy-green shrink-0" />
        <p className="text-sm font-medium text-healthy-green">Activity logged</p>
      </div>
    );
  }

  if (showCloseOut) {
    return (
      <CloseOutPrompt
        openCommitments={openCommitments}
        onResolve={handleCloseOutResolve}
        onCancel={handleCloseOutCancel}
      />
    );
  }

  if (showPrompt) {
    return (
      <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 space-y-3">
        <p className="text-xs font-medium text-gold uppercase tracking-wider">Next Action</p>
        <div className="flex items-center gap-3">
          <select
            value={promptActionType}
            onChange={(e) => setPromptActionType(e.target.value as typeof promptActionType)}
            className="rounded-md border bg-card px-2 py-1.5 text-xs"
          >
            {NEXT_ACTION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <Input
            value={promptDetail}
            onChange={(e) => setPromptDetail(e.target.value)}
            className="flex-1 text-xs h-8 placeholder:text-muted-foreground/40 placeholder:italic"
            placeholder={person.nextActionDetail || "What needs to happen next?"}
            onKeyDown={(e) => { if (e.key === "Enter") handlePromptConfirm(); }}
            autoFocus
          />
        </div>
        <DateQuickPick value={promptDate} onChange={setPromptDate} />
        <div className="flex items-center justify-between">
          <button
            onClick={handleAdvanceStage}
            className="text-xs text-gold hover:underline"
          >
            Advance to next stage?
          </button>
          <div className="flex items-center gap-3">
            {commitmentsV2Enabled && !showDropLead && (
              <button
                type="button"
                data-testid="drop-lead-link"
                onClick={() => setShowDropLead(true)}
                className="text-xs text-muted-foreground hover:text-navy hover:underline"
              >
                Drop lead ▸
              </button>
            )}
            <button
              onClick={handlePromptConfirm}
              className="rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-navy hover:bg-gold-hover"
            >
              Confirm
            </button>
          </div>
        </div>
        {commitmentsV2Enabled && showDropLead && (
          <DropLeadPanel
            personName={person.fullName}
            onConfirm={handleDropLead}
            onCancel={() => setShowDropLead(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-gold/30 bg-gold/5 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-gold uppercase tracking-wider">Log Activity</p>
        {text && (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="text-[10px] text-white shrink-0"
              style={{ backgroundColor: typeConfig?.color }}
            >
              {typeConfig?.label}
            </Badge>
            {hasOutcome(displayType) && displayOutcome === "attempted" && (
              <Badge variant="outline" className="text-[10px] text-alert-red border-alert-red/30 shrink-0">
                Attempted
              </Badge>
            )}
          </div>
        )}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Called ${person.fullName}, discussed...`}
        className="w-full text-sm h-9 bg-white border-gold/20 focus:border-gold"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }}}
        disabled={submitting}
      />

      <div className="flex items-center justify-between">
        <div
          role="button"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-navy cursor-pointer"
        >
          {showMore ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showMore ? "Less" : "More options"}
        </div>

        {text && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-full bg-gold px-3 py-1 text-[10px] font-medium text-navy hover:bg-gold-hover disabled:opacity-50"
          >
            {submitting ? "Logging..." : "Log Activity"}
          </button>
        )}
      </div>

      {showMore && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType)}
            className="rounded-md border bg-card px-2 py-1.5 text-xs"
          >
            {ACTIVITY_TYPES.filter((t) => !["stage_change", "reassignment"].includes(t.key)).map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          {hasOutcome(activityType) && (
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ActivityOutcome)}
              className="rounded-md border bg-card px-2 py-1.5 text-xs"
            >
              <option value="connected">Connected</option>
              <option value="attempted">Attempted</option>
            </select>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-card px-2 py-1.5 text-xs"
          />
        </div>
      )}
    </div>
  );
}
