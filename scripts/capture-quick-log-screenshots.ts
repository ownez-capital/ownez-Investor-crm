/**
 * Captures a set of screenshots illustrating the Quick Log flow, for use in
 * docs/user-quick-log-guide.md. Run against a live dev server:
 *
 *   DATA_PROVIDER=mock COMMITMENTS_V2=on npm run dev   # in one terminal
 *   npx tsx scripts/capture-quick-log-screenshots.ts   # in another
 *
 * Writes PNGs to docs/screenshots/quick-log-guide/. Safe to re-run.
 */
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = join("docs", "screenshots", "quick-log-guide");

async function loginAsChad(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[id="username"]', "chad");
  await page.fill('input[id="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`);
}

async function shot(page: Page, filename: string, locator?: string) {
  const path = join(OUT_DIR, filename);
  if (locator) {
    const el = page.locator(locator).first();
    await el.waitFor({ state: "visible", timeout: 10000 });
    await el.screenshot({ path });
  } else {
    await page.screenshot({ path, fullPage: false });
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${filename}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2, // crisp screenshots
  });
  const page = await context.newPage();

  console.log(`📸 Capturing Quick Log screenshots → ${OUT_DIR}\n`);

  // Reset mock data so the screenshots are reproducible.
  await page.request.post(`${BASE_URL}/api/test-reset`);

  await loginAsChad(page);

  // ── 1. Dashboard with overdue action items ────────────────────────────────
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle");
  await shot(page, "01-dashboard.png");

  // ── 2. Quick Log input on a person's page, before typing ──────────────────
  // Use Robert Calloway who has an overdue backfilled commitment.
  await page.goto(`${BASE_URL}/person/p-robert`);
  await page.waitForLoadState("networkidle");
  // Shoot just the Quick Log area for clarity.
  const quickLogArea = page.locator(
    'div.rounded-lg:has(input[placeholder*="discussed"])'
  );
  await shot(page, "02-quick-log-ready.png");

  // ── 3. Close-out prompt (after typing + Enter) ────────────────────────────
  const input = page.locator('input[placeholder*="discussed"]');
  await input.fill(
    "Emailed Robert the Q3 deck with annotations on the growth assumptions."
  );
  await input.press("Enter");
  await page.waitForSelector('[data-testid="close-out-prompt"]', {
    timeout: 10000,
  });
  // Brief settle so status chips finish rendering.
  await page.waitForTimeout(300);
  await shot(
    page,
    "03-close-out-prompt.png",
    '[data-testid="close-out-prompt"]'
  );

  // ── 4. Next Action prompt (after clicking [D] Done) — drop-lead-link visible
  await page.getByTestId("close-out-fulfilled").click();
  await page.waitForSelector('[data-testid="drop-lead-link"]', {
    timeout: 10000,
  });
  await page.waitForTimeout(300);
  const nextActionPrompt = page.locator(
    'div.rounded-lg:has([data-testid="drop-lead-link"])'
  );
  await shot(page, "04-next-action-prompt.png");

  // ── 5. Drop Lead panel (expanded, showing Dead pills) ─────────────────────
  await page.getByTestId("drop-lead-link").click();
  await page.getByTestId("drop-lead-dead").click();
  await page.waitForSelector(
    '[data-testid="drop-lead-reason-not_accredited"]',
    { timeout: 5000 }
  );
  await page.waitForTimeout(300);
  await shot(
    page,
    "05-drop-lead-panel.png",
    '[data-testid="drop-lead-panel"]'
  );

  // ── 6. Timeline with commitment marker + fulfillment link ────────────────
  // Reset and do a clean Fulfilled flow that lands us on a person with a
  // visible ◉ marker and ✓ Done link in the timeline.
  await page.request.post(`${BASE_URL}/api/test-reset`);
  await page.goto(`${BASE_URL}/person/p-robert`);
  await page.waitForLoadState("networkidle");
  const input2 = page.locator('input[placeholder*="discussed"]');
  await input2.fill("Emailed Robert the Q3 deck with annotations.");
  await input2.press("Enter");
  await page.waitForSelector('[data-testid="close-out-prompt"]');
  await page.getByTestId("close-out-fulfilled").click();
  await page.waitForSelector('[data-testid="drop-lead-link"]');
  // Dismiss the Next Action prompt with no new date (just closes the prompt,
  // keeping the fulfilled commitment in the timeline).
  await page.getByRole("button", { name: /^Confirm$/ }).click();
  // Wait for the success banner to fire and the reload/refresh to settle.
  await page.waitForTimeout(2500);
  // Navigate back to the page to ensure the refreshed timeline is loaded.
  await page.goto(`${BASE_URL}/person/p-robert`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector(
    '[data-testid^="timeline-commitment-marker-"]',
    { timeout: 10000 }
  );
  // Scroll the timeline section into view.
  const timelineHeader = page.getByText("Activity Timeline");
  await timelineHeader.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // Capture a region that includes the header + the first few entries.
  const timelineSection = page.locator("div:has(> h3:text('Activity Timeline'))").first();
  await shot(page, "06-timeline.png", "div:has(> h3:text('Activity Timeline'))");

  await browser.close();
  console.log(`\n✅ All screenshots written to ${OUT_DIR}`);
  // Unused variable silence
  void quickLogArea;
  void nextActionPrompt;
  void timelineSection;
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
