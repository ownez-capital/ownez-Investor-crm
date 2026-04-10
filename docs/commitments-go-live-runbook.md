# Commitments v2 — Go-Live Runbook

**Audience:** Eric (OwnEZ founder, careful operator, not a database expert)
**Feature:** `COMMITMENTS_V2` — auditable Next Action lifecycle + Drop Lead
**Related docs:**
- [DESIGN-SPEC.md §5.9](../DESIGN-SPEC.md) — the lifecycle model
- [docs/commitments-manual-test-plan.md](commitments-manual-test-plan.md) — the manual test plan referenced below
- [docs/zoho-commitments-integration.md](zoho-commitments-integration.md) — data model context
- [docs/feature-flag-removal-checklist.md](feature-flag-removal-checklist.md) — cleanup after 2 weeks

---

## How to use this runbook

Treat this like a pilot's checklist. Every step has:

- An **exact command** to run
- An **expected output** to verify before moving on
- A **stop condition** — if the output doesn't match, do not proceed. Stop and investigate.

If anything looks off at any step, the rollback path in Section 7 is always available. The feature is built so that stopping at any checkpoint is safe.

**Golden rule:** the feature flag `COMMITMENTS_V2` stays OFF in production until Step 5. Everything before that is additive and invisible to users.

---

## 0. Pre-flight checks

Run these before touching anything. Should take under 5 minutes.

### 0.1 Confirm you're on the right branch

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
git status
git log --oneline -5
```

**Expected:** working tree clean, on `phase1/commitments-lifecycle` (or the branch that will be merged to `master` for this release).

**Stop if:** there are uncommitted changes, or you're on the wrong branch.

### 0.2 Confirm the test suite is green

```bash
npx tsc --noEmit
npx vitest run
npx tsx --env-file=.env.local scripts/test-provider.ts
```

**Expected:**
- `tsc` exits with no output
- Vitest shows all tests passing (should be the full unit suite, no failures)
- `test-provider.ts` prints a green summary with 0 failures

**Stop if:** anything is red. Do not go live with broken tests.

### 0.3 Confirm production has `COMMITMENTS_V2` OFF

Open the Vercel dashboard → Project → Settings → Environment Variables → Production.

**Expected:** `COMMITMENTS_V2` is either **absent** or set to anything other than `on` (the flag defaults to OFF). If it's not listed at all, that's correct — the feature is off.

**Stop if:** it's already set to `on`. Someone else already flipped it. Stop and figure out who.

### 0.4 Confirm you have a preview deploy URL to test against

You'll need this later in Step 4. Pick the most recent Vercel preview deploy URL on the `phase1/commitments-lifecycle` branch, or note that you'll trigger a fresh one in Step 4.

### 0.5 Snapshot the production Neon database

Before any schema change, take a Neon branch snapshot for instant rollback.

1. Open Neon console → project `solitary-king-06499295`
2. Branches → Create branch from `main` (name it e.g. `pre-commitments-v2-YYYY-MM-DD`)
3. Confirm the branch is created and note its ID

**Expected:** new branch visible in Neon console. If anything goes catastrophically wrong in Step 1, you can restore from this branch.

**Stop if:** the branch creation fails. Contact Neon support before continuing.

---

## 1. Step 1 — Schema migration

Adds 6 nullable columns + 1 index to the `activities` table. All additive. Zero downtime. Running with the flag OFF means nothing reads these columns yet.

### 1.1 Generate the migration file (one-time, already committed to branch)

If the `drizzle/` directory in the branch already contains the migration SQL for the commitment columns, **skip to 1.2**. Otherwise generate it locally first:

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
npx drizzle-kit generate
```

**Expected:** a new SQL file appears under `drizzle/` named something like `NNNN_xxx_xxx.sql`, containing `ALTER TABLE activities ADD COLUMN ...` for the 6 new columns and a `CREATE INDEX` statement.

**Stop if:** the generated SQL contains any `DROP`, `RENAME`, or a destructive change to existing columns. Something upstream is wrong.

### 1.2 Inspect the migration SQL

Open the generated file in your editor. Confirm it only contains:

