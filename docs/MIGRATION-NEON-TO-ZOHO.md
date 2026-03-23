# Migration Guide: Neon Interim DB → Zoho CRM

**For:** Future Claude session building the migration script
**When:** After the Zoho provider (`lib/providers/zoho.ts`) is built and passing all tests
**Prerequisites:** Both `DATA_PROVIDER=neon` and `DATA_PROVIDER=zoho` work independently

---

## 1. What This Migration Does

Moves all real business data from the interim Neon Postgres database into Zoho CRM. After migration, the app switches to `DATA_PROVIDER=zoho` permanently and Neon is decommissioned.

### 1.1 Context

- Zoho CRM was **not used** for prospect/investor tracking before this migration — all data originated in the Neon interim DB.
- There is no data in Zoho to merge with — this is a clean import.
- The Neon schema mirrors `lib/types.ts` exactly (no schema drift was allowed).
- Both providers implement the same `DataService` interface, so the migration can read from one and write to the other.

### 1.2 What Migrates

| Entity | Neon Table | Zoho Module | Migration Order |
|--------|-----------|-------------|-----------------|
| Organizations | `organizations` | Organizations (custom) | 1st |
| People (all roles) | `people` | Contacts (custom) | 2nd |
| Referrer Links | `referrer_links` | Lookup field on Contact | 3rd (after people) |
| Related Contact Links | `related_contact_links` | Related List or subform | 4th (after people) |
| Funding Entities | `funding_entities` | Funding_Entities (custom) | 5th (after people) |
| Activities | `activities` | Activities or Notes (custom) | 6th (after people) |
| Funded Investments | `funded_investments` | Funded_Investments (custom) | 7th (after funding entities) |

### 1.3 What Does NOT Migrate (re-seeded in Zoho independently)

| Data | Reason |
|------|--------|
| Users | Zoho has its own user system. Map Neon user IDs → Zoho user IDs. |
| Pipeline Stage Configs | Seeded from `lib/constants.ts` by the Zoho provider. |
| Activity Type Configs | Seeded from `lib/constants.ts` by the Zoho provider. |
| Lead Source Configs | Must be re-created in Zoho picklist. See Section 4. |
| System Config | Managed separately in Zoho provider config. |

---

## 2. The ID Remapping Problem

This is the core challenge. Neon uses UUIDs (e.g., `a1b2c3d4-...`). Zoho assigns its own record IDs (e.g., `5234567890123456789`). Every foreign key must be remapped.

### 2.1 ID Map Structure

```typescript
interface IdMap {
  organizations: Map<string, string>;  // neonId → zohoId
  people: Map<string, string>;         // neonId → zohoId
  fundingEntities: Map<string, string>; // neonId → zohoId
  users: Map<string, string>;          // neonId (u-chad) → zohoUserId
}
```

### 2.2 User ID Mapping

Users are NOT migrated — they already exist in Zoho. You must build the user map manually or from config:

```typescript
// This mapping must be provided before migration runs
const USER_MAP: Record<string, string> = {
  "u-chad": "<zoho-user-id-for-chad>",
  "u-ken": "<zoho-user-id-for-ken>",
  "u-eric": "<zoho-user-id-for-eric>",
  "u-efri": "<zoho-user-id-for-efri>",
};
```

This should be an env var or config file, not hardcoded.

### 2.3 Remapping During Migration

Every record that references another record must have its IDs remapped:

| Entity | Fields That Need Remapping |
|--------|---------------------------|
| People | `organizationId` → org ID map, `assignedRepId` → user map, `collaboratorIds` → user map (array) |
| Activities | `personId` → people map, `loggedById` → user map |
| Funding Entities | `personId` → people map |
| Funded Investments | `fundingEntityId` → funding entity map, `personId` → people map |
| Referrer Links | `prospectId` → people map, `referrerId` → people map |
| Related Contact Links | `prospectId` → people map, `contactId` → people map |

---

## 3. Migration Script Architecture

### 3.1 Approach: Provider-to-Provider

The script uses both providers through the DataService interface:

```typescript
import { createNeonDataService } from "../lib/providers/neon";
import { createZohoDataService } from "../lib/providers/zoho";

const source = createNeonDataService();  // reads from Neon
const target = createZohoDataService();  // writes to Zoho
```

**Why this approach:** Both providers implement the same interface. The migration script doesn't need to know SQL or Zoho API details — it reads objects from one and writes them to the other.

### 3.2 However: Direct Reads May Be Needed

The DataService interface doesn't expose a "get all records" method for some entities. Specifically:

- `getFundingEntities(personId)` — requires a personId, can't list all
- `getFundedInvestments(personId)` — same
- `getActivities(personId)` — same

**Solution:** The migration script should either:
- (a) Iterate over all people first, then call `getFundingEntities(person.id)` etc. for each person
- (b) Add a temporary `getAllFundingEntities()` etc. method to the Neon provider (not to DataService — migration-only)
- (c) Query the Neon database directly for full table dumps

Option (a) is simplest and uses the existing interface. It's O(N) API calls but N is small (hundreds of investors, not millions).

### 3.3 Script Flow

```
1. Read all users from Neon → build user ID map (Neon ID → Zoho ID from config)
2. Read all organizations from Neon
   → For each: create in Zoho via target.createOrganization()
   → Store neonOrgId → zohoOrgId in map
3. Read all people from Neon (via source.getPeople() with no filters)
   → For each: remap organizationId, assignedRepId, collaboratorIds
   → Create in Zoho via target.createPerson()
   → Store neonPersonId → zohoPersonId in map
4. For each person in map:
   → Read referrer from source → if exists, add via target.addReferrer() using remapped IDs
   → Read related contacts from source → for each, add via target.addRelatedContact() using remapped IDs
   → Read funding entities from source → for each, create via target.createFundingEntity() with remapped personId
     → Store neonEntityId → zohoEntityId in map
   → Read activities from source → for each, create via target.createActivity() with remapped personId, loggedById
   → Read funded investments from source → for each, create via target.createFundedInvestment() with remapped fundingEntityId, personId
5. Run validation pass (Section 5)
```

