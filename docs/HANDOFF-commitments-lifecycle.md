# Handoff — Commitments Lifecycle + Drop Lead Implementation

**Created:** 2026-04-10
**For:** The next Claude Code session that continues this work
**Prior session:** Eric and Claude locked the spec, wrote all 4 docs, committed Checkpoint 1 (type plumbing only, no behavior change), and designed the parallel-agent execution strategy.
**Branch:** `phase1/commitments-lifecycle` (off `phase1/foundation`)
**Feature flag:** `COMMITMENTS_V2` (default OFF — nothing in production changes until Eric flips it on)

---

## 1. Read this first — what you're walking into

Eric (OwnEZ Capital founder, product-minded, values simplicity) is building a feature on his live HNW investor CRM. The feature upgrades the Next Action system from a "forecast field" to an **auditable commitment with explicit close-out**, and adds an in-flow **Drop Lead** path. All design decisions are already made and locked in `DESIGN-SPEC.md`.

**The system is live in production.** Treat it accordingly:
- Feature flag `COMMITMENTS_V2` is OFF by default. Every new behavior must be gated behind `isCommitmentsV2Enabled()` from `lib/feature-flags.ts`.
- Neon migrations must be additive (nullable columns only, no destructive changes).
- A one-shot backfill script creates synthetic Commitment Set rows from existing `nextActionDate` fields before the flag is flipped on.
- Eric will manually walk through the test plan on a preview deploy before anything merges to master.

**The business-critical correctness invariant** (read this twice):

> When a user logs an activity while a prior Next Action is still open and overdue, the user must explicitly resolve the old commitment — Fulfilled, Still Pending, or Replace. If they pick "Still Pending," the prospect **stays overdue on the dashboard** even though a fresh activity was just logged. This is the "honest red" behavior and is the entire reason the feature exists. Do not let yourself break it.

Test scenarios 2B and 4A in [docs/commitments-manual-test-plan.md](commitments-manual-test-plan.md) exist specifically to catch regressions of this invariant. Treat them as canary tests.

---

## 2. What's already done

### Checkpoint 1 (committed as `0a6c18f9` on `phase1/commitments-lifecycle`)

**Spec — fully locked in [DESIGN-SPEC.md](../DESIGN-SPEC.md):**
- §2.4 Activity Log — 6 new nullable commitment fields on the Activity model
- §4.3 Activity Types — new `commitment_set` system type
- §5.1 Stale/Overdue — rewritten to read from open commitments (when flag on)
- §5.9 Commitments & Close-out Lifecycle — the full model
- §5.10 Drop Lead from Post-Activity Prompt
- §6.4.2 Post-activity flow — 3-step sequence (close-out → Next Action → success)
- §6.4.5 Timeline — commitment markers and fulfillment link rendering
- §12 DataService interface — 4 new methods

**Docs:**
- [docs/user-quick-log-guide.md](user-quick-log-guide.md) — Chad-facing manual (plain English, no accusatory tone, no "commit" terminology)
- [docs/zoho-commitments-integration.md](zoho-commitments-integration.md) — integration team handoff with embedded before/after Mermaid diagrams
- [docs/commitments-manual-test-plan.md](commitments-manual-test-plan.md) — ~30 manual scenarios, canary scenarios 2B and 4A are business-critical
- [docs/feature-flag-removal-checklist.md](feature-flag-removal-checklist.md) — inventory for eventual surgical removal
- [activity-flow-proposal.html](../activity-flow-proposal.html) — throwaway Mermaid artifact at repo root, delete only as part of feature flag removal

**Type plumbing (all type-safe, typecheck green, 33/33 unit tests passing):**
- `lib/types.ts`:
  - `CommitmentStatus` type (`open` | `fulfilled` | `superseded` | `cancelled`)
  - `EMPTY_COMMITMENT_FIELDS` exported helper for spreading null values
  - `Activity` gained 6 new nullable fields: `fulfillsCommitmentId`, `commitmentType`, `commitmentDetail`, `commitmentDueDate`, `commitmentStatus`, `commitmentClosedDate`
  - `PersonWithComputed` gained `openCommitmentCount`
  - `DataService` gained `getOpenCommitments`, `createCommitment`, `closeOutCommitment`, `dropLead`
