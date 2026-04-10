# Handoff — Commitments Lifecycle Integration (Checkpoint 3)

**Created:** 2026-04-10
**For:** A fresh Claude Code session that will do the final UI integration
**Prior session:** Eric and Claude finished Checkpoint 2 — all four data-layer
foundation commits (2a–2d), merged 3 parallel agent branches (UI components,
E2E tests, backfill+runbook), and fixed a runbook-drizzle mismatch discovered
during review. Branch is clean and every pre-existing test is still green.
**Branch:** `phase1/commitments-lifecycle` (off `phase1/foundation`)
**Feature flag:** `COMMITMENTS_V2` (still OFF by default — nothing in
production changes until Eric flips it on)

---

## 1. Read this first

The prior handoff — `docs/HANDOFF-commitments-lifecycle.md` — is still the
authoritative brief for what the feature IS and WHY. Read it if you haven't.
This document only covers what's NEW since then and what's LEFT.

**The business-critical invariant** (worth repeating):

> When a user logs an activity while a prior Next Action is still open and
> overdue, the user must explicitly resolve the old commitment — Fulfilled,
> Still Pending, or Replace. If they pick "Still Pending," the prospect stays
> overdue on the dashboard even though a fresh activity was just logged. This
> is the "honest red" behavior. Canary scenarios 2B and 4A in
> `docs/commitments-manual-test-plan.md`.

The data layer and API routes enforce this correctly. The remaining work is
wiring the UI and verifying end-to-end.

---

## 2. What's in the branch now

### Checkpoint 2 — data-layer foundation (main thread)

| Commit | Content |
|---|---|
| `6078256f` | **2a** — 6 nullable commitment columns + `(activity_type, commitment_status)` index. Applied to dev Neon via the new `runMigrations` ALTER block. |
| `4e9b6d89` | **2b** — New `lib/providers/neon/queries/commitments.ts` implementing `getOpenCommitments` / `createCommitment` / `closeOutCommitment` / `dropLead` against real Neon. `rowToActivity` now reads the 6 new columns. Also fixes `vitest.config.ts` exclude glob (`node_modules/**` → `**/node_modules/**` + `.claude/**`) so nested worktree node_modules don't pollute test runs. |
| `cd9d0ef7` | **2c** — `lib/stale.ts` reworked. Null = legacy mode (byte-identical). Array = v2 mode (honest red). All 4 `enrichPerson` sites updated (`lib/providers/mock.ts`, `lib/providers/neon/queries/{people,relationships,leadership}.ts`). 12 new unit tests on top of the existing 18 — canary 2B is `computeIsOverdue — v2 mode › flag on, one open past-due commitment → overdue`. |
| `4891a3db` | **2d** — Three new POST routes under `app/api/persons/[id]/`: `commitments/`, `commitments/[commitmentId]/close-out/`, `drop-lead/`. All gated behind `isCommitmentsV2Enabled()` (501 when flag off). `close-out` deliberately does not handle "Still Pending" — that's the empty-action path in the UI. |

### Checkpoint 2 — agents, merged in order

| Commit | Agent | Content |
|---|---|---|
| `46dd7cad` | Agent 1 (UI) | Merge of `worktree-agent-a9588273` / `501b34a9`. Adds `components/person/close-out-prompt.tsx`, `components/person/drop-lead-panel.tsx`, and 28 component tests. **Adds 5 devDependencies** (`@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`) via per-file `// @vitest-environment jsdom` directives — global `vitest.config.ts` still uses `environment: 'node'`. |
| `664e1b9c` | Agent 2 (E2E) | Merge of `worktree-agent-ab7082ca` / `d4103bb7`. Adds `e2e/commitments-lifecycle.spec.ts` (15 tests) and `e2e/fixtures/commitments-helpers.ts`. Tests are the contract — they will initially fail, that's expected. |
| `ba03bb0f` | Agent 3 (ops) | Merge of `worktree-agent-aaaf71a2` / `f5b5d1f8`. Adds `scripts/backfill-commitments.ts` (idempotent, `--dry-run` supported) and `docs/commitments-go-live-runbook.md`. |

### Checkpoint 2 — post-agent cleanup

