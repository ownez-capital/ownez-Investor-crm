# Neon Interim Database Provider — Design Spec

**Date:** 2026-03-23
**Author:** Eric Gewirtzman + Claude
**Status:** Draft — pending review
**Branch:** `feature/neon-provider` (off `phase1/foundation`)

---

## 1. Purpose

Replace in-memory mock data with a persistent Neon Postgres database so the team can work with real data while the Zoho CRM integration is built separately. The mock provider remains available for development and testing.

### 1.1 Constraints

- **No schema drift.** The database schema mirrors `lib/types.ts` field-for-field. No extra columns, no renamed fields, no Postgres-specific optimizations.
- **No UI changes.** Every screen, component, and route stays exactly as-is, except the Lead Source management access point (see Section 6).
- **No new features.** This is a storage backend swap.
- **Mock provider stays.** `DATA_PROVIDER=mock` continues to work for dev/testing.
- **Auth system stays.** Same JWT login, same roles, same permissions.
- **`DATA_PROVIDER=neon` is the default** until Zoho integration is complete. This is not a user-toggled setting.

### 1.2 Key Decision Context

- Zoho CRM is **not currently used** for prospect/investor tracking — all data will be new.
- Zoho will be completely idle during the interim period — no dual source of truth risk.
- Only changes allowed to the interim system: technical usability fixes for Chad.
- Migration from interim DB → Zoho will be scripted when the Zoho provider is ready.

---

## 2. Architecture

```
DATA_PROVIDER=mock  →  Mock arrays in memory (demo/dev)
DATA_PROVIDER=neon  →  Neon Postgres via Drizzle ORM (production interim)
DATA_PROVIDER=zoho  →  Zoho CRM REST API (future)
```

### 2.1 New Dependencies

| Package | Purpose |
|---------|---------|
| `drizzle-orm` | TypeScript-native ORM, schema-as-code |
| `drizzle-kit` | Migration generation and execution (dev dependency) |
| `@neondatabase/serverless` | Neon's serverless Postgres driver for Vercel Functions |

### 2.2 New Files

```
lib/providers/neon/
├── schema.ts              ← Drizzle table definitions (mirrors types.ts)
├── db.ts                  ← Connection pool / client setup
├── index.ts               ← createNeonDataService() — implements DataService
├── queries/
│   ├── people.ts          ← getPeople, getPerson, createPerson, updatePerson, searchPeople, getRedFlags, getUnassignedProspects
│   ├── activities.ts      ← getActivities, getRecentActivities, createActivity
│   ├── organizations.ts   ← getOrganizations, searchOrganizations, createOrganization
│   ├── funding.ts         ← getFundingEntities, createFundingEntity, getFundedInvestments, createFundedInvestment
│   ├── leadership.ts      ← getLeadershipStats, getDashboardStats, getFunnelData, getSourceROI, getDrilldown*, getMeetingsCount, getLeadSourceCounts
│   ├── admin.ts           ← user management, system config, pipeline/activity/lead source configs
│   └── relationships.ts   ← referrer/related contact CRUD, getTopReferrers
├── seed.ts                ← Seed script (users, config tables)
└── migrate.ts             ← Run Drizzle migrations

drizzle.config.ts          ← Drizzle Kit config (Neon connection)
drizzle/                   ← Generated migration SQL files (auto-created by drizzle-kit)
```

### 2.3 Modified Files

| File | Change |
|------|--------|
| `lib/data.ts` | Add `case "neon"` to provider switch |
| `package.json` | Add drizzle-orm, drizzle-kit, @neondatabase/serverless |
| `.env.example` | Document `DATABASE_URL` and `SEED_PASSWORD_*` vars |

### 2.4 Computed Fields

`daysSinceLastTouch`, `isStale`, and `isOverdue` are **not stored in the database**. They are computed at read time in the provider using the existing functions in `lib/stale.ts`. Same logic as mock — no drift.

---

## 3. Database Schema

### 3.1 ID Strategy

All primary keys are `text` type storing string IDs. User IDs preserve the existing `u-chad` format for compatibility. All other entities use generated UUIDs (e.g., `crypto.randomUUID()`).

### 3.2 Type Conventions

- **Dates:** Stored as `text` (ISO date strings, e.g., `"2026-03-23"`). No Postgres `date` or `timestamp` types — avoids timezone conversion issues with CT logic.
- **Arrays:** Stored as `jsonb` (roles, collaboratorIds, documentsAttached). Drizzle handles serialization.
- **Enums:** Stored as `text`. Validation happens in the application layer (TypeScript types), not in Postgres.
- **Nullable fields:** Match the `| null` types in `types.ts` exactly.