- `ALTER TABLE "activities" ADD COLUMN "fulfills_commitment_id" text;`
- `ALTER TABLE "activities" ADD COLUMN "commitment_type" text;`
- `ALTER TABLE "activities" ADD COLUMN "commitment_detail" text;`
- `ALTER TABLE "activities" ADD COLUMN "commitment_due_date" text;`
- `ALTER TABLE "activities" ADD COLUMN "commitment_status" text;`
- `ALTER TABLE "activities" ADD COLUMN "commitment_closed_date" text;`
- `CREATE INDEX ... ON "activities" ("activity_type", "commitment_status");`

**Stop if:** the migration does anything else. Nothing else should be in this migration.

### 1.3 Apply the migration to production Neon

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
npx drizzle-kit push
```

(If the project has `db:migrate` or similar in package.json scripts, use that instead — check `scripts` in `package.json`.)

**Expected:** output similar to:
```
[✓] Changes applied
```
No errors.

**Stop if:** any error. Do not proceed. See rollback in 1.5.

### 1.4 Verify the columns exist

Use the Neon SQL editor (console → SQL Editor) or `psql`:

```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'activities'
   AND column_name LIKE 'commitment%' OR column_name = 'fulfills_commitment_id'
 ORDER BY column_name;
```

**Expected output:**
```
 column_name             | data_type | is_nullable
-------------------------+-----------+-------------
 commitment_closed_date  | text      | YES
 commitment_detail       | text      | YES
 commitment_due_date     | text      | YES
 commitment_status       | text      | YES
 commitment_type         | text      | YES
 fulfills_commitment_id  | text      | YES
```

All 6 columns present, all `YES` (nullable).

**Stop if:** any column is missing or any `is_nullable` is `NO`. Roll back via 1.5.

Verify the index:

```sql
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'activities'
   AND indexdef ILIKE '%commitment_status%';
```

**Expected:** one row showing an index on `(activity_type, commitment_status)`.

### 1.5 Rollback (only if something is wrong)

If verification failed, drop the new columns. They're unused while the flag is off, so dropping is safe.

```sql
DROP INDEX IF EXISTS activities_activity_type_commitment_status_idx;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_closed_date;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_status;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_due_date;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_detail;
ALTER TABLE activities DROP COLUMN IF EXISTS commitment_type;
ALTER TABLE activities DROP COLUMN IF EXISTS fulfills_commitment_id;
```

(The actual index name may differ based on what drizzle-kit generated — check 1.4's index query for the real name.)

If even that is too scary, restore from the Neon snapshot branch you took in 0.5:
1. Neon console → Branches → select `pre-commitments-v2-YYYY-MM-DD`
2. Click "Restore" → follow the prompts

---

## 2. Step 2 — Deploy with flag OFF

Deploy the new code to production with `COMMITMENTS_V2` still off. Production behavior should not change at all. This validates that the code is safe even before the flag flips.

### 2.1 Deploy

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
vercel --prod
```

**Expected:** build succeeds, deploy URL printed, no errors. Typical output ends with:
```
✅  Production: https://ownez-crm.vercel.app [copied to clipboard]
```

**Stop if:** the build fails. Check the Vercel build logs.

### 2.2 Smoke-test production (flag still OFF)

Open https://ownez-crm.vercel.app in a browser and walk through this quick checklist:

- [ ] Log in as Chad — success
- [ ] Dashboard loads, shows Action Queue and Needs Attention panel
- [ ] Click a prospect in the overdue list — person detail loads
- [ ] Open Quick Log, type a short note, submit — activity saved, Next Action prompt appears (the **old** one — no close-out prompt, no Drop Lead link)
- [ ] Back to dashboard, verify the idle counter reset
- [ ] No red console errors in the browser DevTools

**Expected:** identical behavior to before the deploy. Nothing new visible. No errors.

**Stop if:** anything behaves differently. Something leaked past the feature flag. Use the rollback in Section 7 (just revert the Vercel deploy — the schema change is safe to leave).

---

## 3. Step 3 — Backfill script against production

