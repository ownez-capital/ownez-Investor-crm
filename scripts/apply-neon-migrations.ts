/**
 * Explicitly apply Neon schema migrations and verify the result.
 *
 * This project does NOT use drizzle-kit migrations. Schema evolution happens
 * via idempotent CREATE TABLE IF NOT EXISTS / ALTER TABLE IF NOT EXISTS
 * statements in lib/providers/neon/migrate.ts, which are normally triggered
 * lazily on the first DataService call via ensureInitialized().
 *
 * In production you should apply the migration BEFORE traffic arrives — don't
 * rely on the first cold-start to do it. Run this script as part of the
 * go-live runbook (see docs/commitments-go-live-runbook.md step 1.3).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/apply-neon-migrations.ts
 *
 * The script is safe to re-run. It:
 *   1. Calls runMigrations(db) which issues all the idempotent CREATE/ALTER
 *      statements from lib/providers/neon/migrate.ts.
 *   2. Verifies the activities table has the 6 commitment columns.
 *   3. Verifies the activities_type_status_idx index exists.
 *   4. Exits 0 on success, 1 on any missing column/index.
 */

import { createDb } from "../lib/providers/neon/db";
import { runMigrations } from "../lib/providers/neon/migrate";
import { sql } from "drizzle-orm";

const EXPECTED_COMMITMENT_COLUMNS = [
  "fulfills_commitment_id",
  "commitment_type",
  "commitment_detail",
  "commitment_due_date",
  "commitment_status",
  "commitment_closed_date",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Did you forget --env-file=.env.local?");
    process.exit(1);
  }

  const db = createDb();

  console.log("▶ Applying runMigrations(db)…");
  await runMigrations(db);
  console.log("  ✅ runMigrations completed");

  console.log("▶ Verifying commitment columns on activities table…");
  const colsResult = await db.execute(
    sql`SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'activities'
        ORDER BY ordinal_position`
  );
  // drizzle-orm/neon-http returns either { rows: [...] } or a rows array
  // depending on the driver version — handle both.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (colsResult as any).rows ?? colsResult;
  const colNames = new Set(rows.map((r: { column_name: string }) => r.column_name));

  let ok = true;
  for (const col of EXPECTED_COMMITMENT_COLUMNS) {
    if (colNames.has(col)) {
      const row = rows.find((r: { column_name: string }) => r.column_name === col);
      console.log(`  ✅ ${col} (${row.data_type}, nullable=${row.is_nullable})`);
    } else {
      console.log(`  ❌ ${col} MISSING`);
      ok = false;
    }
  }

  console.log("▶ Verifying activities_type_status_idx…");
  const idxResult = await db.execute(
    sql`SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'activities' AND indexname = 'activities_type_status_idx'`
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idxRows = (idxResult as any).rows ?? idxResult;
  if (idxRows.length > 0) {
    console.log(`  ✅ activities_type_status_idx → ${idxRows[0].indexdef}`);
  } else {
    console.log("  ❌ activities_type_status_idx MISSING");
    ok = false;
  }

  if (!ok) {
    console.error("\n❌ Migration verification failed. Do NOT flip the feature flag.");
    process.exit(1);
  }
  console.log("\n✅ All migrations applied and verified.");
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Migration crashed:", err);
  process.exit(1);
});