| Commit | Content |
|---|---|
| `9abfe861` | **Runbook fix** — Agent 3's runbook assumed `drizzle-kit generate` / `drizzle-kit push` for migrations, but this project doesn't use drizzle-kit. Added `scripts/apply-neon-migrations.ts` (explicit `runMigrations(db)` + verification) and patched runbook Step 1.1–1.3 to use it. Verified idempotent on dev Neon. |

### Verification state (last run, this session)

- `npx tsc --noEmit` — clean
- `npx vitest run` — **73/73 passing** (18 legacy stale + 12 v2 stale + 5 touch-count + 16 CloseOutPrompt + 12 DropLeadPanel + 10 pre-existing)
- `DATA_PROVIDER=mock COMMITMENTS_V2=on npx tsx --env-file=.env.local scripts/test-provider.ts` — 33/33
- `DATA_PROVIDER=mock npx tsx --env-file=.env.local scripts/test-provider.ts` — 33/33 (flag off regression guard)
- `DATA_PROVIDER=neon npx tsx --env-file=.env.local scripts/test-provider.ts` — **known issue, see §5** (seed is not idempotent after the first successful run)
- `npx tsx --env-file=.env.local scripts/apply-neon-migrations.ts` — clean against dev Neon

---

## 3. What's left (the integration work)

These are the items that require fresh eyes and a clean context budget — do
them in a new session, not as a continuation of the current branch-in-flight.

### 3.1 Wire Quick Log to the new components and API routes

File: `components/person/quick-log.tsx`.

The Quick Log is where the 3-step post-activity flow lives: (1) close-out
prompt if there are open commitments, (2) Next Action prompt with optional
Drop Lead panel, (3) success banner. Checkpoint 1 types already include
everything needed; the data layer and API routes are done; the UI components
are built and tested as stand-alone pieces. Your job is to compose them.

Per DESIGN-SPEC §6.4.2 — the sequence is:

1. User types activity text and hits Enter → `POST /api/persons/[id]/activities`
   creates the activity row (existing behavior, unchanged). Capture the
   returned `activityId`.
2. Before showing the Next Action prompt, call the new API to fetch
   `getOpenCommitments(personId)`. If any have `commitmentDueDate <= today`,
   render the `CloseOutPrompt` component with them. **Use `<=` here (not `<`)
   — this is the close-out-prompt condition, not the overdue-flag condition.
   A commitment due today triggers the prompt but does NOT flip overdue.**
3. User resolves each commitment: `fulfilled` / `pending` / `replace`.
   For each `fulfilled` → call `POST /api/persons/[id]/commitments/[commitmentId]/close-out`
   with `status: "fulfilled"` and `fulfilledByActivityId: <the activity you just logged>`.
   For each `replace` → call close-out with `status: "superseded"`.
   For each `pending` → **do NOT call the API**. Just move on. This is the
   honest-red path — leaving the commitment open is the point.
4. If any resolution was `replace`, force-clear the date field in the Next
   Action prompt so the user picks a new one. If all were `fulfilled` or
   `pending`, the date field prefills with the old value.
5. Render Next Action prompt. It has a "Drop lead ▸" link that expands the
   `DropLeadPanel` component inline.
6. If user fills in Next Action: `POST /api/persons/[id]/commitments` with
   `{commitmentType, commitmentDetail, commitmentDueDate}`. The route creates
   the Commitment Set row AND mirrors to `Person.nextAction*`.
7. If user picks Drop Lead: `POST /api/persons/[id]/drop-lead` with the
   target and reason/reengageDate. The route atomically updates stage,
   clears next-action fields, cancels open commitments, logs a stage_change.
   Redirect away from person detail on success.

**Keyboard flow** matters — see scenario 6A in the manual test plan. The
whole loop should be doable without touching the mouse: `L` to focus
Quick Log, type text, Enter, F/P/R for each commitment, Enter to confirm,
Tab through date chips, Enter to confirm.

### 3.2 Timeline rendering

File: `components/person/activity-timeline.tsx`.

Per DESIGN-SPEC §6.4.5:

