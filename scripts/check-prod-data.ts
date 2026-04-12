/**
 * Read-only production data inspection.
 *
 * Usage:
 *   npx tsx --env-file=.env.prod.local scripts/check-prod-data.ts
 *
 * Reports:
 *   - core totals (people, activities, commitment rows, open commitments,
 *     backfill rows)
 *   - drift detection between Person.next_action_date and the backfilled
 *     commitment_due_date (should be zero)
 *   - recent non-backfill activities (last 24h)
 *   - commitment status distribution
 *
 * Written during the Commitments v2 go-live (2026-04-12) to sanity-check
 * the migration + backfill + flag-flip sequence. Generally useful as an
 * ops diagnostic any time production data state is in question.
 *
 * Requires `.env.prod.local` with `DATABASE_URL` pointing at production
 * Neon. Issues zero writes.
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) process.exit(1);
  const sql = neon(process.env.DATABASE_URL);

  // 1. Core counts match expectations
  const core = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM people) AS people,
      (SELECT COUNT(*)::int FROM activities) AS activities,
      (SELECT COUNT(*)::int FROM activities WHERE activity_type = 'commitment_set') AS commitments,
      (SELECT COUNT(*)::int FROM activities WHERE activity_type = 'commitment_set' AND commitment_status = 'open') AS open_commitments,
      (SELECT COUNT(*)::int FROM activities WHERE id LIKE 'c-backfill-%') AS backfill_rows
  `) as {
    people: number;
    activities: number;
    commitments: number;
    open_commitments: number;
    backfill_rows: number;
  }[];
  const c = core[0];
  console.log("Core counts:");
  console.log(`  people:                 ${c.people}      (expected 51 + any new)`);
  console.log(`  activities (all):       ${c.activities}`);
  console.log(`  commitment_set rows:    ${c.commitments}`);
  console.log(`  open commitments:       ${c.open_commitments}`);
  console.log(`  c-backfill-* rows:      ${c.backfill_rows}  (expected 51)`);

  // 2. Drift check — do all 51 backfilled rows still match their
  //    person.next_action_date? (They should, nothing should have changed
  //    them since we flipped the flag — except any close-outs Chad has done
  //    in the last few minutes.)
  const drift = (await sql`
    SELECT a.id, p.full_name, a.commitment_due_date, p.next_action_date,
           a.commitment_status
      FROM activities a
      JOIN people p ON p.id = a.person_id
     WHERE a.id LIKE 'c-backfill-%'
       AND (a.commitment_due_date != p.next_action_date
            OR a.commitment_type != p.next_action_type)
  `) as Array<{
    id: string;
    full_name: string;
    commitment_due_date: string;
    next_action_date: string;
    commitment_status: string;
  }>;
  if (drift.length > 0) {
    console.log(`\n⚠️ Drift detected in ${drift.length} backfill rows:`);
    for (const d of drift.slice(0, 10)) {
      console.log(
        `  ${d.full_name}: commitment due ${d.commitment_due_date}, person na=${d.next_action_date}, status=${d.commitment_status}`
      );
    }
  } else {
    console.log(`\n✓ No drift: all backfill rows match person.next_action_date`);
  }

  // 3. Activities created since flag flip (rough check for Eric's test)
  const newActs = (await sql`
    SELECT a.id, p.full_name, a.activity_type, a.date, a.time, a.detail
      FROM activities a
      JOIN people p ON p.id = a.person_id
     WHERE a.date::date >= CURRENT_DATE - INTERVAL '1 day'
       AND a.id NOT LIKE 'c-backfill-%'
     ORDER BY a.date DESC, a.time DESC NULLS LAST
     LIMIT 10
  `) as Array<{
    id: string;
    full_name: string;
    activity_type: string;
    date: string;
    time: string;
    detail: string;
  }>;
  console.log(`\nRecent non-backfill activities (last 24h, limit 10):`);
  if (newActs.length === 0) {
    console.log("  (none — so either nobody's logged anything, or only Chad's bugfix retry)");
  }
  for (const a of newActs) {
    console.log(
      `  ${a.date} ${a.time} · ${a.full_name} · ${a.activity_type} · ${String(a.detail).slice(0, 60)}`
    );
  }

  // 4. Any commitment rows in unexpected states?
  const weirdStatus = (await sql`
    SELECT COUNT(*)::int AS n, commitment_status
      FROM activities
     WHERE activity_type = 'commitment_set'
     GROUP BY commitment_status
     ORDER BY commitment_status
  `) as Array<{ n: number; commitment_status: string | null }>;
  console.log(`\nCommitment status distribution:`);
  for (const w of weirdStatus) {
    console.log(`  ${w.commitment_status ?? "NULL"}: ${w.n}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
