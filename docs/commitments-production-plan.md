# Commitments v2 — Live-Data Production Plan

**Audience:** Eric and whoever executes the rollout
**Skim time:** 5–10 minutes
**Companion doc:** [docs/commitments-go-live-runbook.md](commitments-go-live-runbook.md) — the command-level cookbook. This document is the **decision-level plan** with risks, go/no-go gates, and rollback logic. Where a phase below says "run the migration script," the runbook has the exact command, expected stdout, and copy-pasteable SQL checks.

---

## 1. Executive summary

The Commitments Lifecycle + Drop Lead feature (branch `phase1/commitments-lifecycle`) is code-complete behind the `COMMITMENTS_V2` flag. This plan takes us from flag-OFF in production to flag-ON with live data intact.

**The core claim:** every step is reversible. Schema changes are additive (six nullable columns). Backfill is idempotent and reversible (`c-backfill-*` id prefix). The flag flip is a single env var change. The worst case at every stage is "flip the flag off and try again next week."

**The irreducible work:**
1. Take a Neon snapshot (free insurance)
2. Apply the additive schema migration (idempotent, safe with live writes)
3. Deploy the new code with the flag OFF (no behavior change)
4. Backfill synthetic Commitment Set rows from existing `next_action_date` values
5. Flip the flag on Preview, validate canaries 2B and 4A
6. Flip the flag in Production, smoke-test, monitor

---

## 2. Live-data risk inventory

Every risk that could affect real prospect records. Safeguard column is what's *already in place* — not future work.

| # | Risk | Probability | Impact | Safeguard |
|---|------|-------------|--------|-----------|
| 1 | Schema migration locks `activities` table, blocking writes | Very low | High | Migration is 6 × `ALTER TABLE activities ADD COLUMN IF NOT EXISTS` + one `CREATE INDEX` — Postgres acquires `AccessExclusiveLock` only for the metadata update, not a full table rewrite. Sub-second even on the largest prod tables we'll encounter. Verified in `lib/providers/neon/migrate.ts:83-89`. |
| 2 | Backfill creates duplicate open commitments per person | Very low | Medium | `scripts/backfill-commitments.ts` checks for existing open `commitment_set` rows per person before inserting. Row IDs use the stable `c-backfill-{personId}` prefix so re-runs are no-ops. Has a `--dry-run` mode. Verified in `scripts/backfill-commitments.ts:1-20`. |
| 3 | Flag flip exposes unfinished or broken UI | Low | High | Three-gate verification: (a) flag-OFF deploy verified green in production; (b) flag-ON deploy verified on Preview with manual canary 2B + 4A; (c) Production flip only after (a) and (b) pass. E2E canaries codified in `e2e/commitments-lifecycle.spec.ts`. |
| 4 | Dashboard shows stale overdue after flag on (fulfilled commitments still counted) | Very low | Medium | Dashboard filter in `app/page.tsx:30-47` reads computed `p.isOverdue` which in v2 mode queries open commitment rows (not `person.nextActionDate`). Canary 4A verifies this path end-to-end: Alpha clears after Done, Beta stays overdue after Still Pending, Gamma clears after Replace. |
| 5 | Chad confused by new UI / missing old behavior | Low | Low | User guide shipped as PDF ([docs/user-quick-log-guide.pdf](user-quick-log-guide.pdf)) and MD. Fast path (nothing outstanding) is byte-identical to pre-feature behavior. New behavior only fires when there's genuinely an overdue Next Action. |
| 6 | In-flight writes during migration window | Very low | Medium | Flag is OFF during migration and backfill, so the frontend won't create any `commitment_set` rows concurrent with the backfill. The migration itself is additive and non-blocking. |
| 7 | Backfill run against prod before schema migration applied | Low | High | Backfill script fails loudly if columns don't exist (script header comments that explicitly). Runbook sequences them correctly. |
| 8 | Catastrophic: prod data corrupted somehow | Negligible | Critical | Neon snapshot branch created before any of this starts. Restore is a single command (`neon branches reset`). Rollback Level 0 in §5. |