Creates synthetic `commitment_set` rows for every active prospect that has a `next_action_date`. Idempotent — safe to re-run.

### 3.1 Count what's about to change

Run this verification query first in the Neon SQL editor:

```sql
SELECT COUNT(*) AS candidates
  FROM people
 WHERE next_action_date IS NOT NULL
   AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('funded', 'nurture', 'dead'));
```

**Note the number.** This is the upper bound on how many rows the backfill will write. Also run:

```sql
SELECT COUNT(*) AS existing_open
  FROM activities
 WHERE activity_type = 'commitment_set'
   AND commitment_status = 'open';
```

**Expected:** `existing_open` should be `0` on the first run (nothing has written commitment rows yet).

### 3.2 Dry run the backfill

**Always dry run first.** Requires `DATABASE_URL` in `.env.local` pointing at production Neon.

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
npx tsx --env-file=.env.local scripts/backfill-commitments.ts --dry-run
```

**Expected output (roughly):**
```
Backfill commitments — DRY RUN
Today (CT): 2026-04-10

Scanning candidates...
  Candidates scanned: <N>
  Already backfilled (skipped): 0
  New commitments to write: <N>

Would write <N> commitment set rows...

─── Summary (DRY RUN) ───
  Candidates scanned:       <N>
  Already backfilled:       0
  Commitments would be written: <N>
  Errors:                   0

Dry run complete. Re-run without --dry-run to actually write.
```

**Verify:**
- `Candidates scanned` matches the number from 3.1
- `Already backfilled` is 0 (first run)
- `Errors` is 0

**Stop if:**
- Errors is nonzero — read the error details, fix, retry
- Candidates count looks suspicious (e.g. wildly different from 3.1)

### 3.3 Live run the backfill

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
npx tsx --env-file=.env.local scripts/backfill-commitments.ts
```

**Expected output:** same structure as dry run, but says `LIVE`. Final line should read `Backfill complete.` and errors should be 0.

**Stop if:** any errors. Do NOT proceed to Step 4 with a partial backfill. Contact the dev team.

### 3.4 Verify the writes

Back in Neon SQL editor:

```sql
SELECT COUNT(*) AS open_commitments
  FROM activities
 WHERE activity_type = 'commitment_set'
   AND commitment_status = 'open';
```

**Expected:** the count equals the `Commitments written` number from 3.3.

Sample a few rows to eyeball the data:

```sql
SELECT id, person_id, commitment_type, commitment_detail,
       commitment_due_date, commitment_status, date
  FROM activities
 WHERE activity_type = 'commitment_set'
 ORDER BY date DESC
 LIMIT 10;
```

**Expected:** rows with `id` prefixed `c-backfill-`, `commitment_status = 'open'`, `commitment_due_date` matching the corresponding person's old `next_action_date`, `date` equal to today.

### 3.5 Re-run idempotency check (optional but recommended)

```bash
npx tsx --env-file=.env.local scripts/backfill-commitments.ts --dry-run
```

**Expected:** `Already backfilled (skipped)` equals the number of rows written in 3.3, and `New commitments to write` is 0. This proves the script is idempotent and safe to re-run if needed.

---

## 4. Step 4 — Flip flag ON in Vercel preview

Exercise the feature end-to-end in a preview environment before touching production.

### 4.1 Set `COMMITMENTS_V2=on` for preview only

Vercel dashboard → Project → Settings → Environment Variables → Add:

- Key: `COMMITMENTS_V2`
- Value: `on`
- Environment: **Preview** only (uncheck Production and Development)
- Save

**Expected:** env var listed under Preview in the env list.

**Stop if:** it accidentally got set for Production. Remove it immediately.

### 4.2 Trigger a fresh preview deploy

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
git push  # pushes current branch; Vercel auto-deploys
```

Or in the Vercel dashboard → Deployments → Redeploy the latest preview with "Use existing Build Cache" unchecked.

**Expected:** new preview deploy completes successfully. Note the preview URL (e.g. `https://ownez-crm-abc123.vercel.app`).

### 4.3 Walk the canary scenarios on the preview URL

