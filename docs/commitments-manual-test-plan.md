# Manual Test Plan — Commitments Lifecycle + Drop Lead

**Feature:** DESIGN-SPEC §5.9 (Commitments & Close-out Lifecycle) and §5.10 (Drop Lead from Post-Activity Prompt)
**Purpose:** Walkthrough manual verification of the new Quick Log flow on mock data BEFORE any code touches production
**Target environment:** Local dev with `DATA_PROVIDER=mock` and `COMMITMENTS_V2=on`, OR Vercel preview deployment with the same env vars

---

## 0. Setup

### 0.1 Prerequisites

- Node.js, npm install complete
- `.env.local` has:
  ```
  DATA_PROVIDER=mock
  COMMITMENTS_V2=on
  ```
- Start the dev server: `npm run dev`
- Log in as Chad (or any rep role)

### 0.2 Seed data required

The mock provider's default seed already includes 12 prospects across stages. For this test plan we need these specific shapes present. If the mock seed doesn't have them, run `npx tsx --env-file=.env.local scripts/seed-demo-data.ts` first.

| Persona | Role | Starting state |
|---|---|---|
| **Robert Calloway** | Prospect in Active Engagement | Has an open Next Action "Follow up — Q3 deck" due 2 days ago |
| **Marcus Johnson** | Prospect in Pitch | Has an open Next Action due 5 days from now (future) |
| **Sandra Kim** | Prospect in Initial Contact | Never had a Next Action set yet (only "Prospect Added") |
| **David Thornton** | Prospect in Soft Commit | Two open Next Actions (multi-commitment edge case) — one overdue by 1 day, one due today |
| **Any lead** | N/A | At least one lead available that can be marked Dead and then resurrected |

If any of these fixtures don't exist in the mock seed, **create them as part of the test plan preflight** by logging activities / setting next actions using the UI before running the main scenarios.

### 0.3 What to watch on every scenario

Each scenario lists preconditions, steps, and expected results. Additionally, on every scenario verify:

1. **No console errors** (open DevTools Console before clicking)
2. **No network errors** (open DevTools Network, filter to failed requests)
3. **The page doesn't flash white** during transitions
4. **Timeline updates visibly** after each action without a manual refresh

---

## 1. Fast Path Scenarios (no change expected vs. today)

These scenarios confirm that **Chad's normal flow is unchanged** for the majority of activities — if any of these behave differently from today, that's a regression.

### Scenario 1A — First activity on a fresh prospect

**Preconditions:** Sandra Kim has never had a Next Action set

**Steps:**
1. Open Sandra Kim's person detail page
2. Focus Quick Log input
3. Type: "Sent intro email, introducing the firm"
4. Press Enter

**Expected:**
- Standard Next Action prompt appears (NOT the close-out prompt)
- Detail field is empty with placeholder (not pre-filled)
- Type defaults to "Follow Up"
- Date quick-pick chips visible
- Pick `+3d`, confirm with Enter
- Success banner appears
- Timeline shows new Email entry at top
- Timeline shows a new `◉ Commitment set · Follow Up · due <date>` marker
- Person's Next Action Bar shows the new commitment
- Person is NOT on the overdue list on the dashboard

**Pass/Fail:** ☐

### Scenario 1B — Logging an activity while an open commitment is still future-dated

**Preconditions:** Marcus Johnson has an open commitment due 5 days from now

**Steps:**
1. Open Marcus Johnson's person detail page
2. Quick Log: "Left voicemail, no response yet"
3. Press Enter

**Expected:**
- Standard Next Action prompt appears (NOT the close-out prompt — because the existing commitment is future-dated)
- Old Next Action values show as placeholder text
- Press Enter through without changing anything
- Success banner appears
- Timeline shows new Note entry (Attempted outcome auto-detected)
- No new `Commitment Set` marker is added (because nothing changed)
- Next Action Bar still shows the same future-dated commitment unchanged

**Pass/Fail:** ☐