---

## 3. Pre-flight readiness checklist

Tick every box before starting Phase 1. Any unchecked item is a stop.

- [ ] Branch `phase1/commitments-lifecycle` merged to `phase1/foundation` (or the target integration branch) on origin
- [ ] `npx tsc --noEmit` — clean on latest commit
- [ ] `npx vitest run` — 73/73
- [ ] `DATA_PROVIDER=mock COMMITMENTS_V2=on npx playwright test e2e/commitments-lifecycle.spec.ts` — 14 passed, 1 skipped (5B correctly skipped with flag on)
- [ ] `DATA_PROVIDER=mock npx playwright test e2e/commitments-lifecycle.spec.ts -g "5B"` — passes with flag off
- [ ] `DATA_PROVIDER=mock COMMITMENTS_V2=on npx tsx --env-file=.env.local scripts/test-provider.ts` — 33/33
- [ ] Eric has completed the manual test plan walkthrough on a preview deploy with mock data — canary scenarios 2B and 4A verified by hand
- [ ] Chad has been given the user guide PDF and has had the chance to ask questions
- [ ] Vercel project has Preview and Production environments configured separately so `COMMITMENTS_V2` can be set per environment
- [ ] Neon dev branch is accessible and the `DATABASE_URL` for production is known
- [ ] Backup plan: you know how to contact someone who can restore a Neon snapshot branch in under 10 minutes if something goes very wrong

---

## 4. The procedure

Six phases. Each has a **Go/No-Go gate** — a binary check that must pass before the next phase starts.

### Phase 1 — Snapshot + schema migration

**Goal:** additive columns exist on production `activities` table, no traffic impact.

