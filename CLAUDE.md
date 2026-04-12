# CLAUDE.md — OwnEZ HNW Investor CRM

## Project Overview
Custom Next.js CRM frontend for OwnEZ Capital's HNW investor pipeline. Uses Neon Postgres as interim database (Zoho CRM integration planned). See `DESIGN-SPEC.md` for the complete specification.

## Tech Stack
- **Framework:** Next.js (App Router) on Vercel
- **Styling:** Tailwind CSS + shadcn/ui components
- **Data Layer:** Abstracted provider pattern (mock for dev, Neon Postgres for production, Zoho API future)
- **ORM:** Drizzle ORM + @neondatabase/serverless
- **Auth:** JWT login with bcrypt passwords

## Design Language
- **Navy** (`#0b2049`) — sidebar/nav, headers
- **Gold** (`#e8ba30`) — sole accent color, CTAs, active states
- **White/light gray** — workspace background
- **Red** (`#ef4444`) — stale/overdue alerts only
- **Green** — healthy/funded indicators only
- Jony Ive simplicity. If Chad can't tell what to do next in 2 seconds, the design has failed.
- Pill-shaped buttons, generous whitespace, no borders where spacing works alone.

## Key Rules
- Always read `DESIGN-SPEC.md` before making architecture decisions
- The Data Service Layer (`lib/data.ts`) is the single abstraction point — UI never calls providers directly
- Production uses `DATA_PROVIDER=neon` (Neon Postgres). Mock provider available for dev/testing.
- Mobile-first for Dashboard and Quick Log views
- Every reusable entity (People, Organizations, Funding Entities) uses autocomplete-or-create pattern
- All dates use Central Time (CT) — use `getTodayCT()` from `lib/format.ts` (implemented with `Intl.DateTimeFormat('en-CA', { timeZone })`; never revert to the older `new Date(now.toLocaleString())` pattern which double-shifts the date near UTC-midnight boundaries).
- Committed Amount = verbal target; Funded Amount = rollup from Funded Investment records only

## Provider + Testing Guardrails
*(Lessons from the commitments v2 production rollout, 2026-04-12.)*

- **Mock provider tolerates `undefined` SQL params; Neon provider does NOT.** The `@neondatabase/serverless` driver throws when a SQL tagged-template parameter is `undefined` (unlike `null` which serializes fine). When writing or editing any Neon `INSERT` / `UPDATE` in `lib/providers/neon/queries/*`, coerce optional fields with `?? null` at the SQL boundary. See `lib/providers/neon/queries/activities.ts::createActivity` for the canonical pattern.
- **73/73 unit tests green against mock ≠ safe in production.** Every feature touching Neon writes should be exercised against real Neon at least once before production — not just against the mock provider. The test-provider script (`npx tsx --env-file=.env.local scripts/test-provider.ts` with `DATA_PROVIDER=neon`) is the fastest smoke test; run it as a pre-flight step for any data-layer PR.
- **`scripts/test-provider.ts` seeding is guarded for idempotency** (commit `200647bf`). It now checks existing rows before inserting a `velocis_network` lead source, a Calloway Family Office org, a Robert Calloway prospect, and a test activity. Safe to re-run against any environment.
- **Client-side `fetch` calls don't all check `res.ok`.** ~30 call sites in `components/` and `app/`. When adding a new write-flow (`POST`, `PATCH`, `DELETE`), explicitly check `if (!res.ok)` and surface the error to the user — otherwise the UI will advance silently on 500s and the user won't know their action failed. `components/person/quick-log.tsx::handleSubmit` has the canonical pattern (alert + early return).

## Production Deployment
- **Production branch is `phase1/foundation`** (both on GitHub and in Vercel's "Environments → Production" Branch Tracking setting). This is also the GitHub default branch. There is no `master` branch.
- **Production URL:** https://ownez-crm.vercel.app (auto-aliased on every push to `phase1/foundation`).
- **Vercel project:** `erezgewgl3s-projects/ownez-crm`. Linked via `.vercel/project.json`. CLI commands need `--scope=erezgewgl3s-projects` or will hit a "deployment belongs to a different team" error.
- **GitHub repo:** `github.com/ownez-capital/ownez-Investor-crm` (note capital `I`). Pushes to the lowercase `ownez-investor-crm` URL still work via redirect but emit a "repository moved" notice; cosmetic, not an error.
- **Ops env file:** `.env.prod.local` holds the production Neon `DATABASE_URL`. Gitignored via `.env*.local` pattern. Scripts that need production access use `--env-file=.env.prod.local`.
- **Feature flags:** `COMMITMENTS_V2=on` in Vercel Production env (flipped on 2026-04-12). Removal deferred to ~2026-04-27 per `docs/feature-flag-removal-checklist.md`. For any new feature flag, use `lib/feature-flags.ts` as the single read site and track every call site in the removal checklist in the same commit.
- **Rollback insurance:** `pre-commitments-v2` Neon snapshot exists. Can be restored via Neon dashboard → Backup & Restore. Take a named snapshot before any non-trivial schema migration.

## Ops Scripts (production-safe patterns)
- `scripts/apply-neon-migrations.ts` — idempotent schema migration applier. Use as the canonical way to apply schema changes to production Neon (NOT drizzle-kit).
- `scripts/backfill-commitments.ts` — one-shot data backfill with `--dry-run` mode. Pattern for future backfills: dry-run first, review candidate count vs expectation, then live run, then verify via SQL.
- `scripts/check-prod-data.ts` — read-only production data inspector. Reports counts, drift, recent activity, commitment status distribution.
- `scripts/cleanup-test-data.ts` — surgical deletion of specific test artifacts. Dry-run by default, `--execute` to commit. Pre/post-state sanity gates. Copy + modify target filters for future cleanups.

## Local Development
- `npm run dev` to start Next.js dev server
- Set `DATA_PROVIDER=neon` in `.env.local` for real database, or `mock` for in-memory dev data
- `npx tsx --env-file=.env.local scripts/test-provider.ts` — run 33 provider tests
- `npx tsx --env-file=.env.local scripts/seed-demo-data.ts` — seed demo data for presentations
- `npx tsx --env-file=.env.local scripts/clean-neon-data.ts` — wipe business data, keep config
