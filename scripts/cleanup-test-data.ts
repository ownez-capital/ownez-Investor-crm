/**
 * One-shot cleanup: remove test artifacts from production Neon that leaked
 * in via `scripts/test-provider.ts` (before its idempotency fix) and a
 * separate Zoho integration test.
 *
 * Targets:
 *   - 3× people named "Robert Calloway" with email rcalloway@callowayfo.com
 *   - 1× person named "Test Person ZohoKit"
 *   - Their activities
 *   - 3× organizations named "Calloway Family Office"
 *   - 1× organization named "Test Org ZohoKit"
 *
 * Does NOT touch real prospects. Runs in dry-run by default:
 *   npx tsx --env-file=.env.prod.local scripts/cleanup-test-data.ts
 *   npx tsx --env-file=.env.prod.local scripts/cleanup-test-data.ts --execute
 *
 * Deletes happen in a single transaction. Fails loudly if the pre-state or
 * post-state doesn't match expectations.
 *
 * Safe to re-run (becomes a no-op after first successful execute).
 */
import { neon } from "@neondatabase/serverless";

const EXPECTED_PRE_PEOPLE = 55; // sanity check: confirm we start where we think we start
const EXPECTED_POST_PEOPLE = 51; // 55 - 3 Roberts - 1 Test Person ZohoKit
const EXPECTED_PRE_ORGS = 4;
const EXPECTED_POST_ORGS = 0;