Open the preview URL in an incognito/private window and follow these scenarios from [docs/commitments-manual-test-plan.md](commitments-manual-test-plan.md):

**Scenario 2B (honest red) — THIS IS THE CRITICAL ONE:**
1. Log in as Chad
2. Find a prospect with an overdue Next Action on the dashboard (Robert Calloway if seeded)
3. Open Quick Log, log a short unrelated note
4. At the close-out prompt, pick **P — Still pending**
5. Confirm through the Next Action prompt
6. Navigate back to the dashboard
7. **Expected: Robert is STILL on the overdue list.** This is the honest-red behavior. If he's gone, the feature is broken. Stop.

**Scenario 4A (dashboard honesty matrix):**
1. Pick three overdue prospects
2. For prospect A: log activity → pick **F — Fulfilled** → confirm Next Action. Verify A clears from overdue.
3. For prospect B: log activity → pick **P — Still pending** → confirm. Verify B stays overdue.
4. For prospect C: log activity → pick **R — Replace** → set a new future date → confirm. Verify C clears from overdue.

**Expected:** all three behave as described. If any behaves differently, stop.

### 4.4 Optional: walk the rest of the manual test plan

Eric's judgment call — if 2B and 4A pass, and the Quick Log flow feels right (no crashes, no weird UI), the feature is ready. Walking the full ~30 scenarios is more thorough but not strictly required.

**Stop if:** 2B or 4A fails. Do NOT proceed to production. Flip `COMMITMENTS_V2` off in preview env and contact the dev team.

---

## 5. Step 5 — Flip flag ON in production

Only after Step 4 is green. This is the only user-visible change; everything before this was invisible.

### 5.1 Set `COMMITMENTS_V2=on` for production

Vercel dashboard → Project → Settings → Environment Variables → Add:

- Key: `COMMITMENTS_V2`
- Value: `on`
- Environment: **Production** (and keep Preview if you set it there earlier)
- Save

**Expected:** env var now listed under Production.

### 5.2 Redeploy production

```bash
cd "C:/Users/erezg/Documents/OwnEZ CRM"
vercel --prod
```

Or in Vercel dashboard → Deployments → Redeploy the latest production deploy with fresh env vars.

**Expected:** build + deploy succeed.

### 5.3 Production smoke test

Open https://ownez-crm.vercel.app in an incognito window and walk through this short list:

- [ ] Log in as Chad — success
- [ ] Dashboard loads, Action Queue visible, Needs Attention panel visible
- [ ] Find a prospect that had an overdue Next Action before — verify they still show overdue (the backfill created an open commitment for them)
- [ ] Open Quick Log on that prospect, log a short note
- [ ] **Close-out prompt appears** with F/P/R options (this is the new UI)
- [ ] Pick **F — Fulfilled**, confirm a Next Action
- [ ] Dashboard clears that prospect from overdue
- [ ] No red errors in DevTools console
- [ ] Check a different prospect: open Quick Log, log a note, pick **P — Still pending** → dashboard still shows them overdue
- [ ] Try Drop Lead ▸ link in the Next Action prompt on a junk prospect in a dev-safe state — the drop panel renders

**Stop if:** any step fails. Use the rollback in Section 7 immediately.

### 5.4 First 24 hours — what to monitor

For the first day after the flip, watch for:

1. **Chad's feedback.** Message Chad directly: "Notice anything weird in the Quick Log flow today?" He's the canary user.
2. **Vercel function logs.** Vercel dashboard → Deployments → current production → Logs. Look for any 5xx responses from the new routes:
   - `/api/persons/[id]/commitments`
   - `/api/persons/[id]/commitments/[commitmentId]/close-out`
   - `/api/persons/[id]/drop-lead`
3. **Dashboard overdue count.** Compare it to the morning count from before the flip. A modest increase is OK (the honest-red behavior is surfacing commitments that the old system was silently clearing). A massive jump (2x+) could indicate a bug. A drop to zero is a red flag.
4. **Neon slow-query log.** Neon console → Monitoring. Look for query spikes on the `activities` table.