- `lib/constants.ts`:
  - `commitment_set` added to `ACTIVITY_TYPES` (label: "Next Action Set", icon: "Target")
  - new `AUDIT_MARKER_ACTIVITY_TYPES` = `["stage_change", "reassignment", "commitment_set"]` — excluded from Days Since Last Touch
- `lib/feature-flags.ts`:
  - `isCommitmentsV2Enabled()` — single read site for the flag
  - Default OFF unless env var `COMMITMENTS_V2=on` (case-insensitive)
  - **Never read `process.env.COMMITMENTS_V2` directly anywhere else in the codebase** — this is what makes surgical removal possible
- **Mock provider (`lib/providers/mock.ts`)** — FULL working implementations of `getOpenCommitments`, `createCommitment`, `closeOutCommitment`, `dropLead`. The mock provider is feature-complete for the commitments lifecycle. You can test against it immediately.
- **Neon provider (`lib/providers/neon/index.ts`)** — STUB implementations that throw loudly ("schema migration pending"). The Neon implementation is the first big thing the next session must build.
- All ~12 existing Activity construction sites (API routes, seed data, scripts, stale.test.ts) updated to include the new nullable fields.

---

## 3. What's NOT done (the work you're picking up)

### Main-thread work (foundation — delicate, YOU do this personally in the new chat)

These are tightly coupled across the data layer and must not be parallelized:

1. **Neon schema migration** (`lib/providers/neon/schema.ts` + migration file)
   - Add 6 nullable columns to the `activities` table: `fulfills_commitment_id`, `commitment_type`, `commitment_detail`, `commitment_due_date`, `commitment_status`, `commitment_closed_date`
   - Add an index on `(activity_type, commitment_status)` for efficient open-commitment queries
   - The migration must run safely on live data (no table locks, all columns nullable). Run it manually against Eric's dev Neon (not production) to verify before committing.
2. **Neon provider real implementations** (`lib/providers/neon/queries/commitments.ts` new file + wire into `lib/providers/neon/index.ts`)
   - Replace the 4 stubs with real queries
   - `rowToActivity` in `lib/providers/neon/queries/activities.ts` must be updated to read the 6 new columns (currently hardcoded to null)
3. **Overdue/stale computation rework** (`lib/stale.ts` + consumers)
   - When flag is OFF: current behavior exactly (read from `person.nextActionDate`)
   - When flag is ON: compute from open commitments (check for any open Commitment Set row with `commitmentDueDate <= today`)
   - Must handle the "touched today but still overdue" case honestly. See scenario 2B.
   - This is the business-critical correctness change. Write unit tests that explicitly cover the honest-red case.
4. **API routes** (`app/api/persons/[id]/commitments/*` + `app/api/persons/[id]/drop-lead`)
   - `POST /api/persons/[id]/commitments` — create a commitment (calls `createCommitment` + updates Person next-action fields in a logical transaction)
   - `POST /api/persons/[id]/commitments/[commitmentId]/close-out` — close out with a resolution (F/P/R)
   - `POST /api/persons/[id]/drop-lead` — drop lead flow (Dead/Nurture with reason + note or re-engage date)
   - All three must gate behind `isCommitmentsV2Enabled()` and return 404 or 501 when flag off
5. **Backfill script** (`scripts/backfill-commitments.ts`)
   - See agent brief 3 below — this is delegated to an agent
6. **Integration: `components/person/quick-log.tsx`** — wire in the new UI components from agent 1, call the new API routes, handle the 3-step flow sequence
7. **Timeline rendering: `components/person/activity-timeline.tsx`** — render commitment markers and fulfillment links per spec §6.4.5

### Parallel agent work (3 agents, run concurrently with `isolation: "worktree"`)

See Section 5 below for the detailed agent briefs. Each agent works on disjoint files.

- **Agent 1 — UI Components** — builds `CloseOutPrompt` and `DropLeadPanel` as stand-alone components with clean props (pure new files)
- **Agent 2 — E2E Tests** — writes `e2e/commitments-lifecycle.spec.ts` covering the manual test plan scenarios (pure new file)
- **Agent 3 — Runbook + Backfill Script** — writes `scripts/backfill-commitments.ts` and `docs/commitments-go-live-runbook.md` (pure new files)

### Fresh session after this (the final integration)

