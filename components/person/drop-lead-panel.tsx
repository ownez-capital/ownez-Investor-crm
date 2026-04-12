"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateQuickPick } from "@/components/ui/date-quick-pick";
import { LOST_REASONS } from "@/lib/constants";
import { computeDateOffset } from "@/lib/format";
import type { LostReason } from "@/lib/types";

/**
 * Payload emitted when the user confirms a Drop Lead action.
 * See DESIGN-SPEC.md §5.10.
 */
export type DropLeadData =
  | { target: "dead"; lostReason: LostReason; reasonNote?: string }
  | { target: "nurture"; reengageDate: string };

export interface DropLeadPanelProps {
  personName: string;
  /** Async so the panel can show loading state while the parent persists. */
  onConfirm: (data: DropLeadData) => Promise<void>;
  onCancel: () => void;
}

type Target = "dead" | "nurture" | null;

/**
 * Compute a date string +6 months from today in CT, for the Nurture default.
 */
function sixMonthsOutCT(): string {
  // Start from today, add ~26 weeks via repeated +2w offsets on top of +1w,
  // but computeDateOffset only supports short ranges. Compute directly.
  const base = computeDateOffset("today");
  const d = new Date(base + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.toISOString().split("T")[0];
}

export function DropLeadPanel({
  personName,
  onConfirm,
  onCancel,
}: DropLeadPanelProps) {
  const [target, setTarget] = useState<Target>(null);
  const [lostReason, setLostReason] = useState<LostReason | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [reengageDate, setReengageDate] = useState<string>(() => sixMonthsOutCT());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const reasons = useMemo(
    () =>
      LOST_REASONS as {
        key: LostReason;
        label: string;
      }[],
    []
  );

  async function handleConfirm() {
    if (submitting) return;
    setError(null);

    let payload: DropLeadData | null = null;
    if (target === "dead") {
      if (!lostReason) {
        setError("Pick a reason first.");
        return;
      }
      payload = {
        target: "dead",
        lostReason,
        reasonNote: reasonNote.trim() || undefined,
      };
    } else if (target === "nurture") {
      if (!reengageDate) {
        setError("Pick a re-engage date.");
        return;
      }
      payload = { target: "nurture", reengageDate };
    }

    if (!payload) return;

    setSubmitting(true);
    try {
      await onConfirm(payload);
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Top-level hotkeys: D / N choose target when no target is picked yet,
  // Enter confirms, Escape cancels. Arrow keys navigate chips when in dead mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const isTyping =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if (!isTyping && target === null) {
        const k = e.key.toLowerCase();
        if (k === "d") {
          e.preventDefault();
          setTarget("dead");
          return;
        }
        if (k === "n") {
          e.preventDefault();
          setTarget("nurture");
          return;
        }
      }

      if (target === "dead" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        if (isTyping) return;
        e.preventDefault();
        const currentIdx = lostReason
          ? reasons.findIndex((r) => r.key === lostReason)
          : -1;
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx =
          currentIdx === -1
            ? 0
            : (currentIdx + delta + reasons.length) % reasons.length;
        const nextReason = reasons[nextIdx]?.key;
        if (nextReason) {
          setLostReason(nextReason);
          chipRefs.current[nextIdx]?.focus();
        }
      }

      if (e.key === "Enter" && !isTyping) {
        // Only confirm when we actually have enough info; otherwise ignore.
        if (target === "dead" && lostReason) {
          e.preventDefault();
          void handleConfirm();
        } else if (target === "nurture" && reengageDate) {
          e.preventDefault();
          void handleConfirm();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, lostReason, reengageDate, reasons, submitting]);

  return (
    <div
      data-testid="drop-lead-panel"
      role="group"
      aria-label={`Drop lead: ${personName}`}
      className="rounded-lg border border-muted-foreground/20 bg-muted/40 p-4 space-y-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-navy">
            Drop lead
          </p>
          <p className="text-xs text-muted-foreground">
            Move {personName} out of the active pipeline.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-navy"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="drop-lead-dead"
          aria-pressed={target === "dead"}
          onClick={() => {
            setTarget("dead");
            setError(null);
          }}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            target === "dead"
              ? "bg-gold text-navy"
              : "bg-card text-navy hover:bg-gold/20"
          }`}
        >
          <span className="font-semibold">[D]</span> Dead
        </button>
        <button
          type="button"
          data-testid="drop-lead-nurture"
          aria-pressed={target === "nurture"}
          onClick={() => {
            setTarget("nurture");
            setError(null);
          }}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            target === "nurture"
              ? "bg-gold text-navy"
              : "bg-card text-navy hover:bg-gold/20"
          }`}
        >
          <span className="font-semibold">[N]</span> Nurture
        </button>
      </div>

      {target === "dead" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {reasons.map((r, i) => {
              const active = lostReason === r.key;
              return (
                <button
                  key={r.key}
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                  type="button"
                  data-testid={`drop-lead-reason-${r.key}`}
                  aria-pressed={active}
                  onClick={() => setLostReason(r.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-gold text-navy"
                      : "bg-card text-muted-foreground hover:bg-gold/20 hover:text-navy"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Optional note (what did they say?)"
            className="w-full rounded-md border bg-card px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/50"
          />
        </div>
      )}

      {target === "nurture" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Re-engage on:
          </p>
          <DateQuickPick value={reengageDate} onChange={setReengageDate} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-testid="drop-lead-error"
          className="text-xs font-medium text-alert-red"
        >
          {error}
        </p>
      )}

      {target !== null && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            data-testid="drop-lead-confirm"
            onClick={handleConfirm}
            disabled={
              submitting ||
              (target === "dead" && !lostReason) ||
              (target === "nurture" && !reengageDate)
            }
            className="rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-navy hover:bg-gold-hover disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}

export default DropLeadPanel;
