"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { NEXT_ACTION_TYPES } from "@/lib/constants";
import { formatDate, getTodayCT } from "@/lib/format";
import type { Activity } from "@/lib/types";

/**
 * Resolution a user selects for a single open commitment during close-out.
 * See DESIGN-SPEC.md §5.9 and §6.4.2.
 */
export type CloseOutResolution = {
  commitmentId: string;
  action: "fulfilled" | "pending" | "replace";
};

export interface CloseOutPromptProps {
  /**
   * Open commitments that the user must resolve before continuing.
   * Will almost always be length 1; length > 1 is a degenerate recovery case.
   */
  openCommitments: Activity[];
  /**
   * Called once the user confirms resolutions for every commitment.
   * May be async; the component will await it so that the parent's
   * post-resolution state updates (like showing the Next Action prompt) run
   * before the button click returns, avoiding races with Playwright tests
   * that assert on the next state immediately after the click.
   */
  onResolve: (resolutions: CloseOutResolution[]) => void | Promise<void>;
  /** Called when the user abandons the prompt. */
  onCancel: () => void;
}

type ResolutionAction = CloseOutResolution["action"];

// User-visible copy uses plain language ("Done", "stays open"). The internal
// resolution key stays "fulfilled" because it maps 1:1 to the API contract
// (`status: "fulfilled"` in the close-out POST body) and the testid
// (`close-out-fulfilled`). Do not rename the key.
//
// The hotkey letter D matches the button title "Done" for readability. Earlier
// iterations used F (for Fulfilled), which has been retired from user copy.
// D does NOT collide with DropLeadPanel's D-for-Dead hotkey because the two
// panels are mutually exclusive — CloseOutPrompt resolves first, THEN the
// Next Action prompt (which can expand DropLeadPanel) appears.
const ACTION_META: {
  key: ResolutionAction;
  hotkey: "D" | "P" | "R";
  title: string;
  description: string;
}[] = [
  {
    key: "fulfilled",
    hotkey: "D",
    title: "Done",
    description: "this activity handled it",
  },
  {
    key: "pending",
    hotkey: "P",
    title: "Still pending",
    description: "logging something unrelated, stays open",
  },
  {
    key: "replace",
    hotkey: "R",
    title: "Replace",
    description: "drop this, set a new one",
  },
];

function commitmentTypeLabel(key: string | null | undefined): string {
  if (!key) return "Next Action";
  return NEXT_ACTION_TYPES.find((t) => t.key === key)?.label ?? "Next Action";
}

function overdueSuffix(dueDate: string | null | undefined, today: string): string {
  if (!dueDate) return "";
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  const diffMs = now.getTime() - due.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "";
  return ` (${diffDays}d overdue)`;
}

export function CloseOutPrompt({
  openCommitments,
  onResolve,
  onCancel,
}: CloseOutPromptProps) {
  const today = useMemo(() => getTodayCT(), []);

  // Default every commitment to "pending" (safest default — preserves "honest red").
  const [resolutions, setResolutions] = useState<Record<string, ResolutionAction>>(
    () => Object.fromEntries(openCommitments.map((c) => [c.id, "pending" as ResolutionAction]))
  );

  // Keep state in sync if the incoming list changes (edge case: parent swaps data).
  useEffect(() => {
    setResolutions((prev) => {
      const next: Record<string, ResolutionAction> = {};
      for (const c of openCommitments) {
        next[c.id] = prev[c.id] ?? "pending";
      }
      return next;
    });
  }, [openCommitments]);

  const isSingle = openCommitments.length === 1;

  function setAction(commitmentId: string, action: ResolutionAction) {
    setResolutions((prev) => ({ ...prev, [commitmentId]: action }));
  }

  async function resolveWith(nextResolutions: Record<string, ResolutionAction>) {
    const payload: CloseOutResolution[] = openCommitments.map((c) => ({
      commitmentId: c.id,
      action: nextResolutions[c.id] ?? "pending",
    }));
    await onResolve(payload);
  }

  async function handleConfirm() {
    await resolveWith(resolutions);
  }

  /**
   * Clicking F/P/R on a SINGLE-commitment prompt is the submit — the user's
   * choice is unambiguous and requiring a second click on Confirm is friction.
   * Multi-commitment mode still requires an explicit Confirm click so the
   * user can set each commitment independently before submitting.
   */
  async function handleActionClick(commitmentId: string, action: ResolutionAction) {
    setAction(commitmentId, action);
    if (isSingle) {
      await resolveWith({ ...resolutions, [commitmentId]: action });
    }
  }

  // Keyboard: F/P/R choose, Enter confirms. For multi-commitment case the hotkeys
  // still work but only meaningfully in the single-commitment case; in multi mode
  // they apply to the first (top) commitment as a convenience.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in an input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      const first = openCommitments[0];
      if (!first) return;

      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        setAction(first.id, "fulfilled");
      } else if (key === "p") {
        e.preventDefault();
        setAction(first.id, "pending");
      } else if (key === "r") {
        e.preventDefault();
        setAction(first.id, "replace");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCommitments, resolutions]);

  if (openCommitments.length === 0) return null;

  return (
    <div
      data-testid="close-out-prompt"
      className="rounded-lg border border-alert-red/30 bg-alert-red/5 p-4 space-y-3"
      role="group"
      aria-label="Outstanding next action close-out"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-alert-red"
          aria-hidden
        />
        <p className="text-xs font-semibold uppercase tracking-wider text-alert-red">
          {openCommitments.length > 1
            ? `Outstanding (${openCommitments.length})`
            : "Outstanding"}
        </p>
      </div>

      <ul className="space-y-4">
        {openCommitments.map((c) => {
          const current = resolutions[c.id] ?? "pending";
          const label = commitmentTypeLabel(c.commitmentType);
          const detail = c.commitmentDetail?.trim();
          const dueText = c.commitmentDueDate
            ? `due ${formatDate(c.commitmentDueDate)}`
            : "no due date";
          const overdue = overdueSuffix(c.commitmentDueDate, today);

          return (
            <li key={c.id} className="space-y-2">
              <p className="text-sm text-navy">
                <span className="font-medium">{label}</span>
                {detail ? <span> — {detail}</span> : null}
                <span className="text-muted-foreground"> — {dueText}</span>
                {overdue ? (
                  <span className="font-semibold text-alert-red">{overdue}</span>
                ) : null}
              </p>

              <div className="flex flex-wrap gap-2">
                {ACTION_META.map((meta) => {
                  const active = current === meta.key;
                  const testid = isSingle
                    ? `close-out-${meta.key}`
                    : `close-out-${meta.key}-${c.id}`;
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      data-testid={testid}
                      aria-pressed={active}
                      onClick={() => handleActionClick(c.id, meta.key)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-gold text-navy"
                          : "bg-muted text-muted-foreground hover:bg-gold/20 hover:text-navy"
                      }`}
                    >
                      <span className="font-semibold">[{meta.hotkey}]</span>{" "}
                      {meta.title}
                      <span className="ml-1 font-normal opacity-70">
                        — {meta.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-navy"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="close-out-confirm"
          onClick={handleConfirm}
          className="rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-navy hover:bg-gold-hover"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

export default CloseOutPrompt;