- For each Commitment Set row: render `◉ Commitment set · <Type label> · due <date>`
  with a status badge: no badge if `open`, `✓ fulfilled (Nd late)` if `fulfilled`,
  `↺ superseded` if `superseded`, `✕ cancelled` if `cancelled`.
- For each non-commitment activity with `fulfillsCommitmentId != null`:
  render a `✓ Fulfilled: <commitment detail> (Nd late)` link underneath,
  linking to the Commitment Set row up in the timeline.
- Commitment Set is excluded from the "Days Since Last Touch" computation
  (already handled in `lib/stale.ts`; timeline just needs to render it).

Testids required by `e2e/commitments-lifecycle.spec.ts`:
- `timeline-commitment-marker-<id>` on each ◉ row
- `timeline-fulfillment-link-<activityId>` on each ✓ link

### 3.3 Dashboard testids

File: wherever the Action Queue and Needs Attention panels live on the
dashboard (check `app/page.tsx` and `components/dashboard/*`).

Agent 2's E2E tests expect:
- `action-queue-item-<personId>` — each row in the Action Queue
- `needs-attention-<personId>` — each card in the Needs Attention panel

Add these before running Playwright. The E2E tests rely on them to verify
the canary 4A matrix (Alpha clears, Beta stays overdue, Gamma clears).

### 3.4 Optional API routes the E2E tests expect

Agent 2 assumed two routes that don't exist yet. Decide whether to add them
or work around:

- **`GET /api/persons/[id]/commitments`** — returns the list of open
  commitments for a person. The E2E helpers use this to seed test data and
  to assert state after close-out. **Recommended: add it.** It's a trivial
  wrapper around `ds.getOpenCommitments(personId)`.
- **`GET /api/feature-flags`** — returns `{commitmentsV2: boolean}`. The
  E2E helper uses it to auto-skip tests 5B and 5C based on server state.
  **Recommended: skip.** Agent 2 says the helper defaults to "flag on" on
  error, so 5B gets silently skipped, which is fine since 5B must run in a
  separate flag-off invocation anyway.

Both are out of scope for the core feature. Only 3.4a matters for the E2E
tests to seed cleanly.

### 3.5 Run the E2E suite and fix contract drift

Once 3.1–3.3 are done, run `npx playwright test e2e/commitments-lifecycle.spec.ts`
and address whatever fails. Agent 2 noted several assumptions about testids
and DOM structure that may need adjustment — fix the UI to match the tests,
not the other way around (the tests are the contract).

**Canary tests that MUST pass before merge:**
- Scenario 2B (Still Pending leaves Robert on overdue list after reload)
- Scenario 4A (dashboard F/P/R matrix across Alpha/Beta/Gamma)

If either fails, the feature is broken. Do not merge.

### 3.6 Manual walkthrough on preview deploy

Run `docs/commitments-manual-test-plan.md` end-to-end on a Vercel preview
deploy with `COMMITMENTS_V2=on`. Use the mock provider first (safer), then
optionally against the dev Neon environment.

### 3.7 Flip the flag (production rollout)

Follow `docs/commitments-go-live-runbook.md` step by step. The runbook's
Step 1.3 now uses `scripts/apply-neon-migrations.ts` (not drizzle-kit).

---

## 4. Known issues and surprises from Checkpoint 2

### 4.1 Mock seed personas don't match the handoff brief
Agent 2 discovered the mock seed has `p-david` = David **Thornton** (not
Chen) and `p-sandra` = Sandra Kim (not Sarah). The E2E tests reference the
real seed IDs. If you want the manual test plan to also match, edit
`docs/commitments-manual-test-plan.md` §0.2 to use the real names, or add
`p-sarah` / `p-david-chen` to the mock seed.

### 4.2 Agent 1 added 5 devDependencies
`@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`,
`@testing-library/jest-dom`, `jsdom`. Used via per-file
`// @vitest-environment jsdom` directives — global `vitest.config.ts` still
uses `environment: 'node'`. If you add more component tests, use the same
directive rather than flipping the global config.

`npm audit` reports 12 vulnerabilities (7 moderate, 5 high) all in the
testing-library transitive tree. Dev-only, not production-facing. Not
worth fixing in this feature branch.