### 3.3 Tables

#### `users`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | e.g., `u-chad` |
| username | text | NOT NULL | unique |
| full_name | text | NOT NULL | |
| role | text | NOT NULL | rep, marketing, admin |
| is_active | boolean | NOT NULL | default true |
| password_hash | text | NOT NULL | bcrypt hash |
| permissions | jsonb | YES | `UserPermissions` object |

#### `organizations`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | UUID |
| name | text | NOT NULL | |
| type | text | YES | OrgType enum |
| notes | text | YES | |

#### `people`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | UUID |
| full_name | text | NOT NULL | |
| created_date | text | NOT NULL | ISO date |
| email | text | YES | |
| phone | text | YES | |
| organization_id | text | YES | FK → organizations.id |
| roles | jsonb | NOT NULL | PersonRole[] |
| pipeline_stage | text | YES | PipelineStage enum |
| stage_changed_date | text | YES | |
| initial_investment_target | numeric | YES | |
| growth_target | numeric | YES | |
| committed_amount | numeric | YES | |
| commitment_date | text | YES | |
| next_action_type | text | YES | |
| next_action_detail | text | YES | |
| next_action_date | text | YES | |
| lead_source | text | YES | |
| assigned_rep_id | text | YES | FK → users.id |
| collaborator_ids | jsonb | NOT NULL | string[], default [] |
| notes | text | YES | |
| lost_reason | text | YES | |
| reengage_date | text | YES | |
| contact_type | text | YES | |
| contact_company | text | YES | |

#### `activities`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | UUID |
| person_id | text | NOT NULL | FK → people.id |
| activity_type | text | NOT NULL | |
| source | text | NOT NULL | ActivitySource |
| date | text | NOT NULL | ISO date |
| time | text | YES | |
| outcome | text | NOT NULL | connected/attempted |
| detail | text | NOT NULL | |
| documents_attached | jsonb | NOT NULL | string[], default [] |
| logged_by_id | text | NOT NULL | FK → users.id |
| annotation | text | YES | |

#### `funding_entities`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | UUID |
| entity_name | text | NOT NULL | |
| entity_type | text | NOT NULL | EntityType |
| person_id | text | NOT NULL | FK → people.id |
| status | text | NOT NULL | EntityStatus |
| ein_tax_id | text | YES | |
| notes | text | YES | |

#### `funded_investments`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | UUID |
| funding_entity_id | text | NOT NULL | FK → funding_entities.id |
| person_id | text | NOT NULL | FK → people.id |
| amount_invested | numeric | NOT NULL | |
| investment_date | text | NOT NULL | ISO date |
| track | text | NOT NULL | maintain/grow |
| growth_target | numeric | YES | |
| next_check_in_date | text | NOT NULL | ISO date |
| notes | text | YES | |

#### `referrer_links`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| prospect_id | text | NOT NULL | FK → people.id, composite PK |
| referrer_id | text | NOT NULL | FK → people.id, composite PK |

#### `related_contact_links`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| prospect_id | text | NOT NULL | FK → people.id, composite PK |
| contact_id | text | NOT NULL | FK → people.id, composite PK |
| role | text | NOT NULL | e.g., "CPA — managing entity structure" |

#### `lead_source_configs`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| key | text | PK | auto-generated slug from label |
| label | text | NOT NULL | |
| order | integer | NOT NULL | |
| is_active | boolean | NOT NULL | default true |

#### `pipeline_stage_configs`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| key | text | PK | matches PipelineStage enum |
| label | text | NOT NULL | |
| idle_threshold | integer | YES | days |
| order | integer | NOT NULL | |

#### `activity_type_configs`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| key | text | PK | |
| label | text | NOT NULL | |
| is_active | boolean | NOT NULL | default true |
| is_system | boolean | NOT NULL | default false |

#### `system_config`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text | PK | always `"default"` (single row) |
| fund_target | numeric | NOT NULL | |
| company_name | text | NOT NULL | |
| default_rep_id | text | YES | FK → users.id |

---

## 4. Seed Script Behavior

The seed script runs once on first deployment. It is idempotent (safe to run again — skips existing rows).

### 4.1 What Gets Seeded

| Data | Demo (`mock`) | Production (`neon`) |
|------|--------------|-------------------|
| Users (Chad, Ken, Eric, Efri) | Hardcoded, password123 | Passwords from `SEED_PASSWORD_*` env vars |
| Pipeline Stage Configs | From constants | From constants (same) |
| Activity Type Configs | From constants | From constants (same) |
| Lead Source Configs | From constants (10 sources) | **Empty** — team adds their own |
| System Config | $10.5M target, OwnEZ Capital | Same defaults |
| Prospects, Activities, etc. | Mock data | **Empty** |

