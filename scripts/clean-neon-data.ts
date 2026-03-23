/**
 * Wipe all business data from Neon, keeping config tables intact.
 * Run: npx tsx --env-file=.env.local scripts/clean-neon-data.ts
 */

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("🧹 Cleaning Neon business data...\n");

  // Order matters — delete children before parents
  const tables = [
    "funded_investments",
    "funding_entities",
    "referrer_links",
    "related_contact_links",
    "activities",
    "people",
    "organizations",
    "lead_source_configs",
  ];

  for (const table of tables) {
    await sql.query(`DELETE FROM ${table}`);
    console.log(`  ✓ ${table} — cleared`);
  }

  console.log("\n✅ Business data wiped. Config tables preserved:");
  console.log("   • users (chad, ken, eric, efri)");
  console.log("   • pipeline_stage_configs (11 stages)");
  console.log("   • activity_type_configs (11 types)");
  console.log("   • system_config ($10.5M target)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
