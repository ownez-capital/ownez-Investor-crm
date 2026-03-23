# Handoff: Ralph Loop — Neon Interim Database Provider

## Context

You are working on **OwnEZ CRM** — a custom Next.js CRM for OwnEZ Capital's HNW investor pipeline.
Project is at `c:\Users\erezg\Documents\OwnEZ CRM\` on the `phase1/foundation` branch.

Read `docs/HANDOFF-PROMPT.md` first for full project context, codebase map, and mock data reference.
Read `docs/superpowers/specs/2026-03-23-neon-interim-db-design.md` for the full design spec.

---

## Your One Job

Run the Ralph loop with this exact command:

```
/ralph-loop --completion-promise "NEON_PROVIDER_COMPLETE" --max-iterations 30
Read docs/superpowers/specs/2026-03-23-neon-interim-db-design.md for the full implementation spec.
After completing all tasks: run npm run build (zero TS errors), then run
npx tsx scripts/test-provider.ts (all 33 provider tests pass with DATA_PROVIDER=neon),
then run npx playwright test (all E2E tests pass with DATA_PROVIDER=neon).
When all pass, output: NEON_PROVIDER_COMPLETE
```

---

## Pre-Flight: Branch + Dependencies

Before starting implementation:

1. **Create branch:**
   ```bash
   git checkout -b feature/neon-provider phase1/foundation
   ```

2. **Install dependencies:**
   ```bash
   npm install drizzle-orm @neondatabase/serverless
   npm install -D drizzle-kit
   ```

3. **Create `.env.local`** (for local dev against Neon):
   ```
   DATA_PROVIDER=neon
   DATABASE_URL=<will be set after Neon provisioning>
   SEED_PASSWORD_CHAD=testpass123
   SEED_PASSWORD_KEN=testpass123
   SEED_PASSWORD_ERIC=testpass123
   SEED_PASSWORD_EFRI=testpass123
   ```
   Note: For local dev without a Neon instance, you can test the schema and queries by pointing `DATABASE_URL` at any Postgres instance. The seed passwords above are for dev only.

---

## Task Breakdown

**Task 1 — Drizzle Schema (`lib/providers/neon/schema.ts`)**
- Define all 12 tables exactly as specified in Section 3.3 of the design spec
- All IDs are `text` type (not UUID type)
- All dates are `text` (ISO strings, not Postgres date/timestamp)
- Arrays (roles, collaboratorIds, documentsAttached) are `jsonb`
- Currency fields (initialInvestmentTarget, committedAmount, etc.) are `numeric`
- Column names use `snake_case`, Drizzle maps to `camelCase` via aliases
- Add indexes on all foreign key columns (see spec Section 9, note 5)
- Create `drizzle.config.ts` at project root

**Task 2 — DB Connection (`lib/providers/neon/db.ts`)**
- Use `@neondatabase/serverless` with `neon()` driver
- Read `DATABASE_URL` from `process.env`
- Export a Drizzle instance configured for Neon serverless
- Handle connection pooling for Vercel Functions (stateless, no persistent pool)

**Task 3 — Seed Script (`lib/providers/neon/seed.ts`)**
- Export `async function seedDatabase(db)` — called on first connection
- Idempotent: check if users table has rows before seeding (INSERT ... ON CONFLICT DO NOTHING)
- Seed users from env vars: `SEED_PASSWORD_CHAD`, `SEED_PASSWORD_KEN`, `SEED_PASSWORD_ERIC`, `SEED_PASSWORD_EFRI`
  - User IDs: `u-chad`, `u-ken`, `u-eric`, `u-efri` (preserve existing format)
  - bcrypt hash passwords using `bcryptjs` (already in project dependencies)
  - Roles: chad=rep, ken=marketing, eric=admin, efri=admin
- Seed `pipeline_stage_configs` from `lib/constants.ts` → `PIPELINE_STAGES`
- Seed `activity_type_configs` from `lib/constants.ts` → all 11 activity types (see spec Section 3.3)
- Seed `system_config` single row: fundTarget=10500000, companyName="OwnEZ Capital", defaultRepId="u-chad"
- **Do NOT seed lead_source_configs** — production starts empty
- **Do NOT seed any business data** (people, orgs, activities, etc.)

**Task 4 — Migration Script (`lib/providers/neon/migrate.ts`)**
- Use `drizzle-kit` to generate and run migrations
- Export a function that runs pending migrations on startup
- Migrations should be generated via `npx drizzle-kit generate` and committed to `drizzle/` folder

**Task 5 — Query Files (7 files in `lib/providers/neon/queries/`)**

Each file exports functions that take the Drizzle db instance and implement the corresponding DataService methods. Reference the mock provider (`lib/providers/mock.ts`) for exact behavior — the Neon provider must produce identical results.

- **`people.ts`** — `getPeople`, `getPerson`, `createPerson`, `updatePerson`, `searchPeople`, `getRedFlags`, `getUnassignedProspects`
  - `getPeople`: support all `PeopleFilters` (roles, stages, leadSources, assignedRepId, assignedRepUnassigned, staleOnly, search)
  - `getPerson` / `getPeople`: must return `PersonWithComputed` — join org name, rep name, compute daysSinceLastTouch/isStale/isOverdue using `lib/stale.ts` functions, compute activityCount, join referrer name
  - `searchPeople`: ILIKE on fullName, email, phone
  - `createPerson`: generate UUID, set createdDate to `getTodayCT()`, set defaults (collaboratorIds=[], roles=[])
  - `updatePerson`: merge partial update, auto-set stageChangedDate when pipelineStage changes, auto-set commitmentDate when committedAmount changes

- **`activities.ts`** — `getActivities`, `getRecentActivities`, `createActivity`
  - `getActivities`: filter by personId + optional ActivityFilters (types, dateFrom, dateTo), order by date DESC then time DESC
  - `getRecentActivities`: cross-person, filter by repId/date, join personName, limit
  - `createActivity`: generate UUID

- **`organizations.ts`** — `getOrganizations`, `searchOrganizations`, `createOrganization`
  - `searchOrganizations`: ILIKE on name

- **`funding.ts`** — `getFundingEntities`, `createFundingEntity`, `getFundedInvestments`, `createFundedInvestment`

- **`leadership.ts`** — `getLeadershipStats`, `getDashboardStats`, `getFunnelData`, `getSourceROI`, `getDrilldownProspects`, `getDrilldownActivities`, `getMeetingsCount`, `getLeadSourceCounts`
  - These are all aggregate queries. Study the mock provider's implementations carefully — replicate the exact same counting/filtering logic.
  - `getLeadershipStats.aumRaised` = sum of all funded investments
  - `getDashboardStats` = { activePipelineCount, pipelineValue, committedValue, fundedYTD }
  - `getFunnelData` = group by pipelineStage, count + sum committedAmount, ordered by stage order
  - `getSourceROI` = group by leadSource, count prospects, count funded, sum funded amount, compute conversion %

- **`admin.ts`** — `getUsers`, `getUserByUsername`, `updateUserPermissions`, `deactivateUser`, lead source CRUD, pipeline stage config CRUD, activity type config CRUD, system config CRUD
  - `deactivateUser`: set isActive=false, optionally reassign all their prospects to another rep
  - Lead source deactivation (`isActive: false`) — the API route must check admin role, but the query function itself just does the update. Auth check is in the route handler.
  - `reorderLeadSources`: receives array of keys in new order, updates `order` column for each
  - `createLeadSource`: auto-generate key from label (lowercase, spaces→underscores, strip special chars)
  - `createActivityType`: same key generation pattern

- **`relationships.ts`** — `getReferrerForProspect`, `getRelatedContacts`, `addReferrer`, `addRelatedContact`, `removeRelatedContact`, `getReferrals`, `getTopReferrers`
  - `getTopReferrers`: join referrer_links → people → funded_investments, aggregate counts and values

**Task 6 — Provider Index (`lib/providers/neon/index.ts`)**
- Export `createNeonDataService(): DataService`
- Compose all query files into a single DataService object
- Run migrations + seed on first call (lazy init, cached via globalThis like mock)
- Handle `null` → `undefined` coercion for `User.permissions`
- Do NOT implement `resetData()` — leave it undefined

**Task 7 — Wire Into `lib/data.ts`**
- Add `case "neon"` to the provider switch (see spec Section 5.1)

**Task 8 — Update `.env.example`**
- Document all new env vars: `DATABASE_URL`, `DATA_PROVIDER`, `SEED_PASSWORD_*`

**Task 9 — Lead Source Permission Change**
- Find the API route for `updateLeadSource` (likely `app/api/admin/lead-sources/[key]/route.ts`)
- Add auth check: if the update includes `isActive: false`, verify the requesting user has admin role. Return 403 otherwise.
- Find or create a "Manage Lead Sources" entry point accessible from Settings (all roles) — see spec Section 9, note 6
- The gear icon on Lead Source dropdowns can be deferred if complex — at minimum, the Settings page must have a Lead Sources section visible to all roles
- Hide/disable the deactivate toggle for non-admin users in the UI

**Task 10 — Provider Tests**
- The existing `scripts/test-provider.ts` tests all DataService methods
- All 33 tests must pass with `DATA_PROVIDER=neon` pointing at a real Neon database
- If any test assumes mock-specific behavior (like resetData), skip it for neon or add a conditional
- Run: `DATA_PROVIDER=neon DATABASE_URL=<url> npx tsx scripts/test-provider.ts`

**Task 11 — E2E Tests**
- All existing E2E tests must pass with `DATA_PROVIDER=neon`
- The E2E tests use the app normally — if the provider is correct, they should pass without changes
- If any E2E test depends on mock data being pre-loaded, it may need a seed step or conditional setup
- Run: `DATA_PROVIDER=neon npx playwright test`

**Task 12 — Build Check**
- `npm run build` — zero TypeScript errors
- Verify no circular imports between neon provider and lib/

---

## Critical Rules

1. **Schema must match `lib/types.ts` exactly.** Do not add fields, rename fields, or change types. If the spec says `text`, use `text`. If the spec says `jsonb`, use `jsonb`.

2. **Behavior must match mock provider.** The Neon provider is a drop-in replacement. Every DataService method must return the same shape and semantics as the mock. When in doubt, read `lib/providers/mock.ts`.

3. **Computed fields are NOT stored.** `daysSinceLastTouch`, `isStale`, `isOverdue` are computed at read time using `lib/stale.ts`. Do not add these as database columns.

4. **Use existing utilities.** `getTodayCT()` from `lib/format.ts`, `computeDaysSinceLastTouch/isStale/isOverdue` from `lib/stale.ts`, `PIPELINE_STAGES/LEAD_SOURCES/etc` from `lib/constants.ts`. Do not duplicate this logic.

5. **Passwords are in env vars, not hardcoded.** The seed script reads `SEED_PASSWORD_*` env vars. Never hardcode passwords.

---

## Key Files Reference

| File | Role |
|---|---|
| `lib/types.ts` | All TypeScript types + DataService interface (source of truth) |
| `lib/providers/mock.ts` | Mock provider — behavior reference for every method |
| `lib/data.ts` | Provider loader — add `case "neon"` |
| `lib/constants.ts` | PIPELINE_STAGES, LEAD_SOURCES, ACTIVITY_TYPES, etc. |
| `lib/stale.ts` | computeDaysSinceLastTouch, computeIsStale, computeIsOverdue |
| `lib/format.ts` | getTodayCT, formatCurrency |
| `scripts/test-provider.ts` | Provider test suite (33 tests) |
| `docs/superpowers/specs/2026-03-23-neon-interim-db-design.md` | Full design spec |

## Design Tokens (match existing screens)

- Background: `bg-background` (white)
- Cards: `rounded-lg border bg-card`
- Navy text: `text-navy` / `#0b2049`
- Gold accent: `text-gold` / `#e8ba30`
- Muted labels: `text-muted-foreground`

## Completion Check

After all 12 tasks:
1. `npm run build` — zero TypeScript errors
2. `DATA_PROVIDER=neon npx tsx scripts/test-provider.ts` — all provider tests pass
3. `DATA_PROVIDER=neon npx playwright test` — all E2E tests pass
4. Output: `NEON_PROVIDER_COMPLETE`
