import { describe, it, expect } from "vitest";
import { computeDaysSinceLastTouch, computeIsStale, computeIsOverdue } from "../stale";
import type { Activity } from "../types";

const today = "2026-03-17";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    personId: "p1",
    activityType: "call",
    source: "manual",
    date: "2026-03-15",
    time: null,
    outcome: "connected",
    detail: "Test call",
    documentsAttached: [],
    loggedById: "u1",
    annotation: null,
    fulfillsCommitmentId: null,
    commitmentType: null,
    commitmentDetail: null,
    commitmentDueDate: null,
    commitmentStatus: null,
    commitmentClosedDate: null,
    ...overrides,
  };
}

/** Helper: build an open Commitment Set row for a given due date. */
function makeOpenCommitment(dueDate: string, id = "c1"): Activity {
  return makeActivity({
    id,
    activityType: "commitment_set",
    commitmentType: "follow_up",
    commitmentDetail: "Follow up",
    commitmentDueDate: dueDate,
    commitmentStatus: "open",
  });
}

describe("computeDaysSinceLastTouch", () => {
  it("returns null when no activities", () => {
    expect(computeDaysSinceLastTouch([], today)).toBeNull();
  });

  it("excludes stage_change activities from touch count", () => {
    const activities = [
      makeActivity({ activityType: "stage_change", date: "2026-03-16" }),
    ];
    expect(computeDaysSinceLastTouch(activities, today)).toBeNull();
  });

  it("excludes reassignment activities from touch count", () => {
    const activities = [
      makeActivity({ activityType: "reassignment", date: "2026-03-16" }),
    ];
    expect(computeDaysSinceLastTouch(activities, today)).toBeNull();
  });

  it("computes correct days from most recent real touch", () => {
    const activities = [
      makeActivity({ activityType: "call", date: "2026-03-14" }),
      makeActivity({ activityType: "email", date: "2026-03-10" }),
    ];
    expect(computeDaysSinceLastTouch(activities, today)).toBe(3);
  });

  it("ignores stage_change when computing last touch with mixed activities", () => {
    const activities = [
      makeActivity({ activityType: "stage_change", date: "2026-03-16" }),
      makeActivity({ activityType: "call", date: "2026-03-12" }),
    ];
    expect(computeDaysSinceLastTouch(activities, today)).toBe(5);
  });
});

// ─── Legacy mode (COMMITMENTS_V2 off — openCommitments=null) ───
// These tests preserve the pre-feature behavior exactly. If any of them break,
// the feature flag safety is broken.

describe("computeIsStale — legacy mode (openCommitments=null)", () => {
  it("returns false for nurture stage", () => {
    expect(computeIsStale("nurture", 30, null, null, today)).toBe(false);
  });

  it("returns false for dead stage", () => {
    expect(computeIsStale("dead", 30, null, null, today)).toBe(false);
  });

  it("returns false for funded stage", () => {
    expect(computeIsStale("funded", 30, null, null, today)).toBe(false);
  });

  it("returns false when idle days below threshold", () => {
    // Active Engagement threshold is 14
    expect(computeIsStale("active_engagement", 10, null, null, today)).toBe(false);
  });

  it("returns true when idle exceeds threshold and no future next action", () => {
    // Pitch threshold is 7
    expect(computeIsStale("pitch", 10, null, null, today)).toBe(true);
  });

  it("returns false when future next action date suppresses stale", () => {
    expect(computeIsStale("pitch", 10, "2026-03-20", null, today)).toBe(false);
  });

  it("returns true when next action date is in the past", () => {
    expect(computeIsStale("pitch", 10, "2026-03-15", null, today)).toBe(true);
  });

  it("returns false when daysSinceLastTouch is null", () => {
    expect(computeIsStale("pitch", null, null, null, today)).toBe(false);
  });
});

describe("computeIsOverdue — legacy mode (openCommitments=null)", () => {
  it("returns true when next action date < today for active stage", () => {
    expect(computeIsOverdue("active_engagement", "2026-03-15", null, today)).toBe(true);
  });

  it("returns false when next action date = today", () => {
    expect(computeIsOverdue("active_engagement", "2026-03-17", null, today)).toBe(false);
  });

  it("returns false for dead stage", () => {
    expect(computeIsOverdue("dead", "2026-03-15", null, today)).toBe(false);
  });

  it("returns false for funded stage", () => {
    expect(computeIsOverdue("funded", "2026-03-15", null, today)).toBe(false);
  });

  it("returns false when no next action date", () => {
    expect(computeIsOverdue("active_engagement", null, null, today)).toBe(false);
  });
});