### 4.2 Password Env Vars

```
SEED_PASSWORD_CHAD=<real password>
SEED_PASSWORD_KEN=<real password>
SEED_PASSWORD_ERIC=<real password>
SEED_PASSWORD_EFRI=<real password>
```

Set in Vercel env vars before first deploy. The seed script reads them, bcrypt-hashes them, and creates user rows. After seeding, these vars are never read again (but leave them — they're needed if you ever re-seed).

---

## 5. Provider Wiring

### 5.1 `lib/data.ts` Change

```typescript
case "neon": {
  const { createNeonDataService } = await import("./providers/neon");
  globalForData.dataService = createNeonDataService();
  break;
}
```

### 5.2 Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATA_PROVIDER` | Yes | `"neon"` for production |
| `DATABASE_URL` | Yes | Neon connection string (auto-provisioned by Vercel Marketplace) |
| `SEED_PASSWORD_CHAD` | First deploy only | Chad's password |
| `SEED_PASSWORD_KEN` | First deploy only | Ken's password |
| `SEED_PASSWORD_ERIC` | First deploy only | Eric's password |
| `SEED_PASSWORD_EFRI` | First deploy only | Efri's password |

---

## 6. Lead Source Permissions Change

### 6.1 Current Behavior

Lead Source management is in the Admin panel. Only admin role can access.

### 6.2 New Behavior

- **New UI entry point:** "Manage Sources" accessible from Settings (all roles) and via a gear icon on any Lead Source dropdown.
- **Add:** Any authenticated user.
- **Edit label / Reorder:** Any authenticated user.
- **Deactivate (toggle `is_active` to false):** Admin only. The deactivate button is hidden/disabled for rep and marketing roles.
- **API enforcement:** The `updateLeadSource` endpoint checks auth role before allowing `isActive: false`.

---

## 7. Config Table Editability Summary

| Config Table | Seeded | Editable By | Notes |
|-------------|--------|-------------|-------|
| Pipeline Stage Configs | Both demo + production | **Nobody** | System constants, read-only |
| Activity Type Configs | Both demo + production | **Admin only** (toggle active, edit labels) | |
| Lead Source Configs | Demo only (production starts empty) | **All users** (add, edit, reorder). **Admin only** (deactivate) | |
| System Config | Both | **Admin only** | Fund target, company name, default rep |

---

## 8. Future: Migration to Zoho

When the Zoho provider is ready, a migration script will:

1. Read all records from Neon via the Neon provider
2. Write them through the Zoho provider, in dependency order: Organizations → People → Funding Entities → Activities → Funded Investments
3. Remap all IDs (Neon UUIDs → Zoho record IDs), preserving foreign key relationships
4. Run a validation pass comparing source and target field-by-field
5. Preserve original timestamps via custom Zoho fields (Zoho `Created_Time` will reflect import date)

This migration script will be built and tested against a Zoho Sandbox before running against production.

---

## 9. Implementation Notes

These clarify edge cases for the implementer:

1. **Column naming:** Database uses `snake_case` columns (e.g., `full_name`), TypeScript uses `camelCase` (e.g., `fullName`). Drizzle handles the mapping via column name aliases in `schema.ts`.

2. **`system_config.id` column:** The `SystemConfig` TypeScript type has no `id` field. The `id` column (`"default"`, single row) is a Postgres-level requirement for a primary key and does not surface to the application layer. The provider strips it when returning `SystemConfig`.

3. **`User.permissions` null handling:** Postgres stores `null` for missing jsonb. The TypeScript type uses `undefined` (optional field). The provider must coerce `null` → `undefined` when reading user records.

4. **`resetData()` method:** The Neon provider does **not** implement the optional `resetData()` method. It remains `undefined`. Tests that need data resets should use `DATA_PROVIDER=mock`.

5. **Indexes:** Foreign key columns (`people.organization_id`, `people.assigned_rep_id`, `activities.person_id`, `funding_entities.person_id`, `funded_investments.person_id`, `funded_investments.funding_entity_id`) get indexes for query performance. The data volume is small but this costs nothing and prevents surprises.

6. **Lead Source UI scope:** The "Manage Sources" gear icon appears on the Lead Source `<select>` component used in the Create/Edit Prospect forms. The Settings page gets a "Lead Sources" section visible to all roles. No other UI changes.

---

## 10. Handoff Checklist

See `docs/HANDOFF-NEON.md` for the step-by-step handoff document.
