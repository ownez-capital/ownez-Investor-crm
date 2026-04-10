import type { Activity, PipelineStage } from "./types";
import { PIPELINE_STAGES, TOUCH_ACTIVITY_TYPES, INACTIVE_STAGES } from "./constants";
import { getTodayCT } from "./format";

export function computeDaysSinceLastTouch(
  activities: Activity[],
  today?: string
): number | null {
  const touchActivities = activities.filter((a) =>
    TOUCH_ACTIVITY_TYPES.includes(a.activityType)
  );

  if (touchActivities.length === 0) return null;

  const sorted = touchActivities.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const lastTouchDate = new Date(sorted[0].date);
  const todayDate = new Date(today ?? getTodayCT());
  const diffMs = todayDate.getTime() - lastTouchDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Computes whether a prospect is stale.
 *
 * Two modes controlled by `openCommitments`:
 *
 * - `openCommitments === null` → **legacy mode** (flag COMMITMENTS_V2 OFF).
 *   Stale is suppressed by a future-dated `nextActionDate` on the Person.
 *   This is the pre-commitments-v2 behavior, preserved for regression safety.
 *
 * - `openCommitments` is an array → **v2 mode** (flag ON).
 *   Stale is suppressed only when at least one open Commitment Set row has a
 *   `commitmentDueDate` strictly after today. `nextActionDate` is ignored.
 *
 * In both modes, nurture/dead/funded stages, stages with no idle threshold, and
 * prospects whose `daysSinceLastTouch` is below the stage threshold are NOT stale.
 *
 * See DESIGN-SPEC.md §5.1 and §5.9.
 */
export function computeIsStale(
  stage: PipelineStage | null,
  daysSinceLastTouch: number | null,
  nextActionDate: string | null,
  openCommitments: Activity[] | null,
  today?: string
): boolean {
  if (!stage || INACTIVE_STAGES.includes(stage)) return false;

  const stageConfig = PIPELINE_STAGES.find((s) => s.key === stage);
  if (!stageConfig || stageConfig.idleThreshold === null) return false;
  if (daysSinceLastTouch === null) return false;

  if (daysSinceLastTouch < stageConfig.idleThreshold) return false;

  const todayDate = new Date(today ?? getTodayCT());

  if (openCommitments !== null) {
    // V2 mode: suppressed only by future-dated open commitments.
    const hasFutureOpenCommitment = openCommitments.some((c) => {
      if (!c.commitmentDueDate) return false;
      return new Date(c.commitmentDueDate) > todayDate;
    });
    if (hasFutureOpenCommitment) return false;
    return true;
  }

  // Legacy mode: future nextActionDate suppresses stale.
  if (nextActionDate) {
    const nextDate = new Date(nextActionDate);
    if (nextDate > todayDate) return false;
  }

  return true;
}

/**
 * Computes whether a prospect is overdue.
 *
 * Two modes controlled by `openCommitments`:
 *
 * - `openCommitments === null` → **legacy mode** (flag COMMITMENTS_V2 OFF).
 *   Overdue iff `nextActionDate` is strictly before today.
 *
 * - `openCommitments` is an array → **v2 mode** (flag ON).
 *   Overdue iff ANY open commitment has `commitmentDueDate` strictly before today.
 *   This is the "honest red" semantics: logging a fresh activity does NOT clear
 *   overdue unless the user explicitly fulfilled or replaced the commitment.
 *   See canary scenarios 2B and 4A in docs/commitments-manual-test-plan.md.
 *
 * Inactive stages (dead, nurture, funded) are never overdue.
 */
export function computeIsOverdue(
  stage: PipelineStage | null,
  nextActionDate: string | null,
  openCommitments: Activity[] | null,
  today?: string
): boolean {
  if (!stage || INACTIVE_STAGES.includes(stage)) return false;

  const todayDate = new Date(today ?? getTodayCT());

  if (openCommitments !== null) {
    // V2 mode: driven by commitment rows, not by Person.nextActionDate.
    return openCommitments.some((c) => {
      if (!c.commitmentDueDate) return false;
      return new Date(c.commitmentDueDate) < todayDate;
    });
  }

  // Legacy mode.
  if (!nextActionDate) return false;
  return new Date(nextActionDate) < todayDate;
}