// ─── V2 mode (COMMITMENTS_V2 on — openCommitments is an array) ───
// These tests cover the new "honest red" behavior. Scenarios 2B and 4A in
// docs/commitments-manual-test-plan.md are the business-critical canaries.

describe("computeIsOverdue — v2 mode", () => {
  it("flag on, no open commitments → not overdue (even with past nextActionDate)", () => {
    // In v2 mode, nextActionDate is ignored entirely.
    expect(
      computeIsOverdue("active_engagement", "2026-03-10", [], today)
    ).toBe(false);
  });

  it("flag on, one open past-due commitment → overdue (canary scenario 2B)", () => {
    // Robert Calloway after a Still-Pending close-out: commitment still open,
    // due yesterday, he was just touched today. Must STILL be overdue.
    const commitments = [makeOpenCommitment("2026-03-16")];
    expect(
      computeIsOverdue("active_engagement", null, commitments, today)
    ).toBe(true);
  });

  it("flag on, one fulfilled commitment due yesterday → not overdue", () => {
    // Terminal state — fulfilled commitments never drive overdue.
    // Typically the caller filters to open before passing, but verify the
    // function tolerates empty input.
    expect(
      computeIsOverdue("active_engagement", null, [], today)
    ).toBe(false);
  });

  it("flag on, one future-dated open commitment → not overdue", () => {
    // Marcus Johnson: commitment due 5 days from now, not overdue.
    const commitments = [makeOpenCommitment("2026-03-22")];
    expect(
      computeIsOverdue("active_engagement", null, commitments, today)
    ).toBe(false);
  });

  it("flag on, one cancelled commitment past-due → not overdue", () => {
    // A dropped lead that was resurrected. Cancelled commitments are terminal
    // and must never drive overdue. Callers should filter to open, so this
    // degenerate case is just an empty-array passthrough.
    expect(
      computeIsOverdue("active_engagement", null, [], today)
    ).toBe(false);
  });

  it("flag on, due today → not overdue (strictly-before semantics)", () => {
    // Matches legacy behavior: "next action date = today" is not overdue.
    // Close-out prompt in Quick Log still fires (that's a separate <= check),
    // but the dashboard overdue flag is strictly past.
    const commitments = [makeOpenCommitment("2026-03-17")];
    expect(
      computeIsOverdue("active_engagement", null, commitments, today)
    ).toBe(false);
  });

  it("flag on, dead stage is never overdue even with past-due commitment", () => {
    const commitments = [makeOpenCommitment("2026-03-10")];
    expect(computeIsOverdue("dead", null, commitments, today)).toBe(false);
  });
});

describe("computeIsStale — v2 mode", () => {
  it("flag on, idle over threshold, no commitments → stale", () => {
    // No future-dated commitment to suppress stale.
    expect(computeIsStale("pitch", 10, null, [], today)).toBe(true);
  });

  it("flag on, idle over threshold, future-dated open commitment → not stale", () => {
    // The future commitment suppresses stale even if daysIdle is over threshold.
    const commitments = [makeOpenCommitment("2026-03-22")];
    expect(computeIsStale("pitch", 10, null, commitments, today)).toBe(false);
  });

  it("flag on, idle over threshold, only past-due open commitment → stale", () => {
    // Past-due does not suppress stale (the prospect is both stale AND overdue,
    // though visually overdue takes precedence).
    const commitments = [makeOpenCommitment("2026-03-10")];
    expect(computeIsStale("pitch", 10, null, commitments, today)).toBe(true);
  });

  it("flag on, v2 mode ignores nextActionDate (even future one)", () => {
    // This is the key difference from legacy: in v2, the Person-level
    // nextActionDate is not used for stale suppression at all. Only open
    // commitments matter. So a future nextActionDate but NO open commitment
    // means the prospect is stale.
    expect(
      computeIsStale("pitch", 10, "2026-03-22", [], today)
    ).toBe(true);
  });

  it("flag on, idle under threshold → not stale regardless of commitments", () => {
    expect(computeIsStale("active_engagement", 5, null, [], today)).toBe(false);
  });
});
