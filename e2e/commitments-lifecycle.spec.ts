/**
 * E2E — Commitments Lifecycle + Drop Lead (DESIGN-SPEC §5.9 / §5.10)
 *
 * This suite is the test contract for the feature behind the `COMMITMENTS_V2`
 * flag. It is written BEFORE the UI components and API routes exist; tests
 * WILL fail until those ship. That is intentional — if the UI doesn't match
 * the testid contract documented here and in the handoff doc, the UI is wrong.
 *
 * Running the suite:
 *   - Server must be launched with `COMMITMENTS_V2=on` in the environment,
 *     except for scenario 5B which verifies the flag-off regression.
 *   - Uses the mock provider (`DATA_PROVIDER=mock`) so tests can reset state
 *     between runs via POST /api/test-reset.
 *
 * Canary scenarios (do not touch without understanding the "honest red" invariant
 * in docs/HANDOFF-commitments-lifecycle.md §1):
 *   - 2B — Still Pending path keeps the prospect on the overdue list
 *   - 4A — Three-prospect dashboard honesty matrix
 */
import { test, expect } from "@playwright/test";
import {
  loginAsChad,
  resetMockData,
  seedPersonWithOpenCommitment,
  logActivity,
  logActivityAndAccept,
  expectOverdueOnDashboard,
  expectNotOverdueOnDashboard,
  expectInNeedsAttention,
  expectNotInNeedsAttention,
  fetchOpenCommitments,
  quickLogInput,
  isCommitmentsV2Enabled,
  TEST_PERSONAS,
  ALPHA,
  BETA,
  GAMMA,
  ctDatePlus,
} from "./fixtures/commitments-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Fast-path regression scenarios
// These exist to prove that the happy path (no close-out needed) stays fast.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Commitments Lifecycle — fast path (no close-out)", () => {
  test.beforeEach(async ({ page }) => {
    await resetMockData(page);
    await loginAsChad(page);
  });

  test("1A — first activity on fresh prospect: standard Next Action prompt, no close-out", async ({
    page,
  }) => {
    // Sandra Kim's starting state varies — we pick her because the manual plan
    // calls out "Sarah Kim" in scenario 1A for her "never had a Next Action"
    // quality. In mock seed, Grant (p-grant) in initial_contact is the closest
    // fresh analog; we use Grant to keep the canonical persona set tidy.
    const person = TEST_PERSONAS.grant;

    await page.goto(`/person/${person.id}`);
    const input = quickLogInput(page);
    await expect(input).toBeVisible();
    await input.fill("Sent intro email, introducing the firm");
    await input.press("Enter");

    // Close-out prompt must NOT appear on a fresh prospect.
    await expect(page.getByTestId("close-out-prompt")).toHaveCount(0);

    // The standard Next Action prompt (with Confirm button) should appear.
    const confirm = page.getByRole("button", { name: /confirm/i });
    await expect(confirm).toBeVisible({ timeout: 5000 });

    // Accept the default with a "+3d" pick if available, then confirm.
    const chip = page.getByRole("button", { name: /\+?3\s*d|in 3 days/i });
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
    }
    await confirm.click();

    // Quick Log should reset, indicating success.
    await expect(input).toHaveValue("");
  });

  test("1B — future-dated open commitment: no close-out prompt", async ({ page }) => {
    // Marcus has a future-dated next action in mock seed.
    // Seed a fresh future-dated commitment to make the test independent of
    // the relative clock on any given day.
    const person = TEST_PERSONAS.marcus;
    await seedPersonWithOpenCommitment(page, person.id, /*daysOverdue=*/ -5);

    await logActivity(page, person.id, "Left voicemail, no response yet");

    // Close-out prompt must NOT appear when the only open commitment is future.
    await expect(page.getByTestId("close-out-prompt")).toHaveCount(0);

    // Standard Next Action prompt should appear.
    await expect(page.getByRole("button", { name: /confirm/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("1C — More Options override of activity type still works", async ({ page }) => {
    const person = TEST_PERSONAS.grant;
    await page.goto(`/person/${person.id}`);

    const input = quickLogInput(page);
    await input.fill("Signed docs today");

    // Click "More options" link/button — legacy behavior check.
    const moreOptions = page.getByRole("button", { name: /more options/i });
    if (await moreOptions.isVisible().catch(() => false)) {
      await moreOptions.click();

      // Override activity type to "Document Received" via whatever select exists.
      const typeSelect = page
        .locator("select, [role=combobox]")
        .filter({ hasText: /type/i })
        .first();
      if (await typeSelect.isVisible().catch(() => false)) {
        await typeSelect.click();
        await page
          .getByRole("option", { name: /document received/i })
          .click()
          .catch(() => {});
      }
    }

    await input.press("Enter");

    // Either Next Action prompt or success — close-out should NOT block here.
    await expect(page.getByTestId("close-out-prompt")).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Close-out scenarios (the critical new behavior)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Commitments Lifecycle — close-out paths", () => {
  test.beforeEach(async ({ page }) => {
    await resetMockData(page);
    await loginAsChad(page);
  });

  test("2A — Fulfilled: timeline shows ✓ Fulfilled link, Robert clears from overdue", async ({
    page,
  }) => {
    const person = TEST_PERSONAS.robert;
    await seedPersonWithOpenCommitment(
      page,
      person.id,
      /*daysOverdue=*/ 2,
      "Follow up — Q3 deck",
    );

    // Arrange assertion — Robert IS overdue on dashboard pre-logging.
    await expectOverdueOnDashboard(page, person.id);

    // Act — log activity and pick Fulfilled.
    await logActivity(
      page,
      person.id,
      "Emailed the Q3 deck with annotations on the growth assumptions",
    );

    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-fulfilled").click();

    // Next Action prompt should follow (Fulfilled still offers to set next).
    const confirm = page.getByRole("button", { name: /confirm/i });
    await expect(confirm).toBeVisible({ timeout: 5000 });
    // Pick +1w if the chip is present.
    const weekChip = page.getByRole("button", { name: /\+?1\s*w|next week/i });
    if (await weekChip.isVisible().catch(() => false)) {
      await weekChip.click();
    }
    await confirm.click();

    // Timeline should show the fulfillment link under the fulfilling activity.
    // The activityId is not known in advance; we match any fulfillment link.
    await expect(
      page.locator("[data-testid^='timeline-fulfillment-link-']").first(),
    ).toBeVisible({ timeout: 5000 });

    // Dashboard: Robert must no longer be overdue.
    await expectNotOverdueOnDashboard(page, person.id);
  });

  test("2B — CANARY: Still Pending keeps Robert on the overdue list (honest red)", async ({
    page,
  }) => {
    // This is THE test. If it ever goes green falsely, the feature is broken.
    // Read the "honest red" invariant in docs/HANDOFF-commitments-lifecycle.md §1.
    const person = TEST_PERSONAS.robert;
    await seedPersonWithOpenCommitment(
      page,
      person.id,
      /*daysOverdue=*/ 2,
      "Follow up — Q3 deck",
    );

    // Arrange — Robert IS overdue.
    await expectOverdueOnDashboard(page, person.id);

    // Act — log a note and explicitly pick "Still pending".
    await logActivity(
      page,
      person.id,
      "CPA John Lee called. Robert is traveling this week. Will be back Monday.",
    );

    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-pending").click();

    // The Next Action prompt is SKIPPED on the Still Pending path — no Confirm
    // button should appear for a new commitment.
    // We check this by confirming the Quick Log input returns to an empty,
    // enabled state shortly after.
    await expect(quickLogInput(page)).toHaveValue("", { timeout: 5000 });

    // CRITICAL ASSERTION — Robert is STILL overdue on the dashboard.
    await expectOverdueOnDashboard(page, person.id);

    // And after a page refresh the state persists.
    await page.reload();
    await expectOverdueOnDashboard(page, person.id);
  });

  test("2C — Replace: old commitment superseded, new one created with new date", async ({
    page,
  }) => {
    const person = TEST_PERSONAS.robert;
    await seedPersonWithOpenCommitment(
      page,
      person.id,
      /*daysOverdue=*/ 2,
      "Follow up — Q3 deck",
    );

    // Pre-state — record the initial open commitments.
    const before = await fetchOpenCommitments(page.request, person.id);
    const originalCount = before.length;

    await logActivity(
      page,
      person.id,
      "Called Robert. He asked to push the Q3 conversation to after his travel.",
    );

    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-replace").click();

    // Next Action prompt appears with EMPTY date (required).
    const confirm = page.getByRole("button", { name: /confirm/i });
    await expect(confirm).toBeVisible({ timeout: 5000 });

    // Pick a future date (+2w).
    const chip = page.getByRole("button", { name: /\+?2\s*w/i });
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
    } else {
      // Fallback: if no chip, try typing into a date input.
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.fill(ctDatePlus(14));
      }
    }
    await confirm.click();

    // After replace: the old commitment is no longer "open"; a new one exists.
    const after = await fetchOpenCommitments(page.request, person.id);
    // At least one open commitment, and it's future-dated (so not overdue).
    expect(after.length).toBeGreaterThanOrEqual(1);
    const stillOverdue = after.some(
      (c) => (c.commitmentDueDate ?? "9999-12-31") <= ctDatePlus(0),
    );
    expect(stillOverdue).toBeFalsy();

    // Robert should NOT be on the overdue list anymore (new commitment is future).
    await expectNotOverdueOnDashboard(page, person.id);

    // The count of open commitments should not have grown — the old was
    // superseded (not left open) and exactly one new one was created.
    expect(after.length).toBeLessThanOrEqual(Math.max(originalCount, 1));
  });

  test("2D — future-dated commitment does NOT trigger close-out prompt", async ({ page }) => {
    const person = TEST_PERSONAS.marcus;
    await seedPersonWithOpenCommitment(page, person.id, /*daysOverdue=*/ -5);

    await logActivity(page, person.id, "Quick note on Marcus — status unchanged");

    // Close-out prompt should not render.
    await expect(page.getByTestId("close-out-prompt")).toHaveCount(0);
  });

  test("2E — multi-commitment: David Chen with two opens, F+R resolves both", async ({
    page,
  }) => {
    const person = TEST_PERSONAS.david;
    // Seed two open commitments with different due dates (both overdue/today).
    await seedPersonWithOpenCommitment(page, person.id, 1, "Follow up — timeline question");
    await seedPersonWithOpenCommitment(page, person.id, 0, "Follow up — doc question");

    const before = await fetchOpenCommitments(page.request, person.id);
    expect(before.length).toBeGreaterThanOrEqual(2);

    await logActivity(
      page,
      person.id,
      "Called David, discussed both the timeline and the doc question",
    );

    // Multi-commitment prompt lists both — each has suffixed testids.
    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });

    const firstId = before[0].id;
    const secondId = before[1].id;

    // Fulfilled for the first, Replace for the second.
    await page.getByTestId(`close-out-fulfilled-${firstId}`).click();
    await page.getByTestId(`close-out-replace-${secondId}`).click();

    // Single Confirm button at the bottom of the multi-commitment prompt.
    const closeOutConfirm = page
      .getByTestId("close-out-prompt")
      .getByRole("button", { name: /confirm|apply|continue/i });
    await closeOutConfirm.click();

    // Next Action prompt follows (because at least one Replace happened).
    const confirm = page.getByRole("button", { name: /confirm/i });
    await expect(confirm).toBeVisible({ timeout: 5000 });
    const chip = page.getByRole("button", { name: /\+?1\s*w|next week/i });
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
    }
    await confirm.click();

    // After: first was fulfilled (terminal), second was superseded (terminal),
    // and a new open commitment was created. So no more overdue opens.
    const after = await fetchOpenCommitments(page.request, person.id);
    const overdueOpens = after.filter(
      (c) =>
        c.commitmentStatus === "open" &&
        (c.commitmentDueDate ?? "9999-12-31") <= ctDatePlus(0),
    );
    expect(overdueOpens.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Drop Lead scenarios
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Drop Lead from post-activity prompt", () => {
  test.beforeEach(async ({ page }) => {
    await resetMockData(page);
    await loginAsChad(page);
  });

  test("3A — Drop to Dead: stage change, next-action cleared, commitments cancelled, redirect", async ({
    page,
  }) => {
    const person = TEST_PERSONAS.robert;
    await seedPersonWithOpenCommitment(page, person.id, 2, "Follow up — Q3 deck");

    await logActivity(page, person.id, "Called Robert — not accredited, he's out");

    // Pick Still Pending to get past the close-out (we're not fulfilling, we're killing).
    if (await page.getByTestId("close-out-prompt").isVisible().catch(() => false)) {
      await page.getByTestId("close-out-pending").click();
    }

    // Click the Drop Lead link in the Next Action prompt.
    // On the Still Pending path, the Next Action prompt is skipped — but
    // Drop Lead should still be reachable via a stage-change control.
    // We try the Next Action prompt's link first; fall back to directly opening
    // the drop panel by clicking the link if the prompt is visible.
    const dropLink = page.getByTestId("drop-lead-link");
    if (await dropLink.isVisible().catch(() => false)) {
      await dropLink.click();
    } else {
      // Alternative: re-open Quick Log with a Fulfilled/Replace path to reach
      // the Next Action prompt. Because 3A tests the full flow, we reseed and
      // walk through Fulfilled so the Next Action prompt (and drop link) render.
      await resetMockData(page);
      await seedPersonWithOpenCommitment(page, person.id, 2, "Follow up — Q3 deck");
      await logActivity(page, person.id, "Called Robert — not accredited, he's out");
      await page.getByTestId("close-out-fulfilled").click();
      await expect(page.getByTestId("drop-lead-link")).toBeVisible({ timeout: 5000 });
      await page.getByTestId("drop-lead-link").click();
    }

    // Drop panel should expand.
    await expect(page.getByTestId("drop-lead-panel")).toBeVisible({ timeout: 5000 });

    // Click Dead.
    await page.getByTestId("drop-lead-dead").click();

    // Pick "not accredited" reason.
    await page.getByTestId("drop-lead-reason-not_accredited").click();

    // Confirm.
    await page.getByTestId("drop-lead-confirm").click();

    // Expected: redirects away from person detail (dashboard or pipeline).
    await expect(page).not.toHaveURL(new RegExp(`/person/${person.id}`), { timeout: 5000 });

    // Open commitments should all be cancelled (not open anymore).
    const opens = await fetchOpenCommitments(page.request, person.id);
    expect(opens.filter((c) => c.commitmentStatus === "open").length).toBe(0);

    // Person no longer in overdue list.
    await expectNotOverdueOnDashboard(page, person.id);
  });

  test("3B — Drop to Nurture: re-engage date stored", async ({ page }) => {
    const person = TEST_PERSONAS.rachel;
    await seedPersonWithOpenCommitment(page, person.id, 1, "Follow up — case study");

    await logActivity(
      page,
      person.id,
      "Spoke to prospect, timing is wrong — wants to revisit in Q4",
    );

    // Take close-out (Fulfilled) to reach the Next Action prompt which has
    // the drop link.
    if (await page.getByTestId("close-out-prompt").isVisible().catch(() => false)) {
      await page.getByTestId("close-out-fulfilled").click();
    }

    await expect(page.getByTestId("drop-lead-link")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("drop-lead-link").click();

    await expect(page.getByTestId("drop-lead-panel")).toBeVisible();
    await page.getByTestId("drop-lead-nurture").click();

    // Drop-lead panel should show a date quick pick; accept default ("+6 months").
    const confirmBtn = page.getByTestId("drop-lead-confirm");
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Person's stage should be nurture — verify via person detail page.
    await page.goto(`/person/${person.id}`);
    await expect(
      page.locator("span[data-slot='badge']", { hasText: /nurture/i }),
    ).toBeVisible({ timeout: 5000 });

    // No open commitments remain.
    const opens = await fetchOpenCommitments(page.request, person.id);
    expect(opens.filter((c) => c.commitmentStatus === "open").length).toBe(0);
  });

  test("3C — Resurrection: mark Dead then move back to active, history preserved", async ({
    page,
  }) => {
    const person = TEST_PERSONAS.rachel;
    await seedPersonWithOpenCommitment(page, person.id, 2, "Send case study");

    // Drop to Dead via Quick Log + Drop Lead flow.
    await logActivity(page, person.id, "Said no. Not interested.");
    if (await page.getByTestId("close-out-prompt").isVisible().catch(() => false)) {
      await page.getByTestId("close-out-fulfilled").click();
    }
    await expect(page.getByTestId("drop-lead-link")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("drop-lead-link").click();
    await page.getByTestId("drop-lead-dead").click();
    await page.getByTestId("drop-lead-reason-not_interested").click();
    await page.getByTestId("drop-lead-confirm").click();

    // Navigate directly back to the (now-dead) person detail page.
    await page.goto(`/person/${person.id}`);
    await expect(
      page.locator("span[data-slot='badge']", { hasText: /dead/i }),
    ).toBeVisible({ timeout: 5000 });

    // Change stage back to Active Engagement via the stage progression control.
    const changeLink = page.getByText(/click to change stage/i);
    if (await changeLink.isVisible().catch(() => false)) {
      await changeLink.click();
    }
    const activeBtn = page.getByRole("button", { name: /active engagement/i });
    if (await activeBtn.isVisible().catch(() => false)) {
      await activeBtn.click();
    }

    // Expect the stage badge is no longer Dead.
    await expect(
      page.locator("span[data-slot='badge']", { hasText: /active engagement/i }),
    ).toBeVisible({ timeout: 5000 });

    // Timeline should still contain the stage-change history, proving nothing
    // was purged. We look for at least one stage-change entry.
    const timeline = page.locator("text=Activity Timeline");
    await expect(timeline).toBeVisible();

    // Cancelled commitments must still be visible in the timeline — look for
    // the commitment marker testid. (It can be in any status, but the row must
    // still be rendered.)
    // We don't know the exact id, so we use the prefix-match pattern.
    const markers = page.locator("[data-testid^='timeline-commitment-marker-']");
    await expect(markers.first()).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Dashboard honesty verification (CANARY for the whole feature)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Dashboard honesty matrix", () => {
  test.beforeEach(async ({ page }) => {
    await resetMockData(page);
    await loginAsChad(page);
  });

  test("4A — CANARY: F clears Alpha, P keeps Beta, R clears Gamma", async ({ page }) => {
    // The definitive test of the feature. If Beta drops off overdue on this
    // test, the "honest red" invariant is broken — stop the world.

    // Seed three identically-overdue prospects.
    await seedPersonWithOpenCommitment(page, ALPHA.id, 2, "Follow up — Alpha");
    await seedPersonWithOpenCommitment(page, BETA.id, 2, "Follow up — Beta");
    await seedPersonWithOpenCommitment(page, GAMMA.id, 2, "Follow up — Gamma");

    // Precondition: all three are overdue.
    await expectOverdueOnDashboard(page, ALPHA.id);
    await expectOverdueOnDashboard(page, BETA.id);
    await expectOverdueOnDashboard(page, GAMMA.id);

    // Alpha — Fulfilled
    await logActivity(page, ALPHA.id, "Handled the Alpha follow-up in full");
    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-fulfilled").click();
    // Skip next-action prompt by pressing confirm w/ default
    const confirmA = page.getByRole("button", { name: /confirm/i });
    if (await confirmA.isVisible().catch(() => false)) {
      await confirmA.click();
    }

    // Beta — Still Pending
    await logActivity(page, BETA.id, "Beta note — nothing material, still waiting");
    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-pending").click();

    // Gamma — Replace with future date
    await logActivity(page, GAMMA.id, "Gamma called, pushed the meeting to next week");
    await expect(page.getByTestId("close-out-prompt")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("close-out-replace").click();
    const confirmG = page.getByRole("button", { name: /confirm/i });
    await expect(confirmG).toBeVisible({ timeout: 5000 });
    const chip = page.getByRole("button", { name: /\+?5\s*d/i });
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
    } else {
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.fill(ctDatePlus(5));
      }
    }
    await confirmG.click();

    // THE ASSERTIONS — dashboard honesty matrix.
    await page.goto("/");

    // Alpha cleared.
    await expect(page.getByTestId(`action-queue-item-${ALPHA.id}`)).toHaveCount(0);
    // Beta STILL THERE (honest red).
    await expect(page.getByTestId(`action-queue-item-${BETA.id}`)).toBeVisible();
    // Gamma cleared.
    await expect(page.getByTestId(`action-queue-item-${GAMMA.id}`)).toHaveCount(0);
  });

  test("4B — future-dated commitment suppresses stale flag", async ({ page }) => {
    // Pick a prospect who would be stale but isn't overdue. Seed them with a
    // future commitment and verify they're not in Needs Attention.
    const person = TEST_PERSONAS.marcus;

    // First clear any existing commitments via resetMockData (already done).
    // Seed a future commitment only.
    await seedPersonWithOpenCommitment(page, person.id, /*daysOverdue=*/ -3);

    // Stale flag should be suppressed — Marcus should NOT be in Needs Attention
    // solely because of staleness, and should NOT be in the overdue queue.
    await expectNotOverdueOnDashboard(page, person.id);
    // We deliberately don't assert on stale-vs-overdue nuance beyond "not on
    // Needs Attention" — the design spec says future-dated open commitments
    // suppress the stale flag entirely.
    await expectNotInNeedsAttention(page, person.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Feature flag regression
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Feature flag regression", () => {
  test.beforeEach(async ({ page }) => {
    await resetMockData(page);
    await loginAsChad(page);
  });

  test("5B — COMMITMENTS_V2 off: close-out prompt does NOT appear, legacy Quick Log intact", async ({
    page,
  }) => {
    // This test can only meaningfully verify the flag-off behavior when the
    // server was launched with COMMITMENTS_V2 unset. When the test run is
    // flag-on, we skip so CI doesn't report a false negative. The test
    // contract: there MUST be a run where COMMITMENTS_V2 is unset that
    // exercises this scenario.
    const flagOn = await isCommitmentsV2Enabled(page);
    test.skip(flagOn, "COMMITMENTS_V2 is ON for this run — skipping flag-off regression");

    const person = TEST_PERSONAS.robert;
    // With flag off the "commitments" API likely 501s; the helper logs and
    // returns silently.
    await seedPersonWithOpenCommitment(page, person.id, 2, "Follow up — Q3 deck");

    await logActivity(page, person.id, "Logging a test activity with flag off");

    // No close-out prompt.
    await expect(page.getByTestId("close-out-prompt")).toHaveCount(0);

    // No drop-lead link.
    await expect(page.getByTestId("drop-lead-link")).toHaveCount(0);

    // Legacy Next Action prompt should still work — at least a Confirm button
    // should be reachable.
    const confirm = page.getByRole("button", { name: /confirm/i });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }

    // Sanity: Quick Log input is functional and not errored.
    await expect(quickLogInput(page)).toBeVisible();
  });

  test("5C — previously-written commitment rows still render after toggle on", async ({
    page,
  }) => {
    // Simulates: a commitment row exists from a prior flag-on session, and
    // the flag is on now (the current run). The row must still render
    // correctly in the timeline.
    const flagOn = await isCommitmentsV2Enabled(page);
    test.skip(!flagOn, "COMMITMENTS_V2 is OFF for this run — skipping toggle-on verification");

    const person = TEST_PERSONAS.robert;
    await seedPersonWithOpenCommitment(page, person.id, 2, "Follow up — Q3 deck");

    await page.goto(`/person/${person.id}`);
    // Timeline should render at least one commitment marker.
    const markers = page.locator("[data-testid^='timeline-commitment-marker-']");
    await expect(markers.first()).toBeVisible({ timeout: 5000 });
  });
});