### 4.3 Close-out prompt multi-commitment hotkeys
Agent 1's `CloseOutPrompt` gives each commitment its own F/P/R selector in
the multi-commitment case (good — per spec §5.9), but the F/P/R keyboard
hotkeys only mutate the **top** commitment. Clicks work per-commitment. This
means scenario 2E (David with two commitments needing F+R) must use clicks,
not keys. The E2E test (agent 2) uses clicks too, so they're consistent.
Worth noting in the user guide if we ever expect Chad to do this keyboard-only.

### 4.4 Extra testids agent 1 added beyond the contract
- `close-out-confirm` on the Confirm button (agent 1's test uses it)
- `drop-lead-error` on the inline error message (agent 1's test uses it)

Integration phase should keep these testids when wiring Quick Log.

### 4.5 Agent 2 drop-lead assumption
Agent 2 assumed the "Drop lead ▸" link lives only in the Next Action prompt
(reachable after F or R close-out, not after P). Test 3A works around by
going through the Fulfilled path. If §5.10 calls for a Drop Lead path that's
reachable directly after P, test 3A needs a minor tweak — check the spec.

### 4.6 Agent 3 used `u-chad` for backfill attribution
No `u-system` user exists in the mock or Neon seed. Agent 3 chose `u-chad`
to match `scripts/seed-demo-data.ts`. Backfill rows are still discoverable
via the `c-backfill-` id prefix. If you want audit clarity, create a
`u-system` user in the `users` table before running the live backfill and
change the literal in `scripts/backfill-commitments.ts`.

### 4.7 `scripts/test-provider.ts` is not idempotent against Neon
`seedTestData` inside `test-provider.ts` calls `createLeadSource('velocis_network')`
which now collides with the main Neon seed after the first successful run.
First run against Neon passed 33/33; subsequent runs fail in the seed step
before any test executes. Pre-existing bug, not caused by this feature. To
verify against Neon, run `scripts/clean-neon-data.ts` first.

### 4.8 Checkpoint 2 runbook fix (post-agent-merge)
Agent 3's runbook referenced `drizzle-kit generate` / `drizzle-kit push`
which this project doesn't use. Commit `9abfe861` added
`scripts/apply-neon-migrations.ts` and patched runbook Step 1.1–1.3 to use
the explicit runMigrations approach. No other runbook sections were touched.

### 4.9 `.claude/worktrees/*` directories still exist on disk
The three worktree directories from the parallel agents are still present
at `.claude/worktrees/agent-{a9588273,ab7082ca,aaaf71a2}`. They each have
their own node_modules. The vitest exclude in `vitest.config.ts` now covers
`.claude/**` so they don't pollute the test run. Clean them up with
`git worktree remove` once you're confident you don't need to inspect the
agent's original state, or leave them — they're in `.claude/` which is
already gitignored.

---

## 5. Success criteria for the integration session

Before merging `phase1/commitments-lifecycle` to `phase1/foundation`:

- [ ] `quick-log.tsx` wires the 3-step flow end-to-end (close-out → Next
      Action → success). Flag-gated.
- [ ] `activity-timeline.tsx` renders commitment markers and fulfillment
      links with the required testids.
- [ ] Dashboard testids added (`action-queue-item-*`, `needs-attention-*`).
- [ ] `GET /api/persons/[id]/commitments` added (optional but recommended).
- [ ] `npx playwright test e2e/commitments-lifecycle.spec.ts` — canary 2B
      and 4A both green.
- [ ] `npx vitest run` — all unit tests still green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Eric walked through the manual test plan on a preview deploy with
      `COMMITMENTS_V2=on` and signed off.
- [ ] `scripts/test-provider.ts` idempotency fix (optional, separate concern).

---

## 6. If you're stuck or uncertain

The prior session's posture is worth continuing:

- **Scope discipline.** The handoff for this feature is already very long.
  If you find yourself refactoring something unrelated, stop.
- **Honest progress.** Say "3.1 done, 3.2 in progress" — not "almost done".
- **Don't break the canary.** Scenario 2B and 4A are the reason the feature
  exists. Every commit should preserve them.
- **Ask before production.** Dev Neon is safe. Production Neon is not.
  The runbook is the contract for production steps.

Good luck.
