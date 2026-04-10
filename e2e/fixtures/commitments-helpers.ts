/**
 * E2E test helpers for the Commitments Lifecycle + Drop Lead feature.
 *
 * These helpers are intentionally decoupled from specific mock seed data:
 * they set up the state the test needs by calling the UI or API, not by
 * mutating in-memory arrays. That way the same tests can (in theory) be
 * re-run against Neon once the provider implementations land.
 *
 * Note: several of the APIs referenced here do not exist yet at the time
 * this file was written — they are the *contract* the integration phase
 * must match. Tests using these helpers may fail until the API routes and
 * UI components ship. See docs/HANDOFF-commitments-lifecycle.md §5.
 */
import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

// ─── Canonical test personas (exist in mock seed) ─────────────────────────────
//
// We reuse existing mock personas instead of seeding brand-new ones so the
// tests don't depend on a test-only seeding API that nobody else needs.
// The canary scenarios only care about "three prospects in the same state",
// which we achieve by explicitly setting commitments via the API before each
// assertion.
export const TEST_PERSONAS = {
  robert: { id: "p-robert", name: "Robert Calloway" },
  sandra: { id: "p-sandra", name: "Sandra Kim" },
  david: { id: "p-david", name: "David Thornton" },
  marcus: { id: "p-marcus", name: "Marcus Johnson" },
  patricia: { id: "p-patricia", name: "Patricia Wells" },
  rachel: { id: "p-rachel", name: "Rachel Adams" },
  grant: { id: "p-grant", name: "William Grant" },
  torres: { id: "p-torres", name: "Angela Torres" },
  huang: { id: "p-huang", name: "Richard Huang" },
} as const;

// For 4A we need three identical overdue prospects; reuse the trio below.
// They're referred to as Alpha/Beta/Gamma in the manual test plan.
export const ALPHA = TEST_PERSONAS.robert;
export const BETA = TEST_PERSONAS.patricia;
export const GAMMA = TEST_PERSONAS.rachel;

// ─── Login / reset ────────────────────────────────────────────────────────────

