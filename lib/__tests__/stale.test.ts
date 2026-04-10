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

describe("computeIsStale", () => {
  it("returns false for nurture stage", () => {
    expect(computeIsStale("nurture", 30, null, today)).toBe(false);
  });

  it("returns false for dead stage", () => {
    expect(computeIsStale("dead", 30, null, today)).toBe(false);
  });

  it("returns false for funded stage", () => {
    expect(computeIsStale("funded", 30, null, today)).toBe(false);
  });

  it("returns false when idle days below threshold", () => {
    // Active Engagement threshold is 14
    expect(computeIsStale("active_engagement", 10, null, today)).toBe(false);
  });

  it("returns true when idle exceeds threshold and no future next action", () => {
    // Pitch threshold is 7
    expect(computeIsStale("pitch", 10, null, today)).toBe(true);
  });

  it("returns false when future next action date suppresses stale", () => {
    expect(computeIsStale("pitch", 10, "2026-03-20", today)).toBe(false);
  });

  it("returns true when next action date is in the past", () => {
    expect(computeIsStale("pitch", 10, "2026-03-15", today)).toBe(true);
  });

  it("returns false when daysSinceLastTouch is null", () => {
    expect(computeIsStale("pitch", null, null, today)).toBe(false);
  });
});

describe("computeIsOverdue", () => {
  it("returns true when next action date < today for active stage", () => {
    expect(computeIsOverdue("active_engagement", "2026-03-15", today)).toBe(true);
  });

  it("returns false when next action date = today", () => {
    expect(computeIsOverdue("active_engagement", "2026-03-17", today)).toBe(false);
  });

  it("returns false for dead stage", () => {
    expect(computeIsOverdue("dead", "2026-03-15", today)).toBe(false);
  });

  it("returns false for funded stage", () => {
    expect(computeIsOverdue("funded", "2026-03-15", today)).toBe(false);
  });

  it("returns false when no next action date", () => {
    expect(computeIsOverdue("active_engagement", null, today)).toBe(false);
  });
});
