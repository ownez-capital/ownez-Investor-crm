// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CloseOutPrompt } from "../close-out-prompt";
import type { Activity } from "@/lib/types";

function makeCommitment(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "c1",
    personId: "p1",
    activityType: "commitment_set",
    source: "manual",
    date: "2026-03-01",
    time: null,
    outcome: "connected",
    detail: "",
    documentsAttached: [],
    loggedById: "u1",
    annotation: null,
    fulfillsCommitmentId: null,
    commitmentType: "follow_up",
    commitmentDetail: "Q3 deck",
    commitmentDueDate: "2026-03-05",
    commitmentStatus: "open",
    commitmentClosedDate: null,
    ...overrides,
  };
}

// Freeze "today" to 2026-03-07 so a Mar 5 due date is exactly 2 days overdue.
const FIXED_NOW = new Date("2026-03-07T12:00:00-06:00");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("CloseOutPrompt — single commitment", () => {
  it("renders commitment label, detail, due date, and overdue suffix", () => {
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId("close-out-prompt")).toBeTruthy();
    // Human label for "follow_up"
    expect(screen.getByText(/Follow Up/)).toBeTruthy();
    // Detail text
    expect(screen.getByText(/Q3 deck/)).toBeTruthy();
    // Overdue suffix — 2 days overdue (3/5 → 3/7)
    expect(screen.getByText(/2d overdue/)).toBeTruthy();
  });

  it("renders all three action buttons with correct testids", () => {
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId("close-out-fulfilled")).toBeTruthy();
    expect(screen.getByTestId("close-out-pending")).toBeTruthy();
    expect(screen.getByTestId("close-out-replace")).toBeTruthy();
  });

  it("returns null when openCommitments is empty", () => {
    const { container } = render(
      <CloseOutPrompt
        openCommitments={[]}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("pressing D then Enter confirms with action=fulfilled", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "d" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toEqual([
      { commitmentId: "c1", action: "fulfilled" },
    ]);
  });

  it("pressing P then Enter confirms with action=pending", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toEqual([
      { commitmentId: "c1", action: "pending" },
    ]);
  });

  it("pressing R then Enter confirms with action=replace", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve.mock.calls[0][0]).toEqual([
      { commitmentId: "c1", action: "replace" },
    ]);
  });

  it("defaults to pending when user confirms without choosing", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("close-out-confirm"));
    expect(onResolve).toHaveBeenCalledWith([
      { commitmentId: "c1", action: "pending" },
    ]);
  });

  it("click F button then click Confirm emits fulfilled", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment()]}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("close-out-fulfilled"));
    fireEvent.click(screen.getByTestId("close-out-confirm"));
    expect(onResolve).toHaveBeenCalledWith([
      { commitmentId: "c1", action: "fulfilled" },
    ]);
  });
});

describe("CloseOutPrompt — multiple commitments", () => {
  const commitments = [
    makeCommitment({
      id: "c-a",
      commitmentType: "follow_up",
      commitmentDetail: "Q3 deck",
      commitmentDueDate: "2026-03-05",
    }),
    makeCommitment({
      id: "c-b",
      commitmentType: "schedule_meeting",
      commitmentDetail: "Intro call",
      commitmentDueDate: "2026-03-06",
    }),
  ];

  it("renders both commitments with suffixed testids", () => {
    render(
      <CloseOutPrompt
        openCommitments={commitments}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId("close-out-fulfilled-c-a")).toBeTruthy();
    expect(screen.getByTestId("close-out-pending-c-a")).toBeTruthy();
    expect(screen.getByTestId("close-out-replace-c-a")).toBeTruthy();
    expect(screen.getByTestId("close-out-fulfilled-c-b")).toBeTruthy();
    expect(screen.getByTestId("close-out-pending-c-b")).toBeTruthy();
    expect(screen.getByTestId("close-out-replace-c-b")).toBeTruthy();
    expect(screen.getByText(/Q3 deck/)).toBeTruthy();
    expect(screen.getByText(/Intro call/)).toBeTruthy();
  });

  it("defaults every commitment to pending", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={commitments}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("close-out-confirm"));
    expect(onResolve).toHaveBeenCalledWith([
      { commitmentId: "c-a", action: "pending" },
      { commitmentId: "c-b", action: "pending" },
    ]);
  });

  it("allows independent selection per commitment", () => {
    const onResolve = vi.fn();
    render(
      <CloseOutPrompt
        openCommitments={commitments}
        onResolve={onResolve}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("close-out-fulfilled-c-a"));
    fireEvent.click(screen.getByTestId("close-out-replace-c-b"));
    fireEvent.click(screen.getByTestId("close-out-confirm"));
    expect(onResolve).toHaveBeenCalledWith([
      { commitmentId: "c-a", action: "fulfilled" },
      { commitmentId: "c-b", action: "replace" },
    ]);
  });
});

describe("CloseOutPrompt — overdue text", () => {
  it.each([
    { due: "2026-03-05", expected: "2d overdue" },
    { due: "2026-03-06", expected: "1d overdue" },
    { due: "2026-02-28", expected: "7d overdue" },
  ])("computes $expected for due $due", ({ due, expected }) => {
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment({ commitmentDueDate: due })]}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(new RegExp(expected))).toBeTruthy();
  });

  it("shows no overdue suffix for a future or today due date", () => {
    render(
      <CloseOutPrompt
        openCommitments={[makeCommitment({ commitmentDueDate: "2026-03-10" })]}
        onResolve={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByText(/overdue/)).toBeNull();
  });
});