### Scenario 1C — Overriding activity type via More Options

**Preconditions:** Any prospect with no open commitment

**Steps:**
1. Open Quick Log
2. Type: "Signed docs today"
3. Click "More options"
4. Override Activity Type to "Document Received"
5. Press Enter
6. Complete Next Action prompt

**Expected:** Same as before — this is a regression check that More Options still works.

**Pass/Fail:** ☐

---

## 2. Close-out Prompt Scenarios (the critical new behavior)

These scenarios verify that the close-out prompt fires correctly and each of the three paths (Fulfilled, Still Pending, Replace) works as designed.

### Scenario 2A — Fulfilled path (happy case)

**Preconditions:** Robert Calloway has an open Next Action "Follow up — Q3 deck" due 2 days ago

**Steps:**
1. Open Robert Calloway's person detail page
2. Verify the Next Action Bar shows the overdue "Follow up — Q3 deck" with a red urgency indicator
3. Verify the dashboard shows Robert in the Action Queue as "Overdue 2d"
4. In Quick Log, type: "Emailed the Q3 deck with annotations on the growth assumptions"
5. Press Enter

**Expected — Close-out prompt appears:**
> ⚠ Outstanding: Follow up — Q3 deck — due <date> (2d overdue)
> [F] Fulfilled — this activity handled it
> [P] Still pending — logging something unrelated, commitment stays open
> [R] Replace — drop this, set a new one

6. Press `F` or click "Fulfilled"

**Expected — Next Action prompt appears:**
- Detail placeholder shows old value
- Date field is NOT empty (only Replace clears it)

7. Type "Schedule meeting to discuss numbers", pick `+1w`, Enter

**Expected after confirm:**
- Success banner appears
- Timeline shows:
  - New `📧 Email` entry at top with **`✓ Fulfilled: Follow up — Q3 deck (2d late)`** link underneath
  - The OLD `◉ Commitment set` marker for Q3 deck now shows `✓ fulfilled (2d late)` badge
  - A NEW `◉ Commitment set` marker for the new meeting commitment
- Dashboard Action Queue no longer shows Robert overdue (clears honestly — the commitment was really fulfilled)
- Next Action Bar shows the new meeting commitment

**Pass/Fail:** ☐

### Scenario 2B — Still Pending path (honest red)

**Preconditions:** Re-seed Robert Calloway with the same overdue "Follow up — Q3 deck" commitment (or find another prospect in the same state)

**Steps:**
1. Open Robert Calloway's person detail page
2. Verify overdue state on dashboard (Action Queue shows Robert overdue)
3. Quick Log: "CPA John Lee called. Robert is traveling this week. Will be back Monday."
4. Press Enter
5. Close-out prompt appears
6. Press `P` or click "Still pending"

**Expected:**
- The Next Action prompt is **SKIPPED** — no new prompt appears
- Success banner appears directly
- Timeline shows the new Note entry
- The OLD `◉ Commitment set` marker for Q3 deck is still shown as **open** (not fulfilled)
- Next Action Bar still shows the same overdue commitment with red urgency
- **Critical check:** Robert is **still on the overdue list** on the dashboard. Days Idle reset to 0, but overdue flag is still red. The dashboard is telling the truth.
- Refresh the page — state persists

**This is the most important scenario in the whole plan. If Robert drops off the overdue list, the feature is broken.**

**Pass/Fail:** ☐

### Scenario 2C — Replace path (plan changed)

**Preconditions:** Re-seed Robert Calloway with the same overdue commitment

**Steps:**
1. Quick Log: "Called Robert. He asked to push the Q3 conversation to after his travel."
2. Press Enter
3. Close-out prompt appears
4. Press `R` or click "Replace"

**Expected:**
- Next Action prompt appears with Date field **EMPTY** and required
- Type and Detail show old values as placeholder
5. Pick `+2w`, confirm