export async function loginAsChad(page: Page) {
  await page.goto("/login");
  await page.fill('input[id="username"]', "chad");
  await page.fill('input[id="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 10000 });
}

/**
 * Reset mock provider to initial state. Must be called before every test that
 * depends on exact counts or on commitment state created by prior tests.
 */
export async function resetMockData(page: Page) {
  await page.request.post("/api/test-reset");
}

// ─── Date helpers (CT timezone, ISO yyyy-mm-dd) ───────────────────────────────

/** Returns today in CT as yyyy-mm-dd */
export function todayCT(): string {
  const now = new Date();
  const ct = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const y = ct.getFullYear();
  const m = String(ct.getMonth() + 1).padStart(2, "0");
  const d = String(ct.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns today + offsetDays as yyyy-mm-dd (negative for past dates) */
export function ctDatePlus(offsetDays: number): string {
  const now = new Date();
  const ct = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  ct.setDate(ct.getDate() + offsetDays);
  const y = ct.getFullYear();
  const m = String(ct.getMonth() + 1).padStart(2, "0");
  const d = String(ct.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── API-level helpers ────────────────────────────────────────────────────────
//
// These call the feature-new API routes directly. They're used for arranging
// state (seeding a commitment) rather than clicking through the UI, which
// keeps each assertion-level test focused on one concern.

/**
 * Creates an open Commitment Set row for a person with a due date N days in
 * the past (positive daysOverdue) or future (negative daysOverdue).
 *
 * Contract: calls POST /api/persons/[id]/commitments with a shape the main
 * thread will implement. The body shape is based on DataService.createCommitment.
 */
export async function seedPersonWithOpenCommitment(
  page: Page,
  personId: string,
  daysOverdue: number,
  detail: string = "Follow up — Q3 deck",
  commitmentType: string = "follow_up",
): Promise<void> {
  const dueDate = ctDatePlus(-daysOverdue);
  const response = await page.request.post(
    `/api/persons/${personId}/commitments`,
    {
      data: {
        commitmentType,
        commitmentDetail: detail,
        commitmentDueDate: dueDate,
      },
    },
  );
  // Don't fail the helper if the API isn't implemented yet — the caller's
  // test will fail on its own assertions, which is the intended behavior.
  if (!response.ok()) {
    // eslint-disable-next-line no-console
    console.warn(
      `seedPersonWithOpenCommitment: POST /api/persons/${personId}/commitments returned ${response.status()} — API route likely not implemented yet.`,
    );
  }
}

/**
 * Returns the full list of open commitments for a person via the (expected)
 * API. Useful for asserting state after a flow.
 */
export async function fetchOpenCommitments(
  request: APIRequestContext,
  personId: string,
): Promise<Array<{ id: string; commitmentDueDate: string | null; commitmentStatus: string | null }>> {
  const response = await request.get(`/api/persons/${personId}/commitments`);
  if (!response.ok()) return [];
  const data = (await response.json()) as Array<{
    id: string;
    commitmentDueDate: string | null;
    commitmentStatus: string | null;
  }>;
  return data;
}

// ─── UI-level helpers ─────────────────────────────────────────────────────────

/** Locate the Quick Log input on a Person Detail page. */
export function quickLogInput(page: Page) {
  return page.locator('input[placeholder*="discussed"]');
}

/**
 * Type an activity into Quick Log and press Enter. Does NOT advance past any
 * subsequent prompts (close-out or Next Action) — callers handle those.
 */
export async function logActivity(page: Page, personId: string, text: string) {
  await page.goto(`/person/${personId}`);
  const input = quickLogInput(page);
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
}

/**
 * Full happy-path Quick Log flow: type activity, skip close-out if present
 * using the specified action, then confirm the subsequent Next Action prompt
 * with a "+3d" date. Used for fast-path scenarios.
 */
export async function logActivityAndAccept(
  page: Page,
  personId: string,
  text: string,
): Promise<void> {
  await logActivity(page, personId, text);

  // Wait for either the close-out prompt or the Next Action prompt.
  const closeOut = page.getByTestId("close-out-prompt");
  const confirmBtn = page.getByRole("button", { name: /confirm/i });
  await expect.poll(async () => {
    return (await closeOut.isVisible()) || (await confirmBtn.isVisible());
  }, { timeout: 5000 }).toBeTruthy();

  if (await closeOut.isVisible()) {
    // Just default to "Still pending" to move on without touching prior state.
    await page.getByTestId("close-out-pending").click();
  }

  // If a Next Action prompt follows, confirm it.
  if (await confirmBtn.isVisible()) {
    const tomorrow = page.getByRole("button", { name: "Tomorrow" });
    if (await tomorrow.isVisible()) {
      await tomorrow.click();
    }
    await confirmBtn.click();
  }
}

// ─── Dashboard assertions ─────────────────────────────────────────────────────

/**
 * Asserts that the given person currently appears in the dashboard Action
 * Queue as overdue. Uses the `action-queue-item-<personId>` testid contract.
 */
export async function expectOverdueOnDashboard(page: Page, personId: string) {
  await page.goto("/");
  await expect(page.getByTestId(`action-queue-item-${personId}`)).toBeVisible();
}

/**
 * Asserts that the given person is NOT in the dashboard Action Queue.
 */
export async function expectNotOverdueOnDashboard(page: Page, personId: string) {
  await page.goto("/");
  await expect(page.getByTestId(`action-queue-item-${personId}`)).toHaveCount(0);
}

/**
 * Asserts that the given person appears in the Needs Attention panel.
 */
export async function expectInNeedsAttention(page: Page, personId: string) {
  await page.goto("/");
  await expect(page.getByTestId(`needs-attention-${personId}`)).toBeVisible();
}

/**
 * Asserts that the given person does NOT appear in the Needs Attention panel.
 */
export async function expectNotInNeedsAttention(page: Page, personId: string) {
  await page.goto("/");
  await expect(page.getByTestId(`needs-attention-${personId}`)).toHaveCount(0);
}

// ─── Feature flag probe ───────────────────────────────────────────────────────

/**
 * Returns true if the server currently reports COMMITMENTS_V2 as ON.
 *
 * Used by tests that must conditionally skip when the flag isn't in the
 * expected state. We query a lightweight endpoint (expected to be added) —
 * if the endpoint doesn't exist yet, we fall back to "on" (the default for
 * the feature-era test run) so tests still execute and fail loudly.
 */
export async function isCommitmentsV2Enabled(page: Page): Promise<boolean> {
  try {
    const r = await page.request.get("/api/feature-flags");
    if (!r.ok()) return true;
    const body = (await r.json()) as { commitmentsV2?: boolean };
    return body.commitmentsV2 === true;
  } catch {
    return true;
  }
}