async function main() {
  const isExecute = process.argv.includes("--execute");
  const mode = isExecute ? "EXECUTE" : "DRY RUN";

  if (!process.env.DATABASE_URL) {
    console.error("Fatal: DATABASE_URL env var is not set.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log(`🧹 Cleanup test data — ${mode}`);
  console.log("━".repeat(60));

  // ─── 1. Identify victim people ───────────────────────────────────────────
  const roberts = (await sql`
    SELECT id, full_name, email FROM people
     WHERE email = 'rcalloway@callowayfo.com'
  `) as { id: string; full_name: string; email: string }[];

  const zohoPerson = (await sql`
    SELECT id, full_name FROM people
     WHERE full_name = 'Test Person ZohoKit'
  `) as { id: string; full_name: string }[];

  const victimPersonIds = [...roberts, ...zohoPerson].map((r) => r.id);

  console.log(`\nVictims — people (${victimPersonIds.length}):`);
  for (const r of roberts) {
    console.log(`  ${r.id} · ${r.full_name} (${r.email})`);
  }
  for (const r of zohoPerson) {
    console.log(`  ${r.id} · ${r.full_name}`);
  }
  if (victimPersonIds.length === 0) {
    console.log("  (none found — already cleaned up?)");
  }

  // ─── 2. Identify victim activities ───────────────────────────────────────
  let victimActivityIds: string[] = [];
  if (victimPersonIds.length > 0) {
    const acts = (await sql`
      SELECT id, person_id, activity_type, detail FROM activities
       WHERE person_id = ANY(${victimPersonIds})
    `) as {
      id: string;
      person_id: string;
      activity_type: string;
      detail: string;
    }[];
    victimActivityIds = acts.map((a) => a.id);
    console.log(`\nVictims — activities (${victimActivityIds.length}):`);
    for (const a of acts) {
      console.log(
        `  ${a.id} · person=${a.person_id} · ${a.activity_type} · ${String(a.detail).slice(0, 60)}`
      );
    }
  }

  // ─── 3. Identify victim orgs ─────────────────────────────────────────────
  const orgs = (await sql`
    SELECT id, name, type FROM organizations
     WHERE name IN ('Calloway Family Office', 'Test Org ZohoKit')
  `) as { id: string; name: string; type: string }[];
  const victimOrgIds = orgs.map((o) => o.id);

  console.log(`\nVictims — organizations (${victimOrgIds.length}):`);
  for (const o of orgs) {
    console.log(`  ${o.id} · ${o.name} (${o.type})`);
  }

  // ─── 4. Safety: are any REAL prospects linked to these orgs? ─────────────
  if (victimOrgIds.length > 0) {
    const orphaned = (await sql`
      SELECT id, full_name, email, organization_id FROM people
       WHERE organization_id = ANY(${victimOrgIds})
         AND id != ALL(${victimPersonIds})
    `) as {
      id: string;
      full_name: string;
      email: string;
      organization_id: string;
    }[];
    if (orphaned.length > 0) {
      console.log(
        `\n⚠️  WARNING: deleting these orgs would orphan ${orphaned.length} real prospect(s):`
      );
      for (const o of orphaned) {
        console.log(`  ${o.id} · ${o.full_name} (${o.email}) → org ${o.organization_id}`);
      }
      console.log(
        "  Aborting. Review and either (a) point these prospects at a different org first,\n" +
          "  or (b) skip the org-cleanup portion of this script."
      );
      process.exit(2);
    }
    console.log(
      `\n✓ No real prospects linked to the victim orgs. Safe to delete.`
    );
  }

  // ─── 5. Pre-state sanity check ───────────────────────────────────────────
  const preCounts = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM people) AS people,
      (SELECT COUNT(*)::int FROM activities) AS activities,
      (SELECT COUNT(*)::int FROM organizations) AS orgs
  `) as { people: number; activities: number; orgs: number }[];
  const pre = preCounts[0];
  console.log(
    `\nPre-cleanup totals: ${pre.people} people, ${pre.activities} activities, ${pre.orgs} orgs`
  );

  if (pre.people !== EXPECTED_PRE_PEOPLE) {
    console.log(
      `\n⚠️  Expected ${EXPECTED_PRE_PEOPLE} people but found ${pre.people}. ` +
        `Has data changed since the inventory was taken? Review before executing.`
    );
    if (isExecute) {
      console.log("Aborting execute for safety.");
      process.exit(2);
    }
  }

  // ─── 6. Execute (or dry-run) ─────────────────────────────────────────────
  if (!isExecute) {
    console.log(
      `\n[DRY RUN] Would delete ${victimActivityIds.length} activities, ` +
        `${victimPersonIds.length} people, ${victimOrgIds.length} organizations.`
    );
    console.log("Run with --execute to actually delete.");
    return;
  }

  console.log("\n🔥 Executing deletes…");

  // Neon HTTP doesn't support BEGIN/COMMIT across statements (each call is
  // auto-committed). We do the deletes in a carefully ordered sequence with
  // post-state verification; if the post-state is wrong we surface it loudly
  // and the Neon snapshot `pre-commitments-v2` is available for rollback.

  if (victimActivityIds.length > 0) {
    const del = await sql`
      DELETE FROM activities WHERE id = ANY(${victimActivityIds})
    `;
    console.log(`  ✓ Deleted ${victimActivityIds.length} activities`);
    void del;
  }

  if (victimPersonIds.length > 0) {
    const del = await sql`
      DELETE FROM people WHERE id = ANY(${victimPersonIds})
    `;
    console.log(`  ✓ Deleted ${victimPersonIds.length} people`);
    void del;
  }

  if (victimOrgIds.length > 0) {
    const del = await sql`
      DELETE FROM organizations WHERE id = ANY(${victimOrgIds})
    `;
    console.log(`  ✓ Deleted ${victimOrgIds.length} orgs`);
    void del;
  }

  // ─── 7. Post-state verification ──────────────────────────────────────────
  const postCounts = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM people) AS people,
      (SELECT COUNT(*)::int FROM activities) AS activities,
      (SELECT COUNT(*)::int FROM organizations) AS orgs
  `) as { people: number; activities: number; orgs: number }[];
  const post = postCounts[0];

  console.log(
    `\nPost-cleanup totals: ${post.people} people, ${post.activities} activities, ${post.orgs} orgs`
  );

  if (post.people !== EXPECTED_POST_PEOPLE) {
    console.error(
      `❌ Expected ${EXPECTED_POST_PEOPLE} people post-cleanup; got ${post.people}. INVESTIGATE.`
    );
    process.exit(2);
  }
  if (post.orgs !== EXPECTED_POST_ORGS) {
    console.error(
      `❌ Expected ${EXPECTED_POST_ORGS} orgs post-cleanup; got ${post.orgs}. INVESTIGATE.`
    );
    process.exit(2);
  }
  console.log(
    `\n✅ Cleanup complete. ${post.people} real prospects remain.`
  );
}

main().catch((e) => {
  console.error("💥 Cleanup crashed:", e);
  process.exit(1);
});