**Expected after confirm:**
- Success banner
- Timeline shows new Call entry
- OLD commitment marker now shows `↺ superseded`
- NEW commitment marker created for the Mar 14-ish date
- Dashboard: Robert drops off the overdue list (because the open commitment is now future-dated)

**Pass/Fail:** ☐

### Scenario 2D — Close-out prompt does NOT fire for future-dated commitment

**Preconditions:** Marcus Johnson has a future-dated open commitment (already tested in 1B, but this confirms the boundary)

**Steps:** Same as 1B above

**Expected:** No close-out prompt. This confirms the condition `dueDate <= today` is correctly applied.

**Pass/Fail:** ☐

### Scenario 2E — Multiple open commitments (degenerate edge case)

**Preconditions:** David Thornton has two open commitments — one overdue by 1 day, one due today

**Steps:**
1. Open David Thornton's person detail page
2. Quick Log: "Called David, discussed both the timeline and the doc question"
3. Press Enter

**Expected close-out prompt:**
- Prompt lists BOTH open commitments, each with its own F/P/R selector
- Default is P (Still pending) for all

4. Pick `F` for the first commitment, `R` for the second
5. Confirm

**Expected:**
- First commitment → `fulfilled`, activity linked
- Second commitment → `superseded`
- Next Action prompt appears with empty date (because there was at least one Replace)
6. Set new commitment, confirm
7. Timeline shows:
   - New Call entry with `✓ Fulfilled: <commitment 1>` link
   - First commitment marker: `✓ fulfilled`
   - Second commitment marker: `↺ superseded`
   - New commitment marker: open

**Pass/Fail:** ☐

---

## 3. Drop Lead Scenarios

### Scenario 3A — Drop to Dead from Quick Log with an open commitment

**Preconditions:** Any prospect with an open overdue commitment (use Robert again, re-seeded)

**Steps:**
1. Open Robert Calloway's page
2. Quick Log: "Called Robert — not accredited, he's out"
3. Press Enter
4. Close-out prompt appears
5. Press `P` (we're not fulfilling the commitment, we're killing the lead)

**Alternative — directly from Next Action prompt:**
- OR press `F`/`R` first, arrive at the Next Action prompt, then click **Drop lead ▸**

6. Click **Drop lead ▸** link in the Next Action prompt
7. Click **Dead** pill
8. Pick "Not Accredited" from the reason chips
9. Type optional note: "Said his assets are in illiquid real estate"
10. Press Enter

**Expected:**
- Stage auto-logs a Stage Change activity (Active Engagement → Dead)
- Person's `nextActionType`, `nextActionDetail`, `nextActionDate` are all cleared
- Any open commitments are marked `cancelled` (with Closed Date stamped)
- Post-stage-change prompt is **suppressed** (no "set a next action" prompt because the lead is dead)
- Success banner: "Marked Dead — history preserved. Resurrect anytime from the stage bar."
- Page redirects to dashboard or pipeline view (NOT person detail — the lead is gone from active views)
- Dashboard: Robert no longer appears in any active lists
- People Directory: Robert appears when filter is changed to "Dead"

**Pass/Fail:** ☐

### Scenario 3B — Drop to Nurture from Quick Log

**Preconditions:** Any active prospect with or without open commitments

**Steps:**
1. Open prospect's page
2. Quick Log: "Spoke to prospect, timing is wrong — wants to revisit in Q4"
3. Press Enter through any close-out
4. Next Action prompt → **Drop lead ▸**
5. Click **Nurture** pill
6. Pick a Re-engage Date (e.g., +6 months)
7. Confirm

**Expected:**
- Stage → Nurture
- Next Action cleared, open commitments cancelled
- Re-engage Date stored
- Success banner
- Prospect drops off active pipeline
- On the specified Re-engage Date, prospect appears in "Today's Actions" as a nurture re-engage item (can be verified by changing system date or by seeding a near-term re-engage date)

**Pass/Fail:** ☐

### Scenario 3C — Resurrection preserves history

**Preconditions:** A prospect dropped to Dead in Scenario 3A