Do NOT try to do the final UI integration in the new chat session. After the data-layer foundation is done AND the 3 agents have returned their work, commit the progress and hand off to a THIRD fresh session for the quick-log integration + E2E run + final runbook polish. The reason is context management — the integration phase wants fresh eyes.

---

## 4. Execution plan for the new chat session

Follow this exactly. The steps are ordered so you always have a clean fallback if something breaks.

### Step 0 — Situational awareness (first 5 minutes)
1. Read this entire handoff document
2. Read [DESIGN-SPEC.md](../DESIGN-SPEC.md) sections §2.4, §4.3, §5.1, §5.9, §5.10, §6.4.2, §6.4.5, §12 (skim, you don't need it memorized)
3. `git log --oneline -5` to see recent commits
4. `git status` to confirm clean working tree on `phase1/commitments-lifecycle`
5. `cat lib/feature-flags.ts` and `cat lib/types.ts | head -80` to confirm checkpoint 1 state
6. Read [docs/commitments-manual-test-plan.md](commitments-manual-test-plan.md) scenarios 2B and 4A specifically — these are the canary tests

### Step 1 — Spawn the 3 parallel agents FIRST
Before starting foundation work. Agents run in background while you work. Brief each one using the exact prompts in Section 5 below, with `isolation: "worktree"` and `run_in_background: true`.

Send all 3 Agent tool calls in a **single message** so they actually run in parallel.

### Step 2 — Main-thread foundation work (while agents run)
Do this in order. Commit after each numbered item.

**2a — Neon schema migration** (commit: "feat(commitments-v2): add commitment columns to activities table")
- Update `lib/providers/neon/schema.ts` — add 6 nullable columns
- Add an index on `(activity_type, commitment_status)`
- Check how migrations are applied in `lib/providers/neon/migrate.ts` and follow that pattern
- Run the migration against Eric's dev Neon and verify columns exist
- Note: this project uses `@neondatabase/serverless` + Drizzle. Verify current migration pattern before writing code — I did not read `migrate.ts` in the prior session. Don't guess at Drizzle migration APIs.

**2b — Neon provider commitment queries** (commit: "feat(commitments-v2): neon provider commitment queries")
- Create `lib/providers/neon/queries/commitments.ts` with `getOpenCommitments`, `createCommitment`, `closeOutCommitment`, `dropLead`
- Update `rowToActivity` in `lib/providers/neon/queries/activities.ts` to read the 6 new columns
- Replace the 4 stubs in `lib/providers/neon/index.ts`
- Run `npx tsc --noEmit` + `npx vitest run` — both must stay green

**2c — Overdue/stale computation rework** (commit: "feat(commitments-v2): overdue/stale driven by open commitments when flag on")
- `lib/stale.ts` currently has `computeIsStale` and `computeIsOverdue` that take `person.nextActionDate`. Refactor them so they also accept the list of open commitments for the person. When flag is OFF, behavior is unchanged. When flag is ON, overdue is driven by `EXISTS open commitment with dueDate <= today`, stale is suppressed only by future-dated open commitments.
- Both `enrichPerson` call sites (mock + neon) must pass the open commitments to `computeIsStale`/`computeIsOverdue`.
- Write new unit tests in `lib/__tests__/stale.test.ts` — at minimum:
  1. Flag off — old behavior identical (regression guard)
  2. Flag on, no commitments — not overdue, not stale
  3. Flag on, one open past-due commitment, person touched today — STILL OVERDUE (canary scenario 2B)
  4. Flag on, one fulfilled commitment due yesterday — not overdue
  5. Flag on, one future-dated open commitment — not stale even if Days Idle > threshold
  6. Flag on, one cancelled commitment past-due — not overdue (terminal state)

**2d — API routes** (commit: "feat(commitments-v2): API routes for commitments and drop lead")
- Create `app/api/persons/[id]/commitments/route.ts` (POST → createCommitment)
- Create `app/api/persons/[id]/commitments/[commitmentId]/close-out/route.ts` (POST → closeOutCommitment)
- Create `app/api/persons/[id]/drop-lead/route.ts` (POST → dropLead)
- All three gate behind `isCommitmentsV2Enabled()` — return 501 with clear error when flag off
- Add each route's call site to `docs/feature-flag-removal-checklist.md`
- Existing routes pattern: see `app/api/persons/[id]/stage/route.ts` and `app/api/persons/[id]/next-action/route.ts` for style

### Step 3 — Wait for agents to return
If agents finish before you do, that's fine — their output is parked in worktree branches. You'll merge them in step 4.

If you finish before agents, run `npx tsc --noEmit && npx vitest run` to verify foundation is clean, then stop and wait.

### Step 4 — Merge agent output into feature branch
Each agent returns with a branch + worktree path. For each:
1. `git merge <agent-branch> --no-ff` into `phase1/commitments-lifecycle`
2. Resolve any trivial conflicts (shouldn't be any if agents touched disjoint files)
3. Run typecheck + tests after each merge

### Step 5 — Stop here and commit everything
Do NOT start the integration work in this same session. Write a new handoff doc (`docs/HANDOFF-commitments-lifecycle-integration.md`) describing:
- What's in the branch now
- What's left (quick-log wiring, timeline rendering, E2E run, runbook verification)
- Any surprises or gotchas encountered during data-layer work

Commit that handoff. Then tell Eric to open a fresh chat session for the integration phase.

---

## 5. Parallel agent briefs (copy-paste into Agent tool calls)

### Agent 1 — UI Components (subagent_type: general-purpose, isolation: worktree)

**Description:** `Build close-out and drop-lead UI`

**Prompt:**

```
You are building two new React components for the OwnEZ HNW Investor CRM (Next.js App Router + Tailwind + shadcn/ui). These are stand-alone components with clean props interfaces — they do not touch any existing files.

**Read first (in order):**
1. docs/HANDOFF-commitments-lifecycle.md — full context, especially sections 1, 2, and the business-critical "honest red" invariant
2. DESIGN-SPEC.md §5.9 and §5.10 — the lifecycle model and Drop Lead semantics
3. DESIGN-SPEC.md §6.4.2 — the post-activity flow spec
4. docs/user-quick-log-guide.md — the user-facing behavior you are implementing
5. components/person/quick-log.tsx — read this ONLY to understand the existing Quick Log styling and state patterns. Do NOT modify it; that's the main thread's job.
6. components/ui/* — look at existing shadcn components to match the design language (Navy #0b2049, Gold #e8ba30, pill buttons, generous whitespace)
7. lib/constants.ts — NEXT_ACTION_TYPES, LOST_REASONS
8. lib/types.ts — Activity type, CommitmentStatus, NextActionType, LostReason

**Your task: build two new components, pure props-driven, zero side effects.**

---

**Component 1: `components/person/close-out-prompt.tsx`**

Props:
```typescript
interface CloseOutPromptProps {
  openCommitments: Activity[]; // will almost always be length 1, handle length>1 degenerate case
  onResolve: (resolutions: CloseOutResolution[]) => void; // called once user confirms
  onCancel: () => void;
}

type CloseOutResolution = {
  commitmentId: string;
  action: "fulfilled" | "pending" | "replace";
};
```

Rendering (for the typical single-commitment case):
```
⚠ Outstanding: Follow up — Q3 deck — due Mar 5 (2d overdue)

   [F] Fulfilled — this activity handled it
   [P] Still pending — logging something unrelated, commitment stays open
   [R] Replace — drop this, set a new one
```

Behavior:
- Three pill buttons, gold accent for the active one
- Keyboard: `F`, `P`, `R` keys select the corresponding action. Enter confirms.
- When there are multiple open commitments, render each with its own F/P/R selector in a stacked list. All default to `pending`. A single Confirm button at the bottom.
- Compute "Nd overdue" from commitmentDueDate vs today (use getTodayCT() from lib/format).
- Render commitmentType as its human label via NEXT_ACTION_TYPES.find().label
- Empty state: if openCommitments is empty, don't render (return null)

Do NOT make any API calls. Do NOT read/write global state. This is a pure presentational component that calls onResolve with the user's choices.

---

**Component 2: `components/person/drop-lead-panel.tsx`**

Props:
```typescript
interface DropLeadPanelProps {
  personName: string;
  onConfirm: (data: DropLeadData) => Promise<void>; // async so we can show loading state
  onCancel: () => void;
}

type DropLeadData =
  | { target: "dead"; lostReason: LostReason; reasonNote?: string }
  | { target: "nurture"; reengageDate: string };
```

Rendering sequence:
1. Two big pill buttons: `Dead` / `Nurture`
2. After picking Dead: render LOST_REASONS as clickable chips + optional text input for a note + Confirm button
3. After picking Nurture: render a DateQuickPick (look at components/ui/date-quick-pick.tsx — reuse it) prefilled with "+6 months" and a Confirm button
4. Show loading state while onConfirm is pending
5. Handle errors gracefully (catch + show inline error message)

Keyboard:
- When the parent shows this panel, user presses D to select Dead, N to select Nurture (hotkeys)
- Arrow keys navigate the chips
- Enter confirms

Design:
- Use the existing muted-background container pattern from components/person/edit-next-action.tsx if it exists
- Gold CTAs, navy text
- Use LOST_REASONS from lib/constants.ts — 6 values (not_accredited, not_interested, ghosted, timing, went_elsewhere, other)

---

**Tests to write (in `components/person/__tests__/`):**

Use Vitest + React Testing Library (already installed — check vitest.config.ts and find an existing component test for style reference).

For CloseOutPrompt:
- Renders single commitment with correct text
- Pressing F confirms with action="fulfilled"
- Pressing P confirms with action="pending"
- Pressing R confirms with action="replace"
- Multi-commitment: renders both, each has independent selector
- Multi-commitment: all default to "pending" until changed
- Returns null when openCommitments is empty
- Overdue text computes "Nd overdue" correctly

For DropLeadPanel:
- Shows Dead/Nurture pills initially
- Clicking Dead reveals lost reasons chips
- Clicking Nurture reveals date quick-pick
- Confirms Dead → calls onConfirm with correct shape
- Confirms Nurture → calls onConfirm with correct shape
- Shows error message if onConfirm rejects
- Pressing D selects Dead, N selects Nurture

---

**Deliverables:**
- `components/person/close-out-prompt.tsx`
- `components/person/drop-lead-panel.tsx`
- `components/person/__tests__/close-out-prompt.test.tsx`
- `components/person/__tests__/drop-lead-panel.test.tsx`

**Before returning:**
- Run `npx tsc --noEmit` — must be green
- Run `npx vitest run components/person/__tests__/close-out-prompt components/person/__tests__/drop-lead-panel` — tests must pass
- Commit with message: `feat(commitments-v2): close-out prompt and drop lead panel components`
- Return a summary: file paths, test count, any gotchas you hit

**Do NOT touch:**
- lib/* (any file in lib)
- components/person/quick-log.tsx
- components/person/activity-timeline.tsx
- app/api/*
- scripts/*
- docs/*
- DESIGN-SPEC.md

Your scope is STRICTLY the two new component files and their two test files.
```

---

### Agent 2 — E2E Tests (subagent_type: general-purpose, isolation: worktree)

**Description:** `Write E2E tests for commitments`

**Prompt:**

```
You are writing Playwright end-to-end tests for a new feature in the OwnEZ HNW Investor CRM (Next.js App Router). The feature adds an auditable Next Action lifecycle and a Drop Lead flow. The tests run against the mock provider (in-memory data).

**Important context on test timing:** The UI components and API routes this feature depends on are being built in parallel. You need to write the tests BEFORE those components exist, using testid selectors and the state the UI is specified to produce. Your tests may initially fail — that's fine. They are the test contract that the UI must match.

**Read first (in order):**
1. docs/HANDOFF-commitments-lifecycle.md — full context, especially the business-critical "honest red" invariant in section 1
2. docs/commitments-manual-test-plan.md — the ~30 scenarios you will translate into Playwright tests. Scenarios 2B and 4A are canary tests — if they don't fail the feature is broken.
3. DESIGN-SPEC.md §5.9 and §5.10 — the lifecycle model
4. e2e/workflow.spec.ts — read this for style and existing patterns (selectors, page.goto, login flow, test IDs)
5. e2e/person-detail.spec.ts — read for more context on how person detail tests work
6. playwright.config.ts — read to understand the test setup, base URL, mock provider initialization
7. lib/providers/mock.ts — understand what seed data exists. Eric's prior session verified the seed data includes Robert Calloway, Marcus Johnson, Sandra Kim, David Chen.

**Test scope:** Write a single new file `e2e/commitments-lifecycle.spec.ts` covering:

**Fast-path regression scenarios (5 tests):**
- 1A: First activity on a fresh prospect — no close-out prompt, standard Next Action prompt, success
- 1B: Logging activity while open commitment is future-dated — no close-out prompt
- 1C: Using "More options" to override activity type — still works

**Close-out scenarios (5 tests — these are the critical business logic):**
- 2A: Fulfilled path — verify timeline shows ✓ Fulfilled link, dashboard clears Robert from overdue
- **2B: Still pending path — CRITICAL — verify Robert STAYS on overdue list after logging a note and picking P. This test must explicitly assert that the Action Queue still contains Robert after the Quick Log completes.**
- 2C: Replace path — verify old commitment superseded, new one created with new date
- 2D: Close-out prompt does NOT fire for future-dated commitment
- 2E: Multi-commitment edge case — David Chen has two, F+R resolves both

**Drop lead scenarios (3 tests):**
- 3A: Drop to Dead — verify stage change, next-action cleared, open commitments cancelled, redirects away from person detail
- 3B: Drop to Nurture — verify re-engage date stored, appears in future Today's Actions
- 3C: Resurrection — mark Dead, then move stage back, verify all history preserved including cancelled commitments

**Dashboard honesty (2 tests — canary):**
- **4A: CRITICAL — Three prospects seeded overdue. Fulfilled clears Alpha, Still pending keeps Beta on overdue list, Replace with future date clears Gamma. This is the definitive test.**
- 4B: Stale flag interaction — future-dated commitment suppresses stale flag

**Feature flag regression (2 tests):**
- 5B: With COMMITMENTS_V2 unset, close-out prompt does NOT appear, legacy behavior intact
- 5C: Toggle on after off, previously-written commitment rows still render correctly

**Helpful test utilities:**

Write helpers in `e2e/fixtures/commitments-helpers.ts`:
```typescript
export async function seedPersonWithOpenCommitment(page, personId: string, daysOverdue: number) { ... }
export async function loginAsChad(page) { ... } // if not already in a shared helper
export async function logActivity(page, personId: string, text: string) { ... }
export async function expectOverdueOnDashboard(page, personId: string) { ... }
export async function expectNotOverdueOnDashboard(page, personId: string) { ... }
```

**Test IDs the UI will provide** (these are the contract — if the UI doesn't match, the UI is wrong):
- `close-out-prompt` — the whole prompt container
- `close-out-fulfilled` — F button
- `close-out-pending` — P button
- `close-out-replace` — R button
- `drop-lead-link` — the "Drop lead ▸" link inside the Next Action prompt
- `drop-lead-panel` — the expanded drop panel
- `drop-lead-dead` — Dead pill
- `drop-lead-nurture` — Nurture pill
- `drop-lead-reason-<key>` — each lost reason chip (e.g., `drop-lead-reason-not_accredited`)
- `drop-lead-confirm` — confirm button
- `timeline-commitment-marker-<id>` — each ◉ commitment marker in the timeline
- `timeline-fulfillment-link-<activityId>` — the ✓ fulfillment link under a fulfilling activity
- `action-queue-item-<personId>` — each row in the dashboard Action Queue
- `needs-attention-<personId>` — each card in the Needs Attention panel

**Environment setup:**
- Tests should set `COMMITMENTS_V2=on` for all tests except 5B
- Use `test.beforeEach` to reset mock data (there's an existing pattern in workflow.spec.ts — `await resetMockData(page)` or similar)

**Deliverables:**
- `e2e/commitments-lifecycle.spec.ts` (~15-20 tests total)
- `e2e/fixtures/commitments-helpers.ts`
- Do NOT run Playwright — the feature isn't built yet and you can't verify. Just ensure the TypeScript compiles.

**Before returning:**
- Run `npx tsc --noEmit` — must be green (Playwright tests are TypeScript)
- Commit with message: `test(commitments-v2): E2E test suite for commitments lifecycle and drop lead`
- Return a summary: test count, scenarios covered, any assumptions you made about the UI that the integration phase will need to match

**Do NOT touch:**
- Any file outside `e2e/`
- DESIGN-SPEC.md
- The implementation files (lib/, components/, app/)

Your scope is STRICTLY the e2e test file and its helpers.
```

---

### Agent 3 — Runbook + Backfill Script (subagent_type: general-purpose, isolation: worktree)

**Description:** `Write backfill script and runbook`

**Prompt:**

```
You are writing two deliverables for the OwnEZ CRM commitments lifecycle feature: a one-shot backfill script that migrates legacy Next Action data to the new Commitment Set format, and a go-live runbook that Eric will follow to turn the feature on in production.

**Read first (in order):**
1. docs/HANDOFF-commitments-lifecycle.md — full context, especially section 3 which describes what's done and what's not
2. docs/zoho-commitments-integration.md — the migration semantics, specifically section 5 "Backfill of existing data"
3. DESIGN-SPEC.md §5.9 — the commitments lifecycle model
4. docs/commitments-manual-test-plan.md — understand what Eric will test post-flag-flip
5. scripts/seed-demo-data.ts — style reference for how scripts in this project are written
6. scripts/clean-neon-data.ts — another style reference
7. scripts/test-provider.ts — yet another style reference; note how DataService is instantiated
8. lib/providers/neon/db.ts — how the Neon connection is made
9. .env.local (if it exists, peek at its structure — don't leak secrets)

**Your tasks:**

---

**Task 1: `scripts/backfill-commitments.ts`**

A one-shot idempotent script that:

1. Connects to Neon using `createDb()` from `lib/providers/neon/db.ts`
2. Queries `people` for all records where `next_action_date IS NOT NULL AND pipeline_stage NOT IN ('funded', 'nurture', 'dead')`
3. For each person, queries `activities` to check if they already have an open Commitment Set row. If yes, skip (idempotent).
4. For each remaining person, inserts a new row into `activities` with:
   - `id = crypto.randomUUID()` prefixed with `c-backfill-`
   - `person_id = person.id`
   - `activity_type = 'commitment_set'`
   - `source = 'manual'`
   - `date = today` (CT timezone — use getTodayCT from lib/format.ts)
   - `time = '00:00'`
   - `outcome = 'connected'`
   - `detail = "Backfilled from legacy Next Action"`
   - `documents_attached = '[]'`
   - `logged_by_id = 'u-system'` (or whatever system user exists — check scripts/seed-demo-data.ts)
   - `annotation = null`
   - `fulfills_commitment_id = null`
   - `commitment_type = person.next_action_type`
   - `commitment_detail = person.next_action_detail`
   - `commitment_due_date = person.next_action_date`
   - `commitment_status = 'open'`
   - `commitment_closed_date = null`
5. Logs to stdout: total candidates scanned, already-backfilled skipped, new commitments written, errors
6. Supports `--dry-run` flag: does all the work but doesn't actually write
7. Exits 0 on success, non-zero on any error with a clear error message

**Run command that must work:** `npx tsx --env-file=.env.local scripts/backfill-commitments.ts`

Note: the Neon schema won't actually have the commitment columns yet when you write this (that's the main thread's job). Your script must be written as if the columns exist — it's OK if running it right now would fail; the runbook sequences it correctly.

---

**Task 2: `docs/commitments-go-live-runbook.md`**

A step-by-step runbook Eric will actually follow to turn the feature on in live production. Write it assuming Eric is careful but not a database expert. Cover:

1. **Pre-flight checks** — confirm branch, confirm tests green, confirm preview deploy URL, confirm flag is OFF in production
2. **Step 1: Schema migration**
   - Exact command to run the Drizzle migration against production Neon
   - What to look for to confirm success (psql query to verify columns exist)
   - Rollback command if something goes wrong (drop the columns — they're all nullable and unused while flag is off)
3. **Step 2: Deploy with flag OFF**
   - Vercel deploy command
   - Verify production still works unchanged (smoke test checklist)
4. **Step 3: Run backfill script against production**
   - Exact command with `--dry-run` first
   - Verification query: count open commitments before and after
   - What to look for in the script output
5. **Step 4: Flip flag ON in Vercel preview**
   - How to set `COMMITMENTS_V2=on` in Vercel preview env
   - Deploy preview
   - Verification: walk the preview URL through the manual test plan (docs/commitments-manual-test-plan.md), specifically scenarios 2B and 4A
6. **Step 5: Flip flag ON in production**
   - Vercel production env change
   - Redeploy
   - Smoke test checklist
   - What to monitor for the first 24 hours
7. **Rollback plan** — exact steps to flip the flag back off if something breaks. Include how long data stays safe (new Commitment Set rows are additive, they don't break anything when flag flips off).
8. **Cleanup (2 weeks later)** — reference to docs/feature-flag-removal-checklist.md for the eventual removal work

Write this like a pilot's checklist — every step has an exact command and a clear expected output. If a step's output doesn't match the expected, Eric should stop and investigate.

---

**Deliverables:**
- `scripts/backfill-commitments.ts`
- `docs/commitments-go-live-runbook.md`

**Before returning:**
- Run `npx tsc --noEmit` — must be green (your backfill script must compile)
- Do NOT run the backfill script (schema isn't migrated yet)
- Commit with message: `feat(commitments-v2): backfill script and go-live runbook`
- Return a summary: script capabilities, runbook outline, any assumptions you made about the Neon environment that Eric should verify

**Do NOT touch:**
- Anything in lib/, components/, app/, e2e/
- DESIGN-SPEC.md
- Any existing script or doc

Your scope is STRICTLY the two new files.
```

---

## 6. Gotchas and things to watch for

**Line endings:** The repo is on Windows; git is set to handle line endings on commit (warnings are normal). Ignore the `LF will be replaced by CRLF` warnings.

**Feature flag discipline:** Every new `isCommitmentsV2Enabled()` call site MUST be added to `docs/feature-flag-removal-checklist.md` in the SAME commit. This is how we get surgical removal later.

**Mock provider vs Neon provider:** The mock provider already has working commitment implementations. You can test the foundation of the feature (stale/overdue logic, API routes) against the mock provider immediately without needing the Neon schema migration. This means you can sequence the work as: stale rework → API routes → mock E2E working → THEN Neon migration → Neon provider → live-ready. Use this to de-risk.

**`scripts/test-provider.ts`:** This is a 33-case provider test harness that runs against whichever provider is set in DATA_PROVIDER. When you add the new methods to Neon, add cases to this file that test the new methods against both providers.

**Existing tests you must not break:**
- `npx vitest run` — 33 unit tests, all currently passing
- `npx tsx --env-file=.env.local scripts/test-provider.ts` — provider-level tests
- `npx playwright test` — existing e2e suite (94 tests per the README)

**Neon dev vs prod:** Eric has a dev Neon instance and a production Neon instance. Run migrations against dev first, verify, then document prod migration as part of the runbook. Never run a destructive command against prod.

**Memory already saved:**
- `project_commitments_lifecycle.md` — the project memory entry for this feature
- `project_ownez_crm.md` — general project memory
- `user_eric.md` — user profile

---

## 7. Success criteria for the new session

Before handing off to the fresh session for integration:

- [ ] All 3 agents have returned successfully and their commits are merged into `phase1/commitments-lifecycle`
- [ ] Neon schema migration written, applied to dev Neon, verified via psql
- [ ] Neon provider commitment queries implemented and tested via `test-provider.ts`
- [ ] `lib/stale.ts` rewritten with the 6 new unit tests (canary scenario 2B passing)
- [ ] API routes created, feature-flag-gated, added to removal checklist
- [ ] `npx tsc --noEmit` green
- [ ] `npx vitest run` green
- [ ] `npx tsx --env-file=.env.local scripts/test-provider.ts` green against mock provider
- [ ] New handoff doc written at `docs/HANDOFF-commitments-lifecycle-integration.md` describing what's left
- [ ] Everything committed on `phase1/commitments-lifecycle`

---

## 8. One more thing

Eric values:
- **Simplicity.** If a change adds complexity without a clear benefit, push back.
- **Honesty about progress.** Don't say "done" unless it really is. Say "checkpoint 2 committed, ready for checkpoint 3" — not "most of the work is done."
- **Not doing things you weren't asked to do.** If you find yourself refactoring something unrelated, stop. Scope discipline is more valuable than cleverness.
- **Live system safety.** When in doubt, err on the side of "don't touch production." Ask before running anything that could affect live data.

The previous session earned trust by being honest about context budget and proposing the parallel-agent + fresh-session-for-integration structure. Continue that posture.

Good luck.
