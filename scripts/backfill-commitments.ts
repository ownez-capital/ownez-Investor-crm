/**
 * One-shot backfill: create Commitment Set rows for existing Next Actions.
 *
 * For every Person in an active pipeline stage whose next_action_date is set,
 * write a single Activity Log row with activity_type='commitment_set' and
 * commitment_status='open'. The script is idempotent — persons that already
 * have an open Commitment Set row are skipped.
 *
 * Run (dry run first, always):
 *   npx tsx --env-file=.env.local scripts/backfill-commitments.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-commitments.ts
 *
 * Prerequisite: the 6 commitment columns must already exist on the activities
 * table. See docs/commitments-go-live-runbook.md step 1 for the schema
 * migration that adds them. Running this script before the migration will
 * fail loudly — that's expected.
 *
 * Safe to re-run. Exits non-zero on any error.
 */

import { neon } from "@neondatabase/serverless";
import { getTodayCT } from "../lib/format";

type PersonRow = {
  id: string;
  next_action_type: string | null;
  next_action_detail: string | null;
  next_action_date: string;
};

type CountRow = { count: string };

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const mode = isDryRun ? "DRY RUN" : "LIVE";

  if (!process.env.DATABASE_URL) {
    console.error("Fatal: DATABASE_URL environment variable is not set.");
    console.error("Run with: npx tsx --env-file=.env.local scripts/backfill-commitments.ts [--dry-run]");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const today = getTodayCT();

  console.log(`\nBackfill commitments — ${mode}`);
  console.log(`Today (CT): ${today}\n`);

  // ─── Candidate people ───
  // Active stages only. next_action_date must be set. We don't filter on
  // next_action_type so partially-populated rows still get a commitment
  // written — the commitment_type will be null but the due date is what
  // drives the overdue check.
  console.log("Scanning candidates...");
  const candidates = (await sql.query(
    `SELECT id, next_action_type, next_action_detail, next_action_date
       FROM people
      WHERE next_action_date IS NOT NULL
        AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('funded', 'nurture', 'dead'))
      ORDER BY id`
  )) as PersonRow[];

  console.log(`  Candidates scanned: ${candidates.length}`);

  let skippedExisting = 0;
  let toWrite: PersonRow[] = [];
  const perPersonErrors: { id: string; error: string }[] = [];

  // ─── Filter out persons that already have an open commitment ───
  for (const person of candidates) {
    try {
      const existing = (await sql.query(
        `SELECT COUNT(*)::text AS count
           FROM activities
          WHERE person_id = $1
            AND activity_type = 'commitment_set'
            AND commitment_status = 'open'`,
        [person.id]
      )) as CountRow[];
      const openCount = Number(existing[0]?.count ?? "0");
      if (openCount > 0) {
        skippedExisting++;
      } else {
        toWrite.push(person);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      perPersonErrors.push({ id: person.id, error: `check existing: ${msg}` });
    }
  }

  console.log(`  Already backfilled (skipped): ${skippedExisting}`);
  console.log(`  New commitments to write: ${toWrite.length}`);

  if (perPersonErrors.length > 0) {
    console.log(`  Errors during scan: ${perPersonErrors.length}`);
  }

  // ─── Write new commitments ───
  let written = 0;
  if (toWrite.length > 0) {
    console.log(`\n${isDryRun ? "Would write" : "Writing"} ${toWrite.length} commitment set rows...`);

    for (const person of toWrite) {
      const id = `c-backfill-${crypto.randomUUID()}`;
      try {
        if (!isDryRun) {
          await sql.query(
            `INSERT INTO activities (
               id,
               person_id,
               activity_type,
               source,
               date,
               time,
               outcome,
               detail,
               documents_attached,
               logged_by_id,
               annotation,
               fulfills_commitment_id,
               commitment_type,
               commitment_detail,
               commitment_due_date,
               commitment_status,
               commitment_closed_date
             ) VALUES (
               $1, $2, 'commitment_set', 'manual', $3, '00:00', 'connected',
               'Backfilled from legacy Next Action', $4::jsonb, 'u-chad', NULL,
               NULL, $5, $6, $7, 'open', NULL
             )`,
            [
              id,
              person.id,
              today,
              "[]",
              person.next_action_type,
              person.next_action_detail,
              person.next_action_date,
            ]
          );
        }
        written++;
        if (written % 25 === 0) {
          console.log(`  ${isDryRun ? "[dry]" : "     "} ${written}/${toWrite.length}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        perPersonErrors.push({ id: person.id, error: `insert: ${msg}` });
      }
    }
  }

  // ─── Summary ───
  console.log(`\n─── Summary (${mode}) ───`);
  console.log(`  Candidates scanned:       ${candidates.length}`);
  console.log(`  Already backfilled:       ${skippedExisting}`);
  console.log(`  Commitments ${isDryRun ? "would be written" : "written         "}: ${written}`);
  console.log(`  Errors:                   ${perPersonErrors.length}`);

  if (perPersonErrors.length > 0) {
    console.log(`\nError details:`);
    for (const e of perPersonErrors.slice(0, 20)) {
      console.log(`  • ${e.id}: ${e.error}`);
    }
    if (perPersonErrors.length > 20) {
      console.log(`  ...and ${perPersonErrors.length - 20} more`);
    }
    console.log(`\nBackfill completed WITH ERRORS. Review the list above.`);
    process.exit(2);
  }

  if (isDryRun) {
    console.log(`\nDry run complete. Re-run without --dry-run to actually write.`);
  } else {
    console.log(`\nBackfill complete.`);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