**Steps:**
1. Open People Directory
2. Filter by "Dead"
3. Find the dropped prospect, click into their detail page
4. Use the stage bar to change stage back to e.g. "Active Engagement"
5. Post-stage-change prompt fires (expected — this is a new stage change)
6. Set a new Next Action
7. Verify timeline

**Expected:**
- All prior activities intact (calls, emails, notes, stage changes)
- Cancelled commitments still show in the timeline with the `✕ cancelled` badge — they do NOT revert to open
- New Commitment Set marker created from the post-stage-change prompt
- Person is back in the active pipeline

**Pass/Fail:** ☐

---

## 4. Dashboard Honesty Verification

This section specifically tests that the dashboard's overdue flag is now truthful — the critical business outcome of this feature.

### Scenario 4A — Overdue flag clears only on real fulfillment

**Preconditions:** Three test prospects seeded identically, each with a 2-day-overdue open commitment (call them Alpha, Beta, Gamma)

**Steps:**

1. On Alpha: Quick Log a note → Close-out prompt → pick **Fulfilled**
2. On Beta: Quick Log a note → Close-out prompt → pick **Still pending**
3. On Gamma: Quick Log a note → Close-out prompt → pick **Replace** → set new date `+5d`

**Expected on dashboard after all three:**
- Alpha: NOT on overdue list (commitment fulfilled)
- Beta: **STILL on overdue list** (commitment still open, even though note was logged)
- Gamma: NOT on overdue list (commitment now superseded, new one is future-dated)

This is the definitive test. If Beta drops off the overdue list, the feature is fundamentally broken.

**Pass/Fail:** ☐

### Scenario 4B — Stale flag interaction

**Preconditions:** A prospect in a stage with a short idle threshold (e.g., Initial Contact — 5 day threshold) with no open commitments at all, and Days Idle currently at 6 (stale)

**Steps:**
1. Verify prospect shows as Stale on dashboard
2. Log any activity
3. Next Action prompt — set a future-dated commitment (e.g., `+3d`)
4. Confirm

**Expected:**
- Days Since Last Touch resets to 0
- Stale flag clears (because future-dated open commitment now suppresses it, per §5.1)
- Prospect drops off the Needs Attention list

**Pass/Fail:** ☐

### Scenario 4C — Stale but not overdue

**Preconditions:** A prospect in a stage with a 5-day idle threshold. Days Idle is 7. Has a future-dated open commitment.

**Expected:**
- Stale flag: NO (suppressed by future-dated commitment)
- Overdue flag: NO
- Prospect NOT on Needs Attention

**Steps to manually verify:** Just load the dashboard and confirm the prospect is not surfaced.

**Pass/Fail:** ☐

### Scenario 4D — Touched today but still overdue

**Preconditions:** Scenario 2B result — Robert Calloway after the Still Pending path

**Steps:**
1. Return to dashboard
2. Check if Robert is in the Action Queue

**Expected:**
- Robert IS in the Action Queue with "Overdue Nd"
- Days Since Last Touch badge shows 0 or "today" — but the urgency tag still shows Overdue
- This is the intended "honest red" state

**Pass/Fail:** ☐

---

## 5. Backwards Compatibility / Migration

### Scenario 5A — Legacy person with Next Action but no Commitment Set row

**Preconditions:** A prospect that existed before this feature. They have `nextActionDate` set but no `Commitment Set` row in the Activity Log yet (simulate by editing mock seed data or by turning off the feature flag, creating a prospect with a Next Action, then turning the flag back on)

**Steps:**
1. Open the prospect
2. Verify behavior

**Expected — one of two acceptable paths (the implementation can choose either):**
- (a) Automatic lazy upgrade: the first time the person is loaded with the flag on, the backfill logic creates a synthetic Commitment Set row from the Person-level Next Action fields. From then on, the person behaves like any other.
- (b) The one-shot backfill script (`scripts/backfill-commitments.ts`) has been run and the row already exists.

