/**
 * Idempotent seed: ensure all LEAD_SOURCES constants exist in the
 * lead_source_configs table. Uses ON CONFLICT DO NOTHING so it's safe
 * to re-run against any environment.
 *
 * Dry-run by default (reports what would be inserted):
 *   npx tsx --env-file=.env.local scripts/seed-lead-sources.ts
 *   npx tsx --env-file=.env.prod.local scripts/seed-lead-sources.ts
 *
 * Execute (actually inserts):
 *   npx tsx --env-file=.env.prod.local scripts/seed-lead-sources.ts --execute
 *
 * IMPORTANT: Take a Neon snapshot before running --execute against production.
 */
import { neon } from "@neondatabase/serverless";

const LEAD_SOURCES = [
  { key: "velocis_network", label: "Velocis Network" },
  { key: "cpa_referral", label: "CPA Referral" },
  { key: "legacy_event", label: "Legacy Event" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "ken_dbj_list", label: "Ken \u2014 DBJ List" },
  { key: "ken_event_followup", label: "Ken \u2014 Event Follow-up" },
  { key: "tolleson_wm", label: "Tolleson WM" },
  { key: "ma_attorney", label: "M&A Attorney" },
  { key: "cold_outreach", label: "Cold Outreach" },
  { key: "other", label: "Other" },
];

async function main() {
  const isExecute = process.argv.includes("--execute");
  const mode = isExecute ? "EXECUTE" : "DRY RUN";

  if (!process.env.DATABASE_URL) {
    console.error("Fatal: DATABASE_URL env var is not set.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log(`Seed lead sources - ${mode}`);
  console.log("=".repeat(60));

  // Check existing rows
  const existing = await sql`SELECT key FROM lead_source_configs`;
  const existingKeys = new Set(existing.map((r) => r.key));

  console.log(`\nExisting sources in DB: ${existing.length}`);
  for (const row of existing) {
    console.log(`  - ${row.key}`);
  }

  // Determine what needs inserting
  const toInsert = LEAD_SOURCES.filter((s) => !existingKeys.has(s.key));

  if (toInsert.length === 0) {
    console.log("\nAll base lead sources already exist. Nothing to do.");
    return;
  }

  console.log(`\nSources to insert: ${toInsert.length}`);
  for (const s of toInsert) {
    console.log(`  + ${s.key} ("${s.label}")`);
  }

  if (!isExecute) {
    console.log("\n[DRY RUN] No changes made. Pass --execute to insert.");
    return;
  }

  // Insert missing sources with order continuing after existing rows
  const maxOrder = existing.length;
  for (let i = 0; i < toInsert.length; i++) {
    const s = toInsert[i];
    await sql`
      INSERT INTO lead_source_configs (key, label, "order", is_active)
      VALUES (${s.key}, ${s.label}, ${maxOrder + i}, true)
      ON CONFLICT (key) DO NOTHING
    `;
  }

  // Verify
  const after = await sql`SELECT key FROM lead_source_configs`;
  console.log(`\nDone. Lead sources in DB: ${after.length}`);
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