1. Create a Neon snapshot branch of production as `pre-commitments-v2` (via Neon dashboard or `neon branches create`). This is the rollback-of-last-resort.
2. Pull production `DATABASE_URL` into a local env (do not check in).
3. Run `npx tsx --env-file=.env.local scripts/apply-neon-migrations.ts`. Expected output: `✅ Migrations applied successfully` with no errors.
4. Verify columns exist with the SQL in [Appendix A](#appendix-a--sql-validation-queries). Expected: all 6 commitment columns present, `(activity_type, commitment_status)` index exists.

**Go/No-Go gate:** SQL verification returns all 6 columns. If any are missing, investigate before proceeding (re-run script; inspect Neon logs).

---

### Phase 2 — Deploy with flag OFF

**Goal:** new code in production, zero behavior change.

1. `vercel --prod` (or merge to whichever branch auto-deploys to production).
2. Confirm `COMMITMENTS_V2` is unset or empty in Vercel **Production** env settings. (The flag defaults to OFF when unset — see `lib/feature-flags.ts`.)
3. Wait for deploy to finish.
4. Production smoke test:
   - Log in, land on dashboard
   - Verify dashboard looks identical to before the deploy (same prospects, same overdue count)
   - Click into a prospect, open Quick Log, log a test activity
   - Verify the OLD Next Action prompt appears (single-step, no close-out prompt) and that hitting Confirm works
   - Verify `GET /api/persons/[id]/commitments` returns HTTP 501 (flag off) — `curl`-able to confirm route is gated

**Go/No-Go gate:** production behavior unchanged; legacy Quick Log works; API returns 501 on commitment routes. If any differ, roll back the deploy before proceeding.

---

### Phase 3 — Backfill existing data

**Goal:** every active prospect with a `next_action_date` gets a synthesized `commitment_set` row in `open` status.

1. **Dry run first** (always): `npx tsx --env-file=.env.local scripts/backfill-commitments.ts --dry-run`. Script prints: number of candidate persons, number that already have an open commitment (skipped), number that will be written.
2. Review the candidate count against Eric's expectation. Rule of thumb: should roughly equal the count of active-stage prospects with a non-null `next_action_date`. If the number is wildly off (half of what expected, or triple), stop and investigate.
3. **Live run:** `npx tsx --env-file=.env.local scripts/backfill-commitments.ts` (no flag). Expected stdout: `Wrote N rows, 0 errors`.
4. Verify with the SQL in [Appendix A](#appendix-a--sql-validation-queries):
   - Count of `commitment_set` rows with `c-backfill-` prefix = N
   - All backfilled rows have `commitment_status = 'open'`
   - Sample 5 rows by querying on `c-backfill-` prefix and eyeballing that `commitment_due_date` matches the corresponding `people.next_action_date`

**Go/No-Go gate:** backfill count matches dry-run expectation; no errors; spot-checked rows have correct due dates. If anything is off, see §5.3 (Level 2 rollback — clean delete and retry).

---

### Phase 4 — Preview validation

**Goal:** the flag-on path works end-to-end against production data copied to a preview deploy.

1. In Vercel, set `COMMITMENTS_V2=on` on the **Preview** environment only (not Production yet).
2. Create a Preview deploy (push a commit, or redeploy existing preview).
3. Confirm the Preview deploy is using the production `DATABASE_URL` (or a recent branch of it). If using a separate dev Neon, confirm that Neon has also been migrated and backfilled.
4. Run the two canary scenarios **by hand** against the Preview URL, logged in as Chad:
   - **Canary 2B — Honest red.** Pick any prospect with an overdue Next Action (backfill created many). Log an unrelated activity. When the close-out prompt appears, click **[P] Still pending**. Confirm the success banner fires, reload the dashboard, confirm the prospect **is still on the overdue list**. This is the whole reason the feature exists; if this fails, the rollout stops.
   - **Canary 4A — Dashboard matrix.** Pick three prospects with overdue commitments. On prospect 1, log an activity → **Done** → Confirm the Next Action prompt (any date). On prospect 2, log an activity → **Still pending**. On prospect 3, log an activity → **Replace** → pick a future date. Return to dashboard. Confirm: prospect 1 **NOT** overdue, prospect 2 **still** overdue, prospect 3 **NOT** overdue.
5. Also spot-check Drop Lead: pick any prospect, log an activity, pick Done, click **Drop lead ▸**, pick Dead + a lost reason, confirm. Verify the prospect leaves the active pipeline (moves to Dead stage).

**Go/No-Go gate:** canary 2B green, canary 4A green, drop lead works. If any fail, flip `COMMITMENTS_V2` back off on Preview, investigate on mock first.

---

### Phase 5 — Production flag flip

**Goal:** Chad sees the new flow on real data.

1. In Vercel, set `COMMITMENTS_V2=on` on **Production**.
2. Redeploy production (Vercel env changes don't trigger redeploy automatically — trigger one manually or push an empty commit).
3. Wait for deploy. Confirm `GET https://<prod-url>/api/feature-flags` returns `{"commitmentsV2": true}`.
4. **7-point production smoke test** (2 minutes, Chad can do this if he's signed off on it):
   1. Log in, land on dashboard
   2. Pick an overdue prospect, open their page
   3. Log a test activity (something innocuous like "testing new flow")
   4. Verify the close-out prompt appears with **[D] Done / [P] Still pending / [R] Replace**
   5. Click **[D] Done**; verify the Next Action prompt appears; click Confirm with an empty date (should dismiss, no new commitment)
   6. Return to dashboard; verify the prospect cleared from overdue
   7. Click into a different prospect; verify timeline renders the activity plus a `◉ Next action set · ... · ✓ done` marker if they had one closed out

**Go/No-Go gate:** all 7 smoke-test steps pass. If any fail, execute Rollback Level 1 (§5.1) immediately.

---

### Phase 6 — Monitoring

**Goal:** confirm stability over time; earn the right to remove the feature flag.

- **First 1 hour.** Tail Vercel logs. Watch for 5xx on these new routes specifically:
  - `POST /api/persons/[id]/commitments`
  - `POST /api/persons/[id]/commitments/[commitmentId]/close-out`
  - `POST /api/persons/[id]/drop-lead`
  - `GET /api/persons/[id]/commitments`
  - `GET /api/feature-flags`
- **First 24 hours.** Monitor:
  - Dashboard overdue count trend — should be comparable to pre-flag numbers (backfill created rows from the same source data, so the count shouldn't spike or crater)
  - Chad's Slack / email for "hey this seems broken"
  - Neon slow-query log if enabled
- **First week.** Light touch — check in with Chad mid-week, confirm no regressions in his morning routine.
- **Week two.** If still stable and Chad is happy, schedule the feature-flag removal work (Appendix B).

**Exit condition:** 14 days stable run → proceed to feature flag removal per `docs/feature-flag-removal-checklist.md`.

---

## 5. Rollback playbook

Four levels, escalating in destructiveness and time-to-recover. **Almost all real-world incidents are recoverable at Level 1.**

### 5.1 Level 1 — Flag off (2 minutes)

**When:** UI bug, user confusion, unexpected behavior that doesn't corrupt data.

**How:**
1. Vercel → Production env → remove or blank `COMMITMENTS_V2`
2. Redeploy production
3. Verify: `GET /api/feature-flags` returns `{"commitmentsV2": false}`, dashboard shows legacy overdue behavior

**State after:** Production is back to pre-flag behavior. Backfilled `commitment_set` rows remain in the DB but are ignored by the legacy code path (`lib/stale.ts` uses null `openCommitments` arg when flag off). No data loss.

---

### 5.2 Level 2 — Delete backfill rows (5 minutes)

**When:** the backfill wrote clearly wrong data (e.g., wrong due dates because of a clock skew, wrong type mappings) and you want to re-run it from scratch. Requires Level 1 to already be in place (flag off).

**How:**
```sql
-- Review first
SELECT COUNT(*) FROM activities WHERE id LIKE 'c-backfill-%';

-- Delete (only after flag is off)
DELETE FROM activities WHERE id LIKE 'c-backfill-%';
```

Re-run Phase 3 to regenerate rows with corrected logic.

**State after:** Commitment rows written by `createCommitment` during the flag-on window (if any made it through before Level 1 kicked in) are NOT affected — only backfill rows are deleted. If flag was only on for minutes, this is effectively a clean slate.

---

### 5.3 Level 3 — Drop columns (10 minutes)

**When:** the schema itself is the problem (e.g., a column type was wrong — unlikely since migration is `TEXT`-only) OR you want to completely reset the feature and re-migrate later.

**How:**
```sql
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_closed_date;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_status;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_due_date;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_detail;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_type;
ALTER TABLE activities DROP COLUMN IF EXISTS fulfills_commitment_id;
DROP INDEX IF EXISTS activities_activity_type_commitment_status_idx;
```

Requires flag off first (Level 1). Columns are nullable so no data is lost from rows that had `activity_type != 'commitment_set'`. Rows where `activity_type = 'commitment_set'` (backfill or live-flag-on creates) are still in the table but will have their commitment fields implicitly NULL; those rows should be deleted before dropping columns if you want a fully clean state (see Level 2).

---

### 5.4 Level 0 — Neon snapshot restore (30 minutes)

**When:** production data is suspected of being corrupted. Should effectively never be triggered given Levels 1–3.

**How:** In Neon dashboard → restore production from the `pre-commitments-v2` snapshot branch created in Phase 1. This is a point-in-time restore — any legitimate writes between the snapshot and now will be lost. Coordinate with Eric before triggering.

---

## 6. Success criteria

We consider the rollout successful when **all** of these are true:

- [ ] 14 consecutive days with flag on in production, no rollbacks
- [ ] Chad uses the close-out prompt at least once per week on average and reports it feels natural (not a surprise or friction)
- [ ] Canary behavior verified at least once in production: Eric or Chad intentionally picks Still Pending on an overdue prospect and confirms the dashboard doesn't lie
- [ ] No 5xx errors attributable to the new API routes during the monitoring window
- [ ] Zero user-data incidents (no prospects accidentally dropped, no timelines missing entries, no commitments stuck in wrong states)

Once all satisfied, schedule the feature flag removal (Appendix B).

---

## Appendix A — SQL validation queries

Paste these into a Neon SQL editor against production to verify state at each gate.

**A.1 — Post-migration: columns exist**
```sql
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'activities'
   AND column_name IN (
     'fulfills_commitment_id', 'commitment_type', 'commitment_detail',
     'commitment_due_date', 'commitment_status', 'commitment_closed_date'
   )
 ORDER BY column_name;
-- Expected: 6 rows.
```

**A.2 — Post-migration: index exists**
```sql
SELECT indexname FROM pg_indexes
 WHERE tablename = 'activities'
   AND indexname LIKE '%commitment_status%';
-- Expected: 1 row (name varies but contains 'commitment_status').
```

**A.3 — Post-backfill: expected row count**
```sql
SELECT COUNT(*) AS backfill_rows
  FROM activities
 WHERE id LIKE 'c-backfill-%';
-- Expected: matches the "will write" number from the dry run.
```

**A.4 — Post-backfill: sanity check a few rows**
```sql
SELECT a.id, a.person_id, a.commitment_type, a.commitment_detail,
       a.commitment_due_date, a.commitment_status,
       p.full_name, p.next_action_date, p.next_action_type
  FROM activities a
  JOIN people p ON p.id = a.person_id
 WHERE a.id LIKE 'c-backfill-%'
 LIMIT 5;
-- Expected: commitment_due_date == p.next_action_date for every row;
-- commitment_status = 'open'; commitment_type matches p.next_action_type.
```

**A.5 — Post-flag-flip: what Chad's dashboard query sees**
```sql
SELECT p.full_name, p.pipeline_stage, a.commitment_due_date, a.commitment_detail
  FROM activities a
  JOIN people p ON p.id = a.person_id
 WHERE a.activity_type = 'commitment_set'
   AND a.commitment_status = 'open'
   AND a.commitment_due_date <= CURRENT_DATE
   AND p.pipeline_stage NOT IN ('nurture', 'dead', 'funded')
 ORDER BY a.commitment_due_date ASC
 LIMIT 20;
-- Expected: the overdue list Chad sees on the dashboard, top 20.
```

---

## Appendix B — Feature flag removal (deferred ≥ 14 days)

Not part of this rollout. Done after 2 weeks of stable flag-on run. Follow `docs/feature-flag-removal-checklist.md` — which inventories every `isCommitmentsV2Enabled()` call site and prescribes the surgical removal sequence.

At the same time, the post-cleanup items in the runbook §8 apply:
- Delete the Neon `pre-commitments-v2` snapshot branch
- Remove `COMMITMENTS_V2` from all Vercel environments
- `chore(commitments-v2): remove feature flag` commit

---

## Appendix C — Quick reference

**Commands you'll run in order:**
```bash
# Phase 1
npx tsx --env-file=.env.local scripts/apply-neon-migrations.ts

# Phase 3
npx tsx --env-file=.env.local scripts/backfill-commitments.ts --dry-run
npx tsx --env-file=.env.local scripts/backfill-commitments.ts

# Phase 4-5 (via Vercel dashboard)
# Set COMMITMENTS_V2=on on Preview, then Production
```

**Files to keep open during rollout:**
- This plan (high-level decisions + rollback)
- `docs/commitments-go-live-runbook.md` (command-level detail)
- Neon SQL console tab (for verification queries)
- Vercel dashboard (for env var changes + deploy triggers)
- A tail of Vercel production logs (for monitoring during flag flip)