Verify that the dashboard overdue flag works correctly for this prospect regardless of which path was used.

**Pass/Fail:** ☐

### Scenario 5B — Feature flag off, regression to old behavior

**Preconditions:** Set `COMMITMENTS_V2=off` in `.env.local`, restart dev server

**Steps:**
1. Log activities on any prospect
2. Observe the Quick Log flow

**Expected:**
- No close-out prompt appears (flag gated)
- No "Drop lead ▸" link visible
- Behavior is identical to pre-feature Quick Log
- Existing Commitment Set rows in the timeline are rendered as plain activities OR hidden entirely (implementation choice — whichever avoids confusion)
- No errors, no broken rendering

**Pass/Fail:** ☐

### Scenario 5C — Flag on after flag off, state preserved

**Preconditions:** After 5B, set `COMMITMENTS_V2=on` again

**Steps:**
1. Restart dev server
2. Open a prospect used in the earlier tests
3. Verify timeline and state

**Expected:**
- All previously-written Commitment Set rows still present and rendered correctly
- Statuses (fulfilled, superseded, cancelled) preserved
- No data loss, no duplicate rows

**Pass/Fail:** ☐

---

## 6. Keyboard Flow Verification

### Scenario 6A — Full keyboard loop for happy path

**Preconditions:** A prospect in the Dashboard Quick Log area (or desktop Person Detail)

**Steps — zero mouse:**
1. Focus Quick Log (`L` shortcut or Tab to it)
2. Type "Called and reviewed Q3 numbers"
3. Press Enter
4. (If close-out fires) press `F`
5. Press Enter (accepts default Type/Detail)
6. Date quick-pick navigation via arrow keys, Enter to confirm

**Expected:** Full flow completes without touching the mouse. Total keystrokes from Quick Log focus to success banner should be approximately: L + text + Enter + (F or skipped) + Enter + Enter = ~4-5 control keystrokes plus the text.

**Pass/Fail:** ☐

### Scenario 6B — Keyboard drop-lead shortcut

**Steps:**
1. Focus Quick Log
2. Type "Not interested"
3. Enter → any close-out → arrive at Next Action prompt
4. Press `D` (drop lead shortcut per §5.10)
5. Navigate Dead/Nurture pills via arrow keys
6. Pick Dead → Enter
7. Arrow-key through Lost Reason chips, Enter to pick
8. Enter to confirm

**Expected:** Total keystrokes to kill a lead from "finished typing the activity" is under 5 control keystrokes (not counting the activity text itself).

**Pass/Fail:** ☐

---

## 7. Regression Sanity Checks

Quick sweeps to verify nothing else broke.

| # | Check | Pass/Fail |
|---|---|---|
| 7.1 | Dashboard loads without errors | ☐ |
| 7.2 | Pipeline view renders all prospects correctly | ☐ |
| 7.3 | Person Detail page renders timeline with mixed old and new activity types | ☐ |
| 7.4 | Admin Panel → Activity Types tab shows Commitment Set as a system (locked) type | ☐ |
| 7.5 | Create Prospect flow works and writes an initial Commitment Set if Next Action is provided | ☐ |
| 7.6 | Inline Pipeline Quick Log also shows the close-out prompt when appropriate | ☐ |
| 7.7 | Reports export (Activity Log Export) includes Commitment Set rows with their fields | ☐ |
| 7.8 | Leadership Dashboard Red Flags panel honors the new overdue calculation | ☐ |

---

## 8. Sign-off

Run through this plan end-to-end on the preview deployment before merging the feature to master.

- [ ] All scenarios pass or have documented reasons for not passing
- [ ] Any failed scenarios have an open issue filed with reproduction steps
- [ ] Scenario 2B (honest red) has been verified — this is the critical business outcome
- [ ] Scenario 4A (dashboard honesty matrix) has been verified
- [ ] Keyboard flows (6A, 6B) have been timed and feel fast

| Signed off by | Date | Notes |
|---|---|---|
| | | |
