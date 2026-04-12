// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { DropLeadPanel } from "../drop-lead-panel";

afterEach(() => {
  cleanup();
});

describe("DropLeadPanel — initial state", () => {
  it("shows Dead and Nurture pills up front", () => {
    render(
      <DropLeadPanel
        personName="Robert Calloway"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId("drop-lead-panel")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-dead")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-nurture")).toBeTruthy();
    // Confirm button not rendered until a target is picked.
    expect(screen.queryByTestId("drop-lead-confirm")).toBeNull();
    // No chips yet.
    expect(screen.queryByTestId("drop-lead-reason-not_accredited")).toBeNull();
  });

  it("includes person name in label", () => {
    render(
      <DropLeadPanel
        personName="Robert Calloway"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/Robert Calloway/)).toBeTruthy();
  });
});

describe("DropLeadPanel — Dead path", () => {
  it("clicking Dead reveals all 6 lost-reason chips", () => {
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    expect(screen.getByTestId("drop-lead-reason-not_accredited")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-reason-not_interested")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-reason-ghosted")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-reason-timing")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-reason-went_elsewhere")).toBeTruthy();
    expect(screen.getByTestId("drop-lead-reason-other")).toBeTruthy();
  });

  it("confirm button disabled until a reason is picked", () => {
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    const confirm = screen.getByTestId("drop-lead-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("drop-lead-reason-ghosted"));
    expect(confirm.disabled).toBe(false);
  });

  it("confirming Dead emits { target: 'dead', lostReason, reasonNote }", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    fireEvent.click(screen.getByTestId("drop-lead-reason-not_accredited"));
    const note = screen.getByPlaceholderText(/Optional note/i);
    fireEvent.change(note, { target: { value: "Below min net worth" } });
    fireEvent.click(screen.getByTestId("drop-lead-confirm"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      target: "dead",
      lostReason: "not_accredited",
      reasonNote: "Below min net worth",
    });
  });

  it("omits reasonNote when note is empty", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    fireEvent.click(screen.getByTestId("drop-lead-reason-timing"));
    fireEvent.click(screen.getByTestId("drop-lead-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      target: "dead",
      lostReason: "timing",
      reasonNote: undefined,
    });
  });
});

describe("DropLeadPanel — Nurture path", () => {
  it("clicking Nurture reveals a date quick pick prefilled ~6 months out", () => {
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-nurture"));
    // The DateQuickPick renders a <input type="date">.
    const dateInput = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();
    expect(dateInput!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("confirming Nurture emits { target: 'nurture', reengageDate }", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-nurture"));
    const dateInput = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-10-10" } });
    fireEvent.click(screen.getByTestId("drop-lead-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      target: "nurture",
      reengageDate: "2026-10-10",
    });
  });
});

describe("DropLeadPanel — error handling", () => {
  it("shows an inline error if onConfirm rejects", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(new Error("Server exploded"));
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    fireEvent.click(screen.getByTestId("drop-lead-reason-ghosted"));
    fireEvent.click(screen.getByTestId("drop-lead-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("drop-lead-error")).toBeTruthy();
    });
    expect(screen.getByText(/Server exploded/)).toBeTruthy();
  });

  it("re-enables confirm button after failed submit", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("fail"));
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("drop-lead-dead"));
    fireEvent.click(screen.getByTestId("drop-lead-reason-ghosted"));
    fireEvent.click(screen.getByTestId("drop-lead-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("drop-lead-error")).toBeTruthy();
    });
    const confirm = screen.getByTestId("drop-lead-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });
});

describe("DropLeadPanel — keyboard hotkeys", () => {
  it("pressing D selects Dead", () => {
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("drop-lead-dead").getAttribute("aria-pressed")).toBe(
      "true"
    );
    // Dead chips should now be visible.
    expect(screen.getByTestId("drop-lead-reason-ghosted")).toBeTruthy();
  });

  it("pressing N selects Nurture", () => {
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByTestId("drop-lead-nurture").getAttribute("aria-pressed")).toBe(
      "true"
    );
    // Nurture shows the date quick pick.
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
  });

  it("Escape calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <DropLeadPanel
        personName="Robert"
        onConfirm={async () => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