### 3.4 Error Handling

- **Retry on failure:** If a Zoho API call fails (rate limit, transient error), retry up to 3 times with exponential backoff.
- **Resume from checkpoint:** The script should save progress to a JSON file (`migration-checkpoint.json`) after each entity type completes. If interrupted, it can resume from the last checkpoint.
- **Log everything:** Every created record should be logged with both source and target IDs. Write to `migration-log.json`.

---

## 4. Lead Sources — Special Handling

Lead Sources in Neon are rows in `lead_source_configs`. In Zoho, they're likely a picklist field on the Contact module.

**Before running migration:**
1. Read all active lead sources from Neon: `source.getLeadSources()`
2. Manually (or via Zoho API) create the same picklist values in Zoho
3. The Zoho provider should map lead source keys to Zoho picklist values

**During migration:**
- Each person's `leadSource` field (a string key like `"cpa_referral"`) must match a valid Zoho picklist value
- The Zoho provider's `createPerson` should handle this mapping

---

## 5. Validation Pass

After migration completes, run a comparison:

```typescript
async function validate(source: DataService, target: DataService, idMap: IdMap) {
  const sourceOrgs = await source.getOrganizations();
  const targetOrgs = await target.getOrganizations();

  for (const srcOrg of sourceOrgs) {
    const targetId = idMap.organizations.get(srcOrg.id);
    // Find in target by ID, compare field-by-field
    // Report mismatches
  }

  // Repeat for people, funding entities, funded investments
  // For activities: compare count per person, spot-check details
}
```

**Validation checks:**
1. **Record counts match** — same number of orgs, people, entities, investments in source vs. target
2. **Field values match** — for each record, every field (except IDs) should be identical
3. **Relationship integrity** — every referrer link, related contact link resolves to a valid target record
4. **Activity counts per person** — each person has the same number of activities in source and target
5. **Financial totals match** — total funded amount in source equals total in target
6. **Timestamp preservation** — `createdDate`, `date`, `investmentDate` etc. are identical (not overwritten by Zoho's Created_Time)

---

## 6. Timestamp Preservation

When bulk-importing into Zoho, `Created_Time` will be the import date, not the original creation date.

**Solution:** The Zoho module must have a custom field (e.g., `Original_Created_Date`) that stores the actual creation date from Neon. The Zoho provider's `createPerson` should accept and store this.

Fields that must be preserved exactly:
| Entity | Timestamp Fields |
|--------|-----------------|
| People | `createdDate`, `stageChangedDate`, `commitmentDate`, `nextActionDate`, `reengageDate` |
| Activities | `date`, `time` |
| Funded Investments | `investmentDate`, `nextCheckInDate` |

These are all stored as text (ISO date strings) in Neon and should be written to the corresponding Zoho fields as-is.

---

## 7. Zoho API Rate Limits

Zoho CRM API has rate limits (typically 100 requests/minute for standard plans). The migration script must:

- Use bulk insert APIs where available (Zoho supports inserting up to 100 records per API call)
- Batch records by entity type
- Respect rate limit headers and back off when throttled
- Log progress so you know where it stopped if rate-limited

---

## 8. Pre-Migration Checklist

Before running the migration:

- [ ] Zoho provider (`lib/providers/zoho.ts`) passes all 33 provider tests
- [ ] Zoho provider passes all E2E tests
- [ ] User ID mapping is configured (Neon IDs → Zoho user IDs)
- [ ] Lead source picklist values exist in Zoho
- [ ] Zoho sandbox is available for dry run
- [ ] Migration script has been tested against sandbox successfully
- [ ] Validation pass runs clean against sandbox

---

## 9. Post-Migration Checklist

After migration completes:

- [ ] Validation pass reports zero mismatches
- [ ] Switch `DATA_PROVIDER=zoho` in Vercel env vars
- [ ] Deploy
- [ ] Verify the app works end-to-end (login, view prospects, log activity, check leadership dashboard)
- [ ] Have Chad verify his prospects and recent activity look correct
- [ ] Keep Neon running for 2 weeks as backup (read-only, don't write to it)
- [ ] After 2 weeks with no issues, decommission Neon

---

## 10. Rollback Plan

If migration fails or data is wrong:

1. Switch back to `DATA_PROVIDER=neon` — immediate, no data loss
2. Fix the issue in the migration script
3. Wipe Zoho sandbox/production data that was imported
4. Re-run migration

The Neon database is never modified by the migration. It's read-only during the entire process.

---

## 11. Script Location and Invocation

```
scripts/migrate-neon-to-zoho.ts
```

Run with:
```bash
# Dry run against Zoho sandbox
ZOHO_SANDBOX=true npx tsx scripts/migrate-neon-to-zoho.ts --dry-run

# Actual migration against sandbox
ZOHO_SANDBOX=true npx tsx scripts/migrate-neon-to-zoho.ts

# Validation only (after migration)
ZOHO_SANDBOX=true npx tsx scripts/migrate-neon-to-zoho.ts --validate-only

# Production migration (after sandbox verification)
npx tsx scripts/migrate-neon-to-zoho.ts
```

Required env vars:
- `DATABASE_URL` — Neon connection string (source)
- Zoho API credentials (as configured in zoho provider)
- `ZOHO_USER_MAP` — JSON string mapping Neon user IDs to Zoho user IDs