If anything looks wrong, do not hesitate to roll back (Section 7). Rollback is designed to be fast and safe.

---

## 6. Step 6 — Communicate

Once the flip is stable (end of day 1):

1. Send Chad a link to [docs/user-quick-log-guide.md](user-quick-log-guide.md) — the Chad-facing user guide
2. Post a brief note in the team channel: "Next Action lifecycle is live. New F/P/R prompt when closing out commitments. See user-quick-log-guide.md for the 3-minute overview."
3. Update any internal changelog / release notes

---

## 7. Rollback plan

At any point between Step 2 and Step 5, rollback is **flip the flag back off**.

### 7.1 Immediate rollback (flag flip)

Vercel dashboard → Settings → Environment Variables → Production:

- Edit `COMMITMENTS_V2` → delete it (or change value to `off`)
- Save

Redeploy:

```bash
vercel --prod
```

**Result:** production immediately reverts to old behavior. The backfilled `commitment_set` rows in the database are additive and invisible to the old code — they don't break anything while the flag is off. They just sit there until either the flag is flipped back on or they're explicitly cleaned up.

**How long is the rollback data safe?**

Indefinitely. The backfilled rows have no foreign key references from the old code and are never read when the flag is off. You can leave them in place forever if you want. The only time they become active again is if you re-flip the flag.

### 7.2 Deeper rollback (remove the columns)

Only needed if something at the schema level is actually wrong. Use the SQL from 1.5.

### 7.3 Catastrophic rollback (restore Neon branch)

If everything is on fire: Neon console → Branches → `pre-commitments-v2-YYYY-MM-DD` (created in 0.5) → Restore. This is a minute or two of read-only downtime while Neon swaps the branches, but it gets you back to a perfect pre-deploy state.

---

## 8. Cleanup (2 weeks after go-live)

Once the feature has been live and stable for ~2 weeks:

1. Open [docs/feature-flag-removal-checklist.md](feature-flag-removal-checklist.md)
2. Walk the inventory — every `isCommitmentsV2Enabled()` call site gets removed, the flag's two branches collapse to the new behavior
3. The Neon snapshot branch from 0.5 can be deleted
4. Delete the throwaway `activity-flow-proposal.html` artifact at the repo root
5. Final commit: `chore(commitments-v2): remove feature flag`

This turns the feature from "gated" to "permanent" and removes the old code path from the codebase.

---

## Appendix A — useful Neon queries

### How many open commitments right now?
```sql
SELECT COUNT(*) FROM activities
 WHERE activity_type = 'commitment_set' AND commitment_status = 'open';
```

### How many open and past-due?
```sql
SELECT COUNT(*) FROM activities
 WHERE activity_type = 'commitment_set'
   AND commitment_status = 'open'
   AND commitment_due_date <= CURRENT_DATE;
```

### Open commitments grouped by prospect
```sql
SELECT p.full_name, COUNT(*) AS open_count
  FROM activities a
  JOIN people p ON p.id = a.person_id
 WHERE a.activity_type = 'commitment_set'
   AND a.commitment_status = 'open'
 GROUP BY p.full_name
 ORDER BY open_count DESC, p.full_name;
```

### Backfill rows only (in case you need to un-backfill)
```sql
-- Read-only preview first:
SELECT id, person_id, commitment_due_date
  FROM activities
 WHERE id LIKE 'c-backfill-%'
 LIMIT 10;

-- If you really need to delete them (only while flag is off):
-- DELETE FROM activities WHERE id LIKE 'c-backfill-%';
```

---

## Appendix B — the canary invariant (read this before you fly)

> When Chad logs an activity while a prior Next Action is still open and overdue, he must explicitly resolve the old commitment — Fulfilled, Still Pending, or Replace. If he picks "Still Pending," the prospect **stays overdue on the dashboard** even though a fresh activity was just logged.

This is the "honest red" behavior and it is the entire reason this feature exists. Scenarios 2B and 4A in the manual test plan exist specifically to catch regressions of this invariant. If 2B fails on the preview URL during Step 4.3, **do not flip the flag in production**. The feature is broken.

That's the whole thing. Fly safe.
