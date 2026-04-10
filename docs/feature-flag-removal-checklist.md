# Feature Flag Removal Checklist — COMMITMENTS_V2

**Flag:** `COMMITMENTS_V2` (env var)
**Owner:** Eric
**Added:** 2026-04-10 on branch `phase1/commitments-lifecycle`
**Intended removal:** After 2 weeks of stable production run with the flag on

## Why this file exists

When we added the commitments lifecycle feature, we gated every new behavior behind `COMMITMENTS_V2` so production could be flipped on and off without redeploying. But feature flags are debt. This checklist is the inventory of **every place the flag is read** so we can remove them surgically in one PR with zero residue.

## Removal rules

When the flag is stable and we're ready to remove it:

1. **Delete the entire old code path** at every call site below. Do not leave it behind commented out, behind a `// legacy` marker, or behind a different flag.
2. **Delete `lib/feature-flags.ts`** if it has no other flags in it.
3. **Delete this file** (`docs/feature-flag-removal-checklist.md`) in the same commit.
4. **Delete `activity-flow-proposal.html`** at the repo root — it was a throwaway design artifact kept around for reference while the flag was live.
5. **Update `DESIGN-SPEC.md`** to remove any remaining references to the flag (currently none — the spec was written assuming the feature ships).
6. **Remove `COMMITMENTS_V2` from all environment files**: `.env.local`, `.env.example`, Vercel production/preview/development env settings.

## Call sites

Keep this list exhaustive. Every new `isCommitmentsV2Enabled()` call must be added here in the same commit that adds the call.

| # | File | Purpose | Status |
|---|---|---|---|
| 1 | `lib/providers/mock.ts` (`enrichPerson`) | Picks v2 vs legacy stale/overdue source (open commitments vs `nextActionDate`) | Added in checkpoint 2c |
| 2 | `lib/providers/neon/queries/people.ts` (`enrichPerson`) | Same as #1 for Neon provider getPeople/getPerson path | Added in checkpoint 2c |
| 3 | `lib/providers/neon/queries/relationships.ts` (`enrichPerson`) | Same as #1 for referrals/related contacts path | Added in checkpoint 2c |
| 4 | `lib/providers/neon/queries/leadership.ts` (`enrichPerson`) | Same as #1 for leadership dashboard/drilldown/red-flags path | Added in checkpoint 2c |

## Verification before removal

Before the removal PR lands, confirm:

- [ ] No file in `app/`, `components/`, `lib/`, `scripts/`, or `e2e/` contains the string `COMMITMENTS_V2` except this file
- [ ] No file imports `isCommitmentsV2Enabled` from `lib/feature-flags.ts`
- [ ] All tests still pass with the feature path as the only path
- [ ] Typecheck + lint clean
- [ ] Production deploy has had `COMMITMENTS_V2=on` for at least 14 days with no rollback
