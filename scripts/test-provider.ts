/**
 * Zoho Provider Test Kit
 *
 * Tests every DataService method against whichever provider is active.
 * Run with: npx tsx scripts/test-provider.ts
 *
 * Set DATA_PROVIDER=zoho in .env.local to test the Zoho provider.
 * Set DATA_PROVIDER=mock (or omit) to verify the test kit itself against mock data.
 *
 * This script does NOT require a running dev server or browser.
 * It calls the DataService methods directly in Node.js.
 */

import { getDataService } from "../lib/data";
import type { DataService, PersonWithComputed } from "../lib/types";

// ─── Test Runner ───

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

async function test(name: string, fn: (ds: DataService) => Promise<void>) {
  try {
    const ds = await getDataService();
    await fn(ds);
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertType(value: unknown, type: string, field: string) {
  assert(typeof value === type, `${field} should be ${type}, got ${typeof value}`);
}

function assertNotNull(value: unknown, field: string) {
  assert(value !== null && value !== undefined, `${field} should not be null/undefined`);
}

function assertArray(value: unknown, field: string, minLength = 0) {
  assert(Array.isArray(value), `${field} should be an array`);
  assert((value as unknown[]).length >= minLength, `${field} should have at least ${minLength} items, got ${(value as unknown[]).length}`);
}

// ─── People Tests ───

async function testPeople() {
  console.log("\n📋 People");

  await test("getPeople() returns array of prospects", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    assertArray(people, "people", 1);
    const p = people[0];
    assertType(p.id, "string", "id");
    assertType(p.fullName, "string", "fullName");
    assertType(p.activityCount, "number", "activityCount");
    assert("daysSinceLastTouch" in p, "should have daysSinceLastTouch");
    assert("isStale" in p, "should have isStale");
    assert("isOverdue" in p, "should have isOverdue");
  });

  await test("getPeople() with stage filter", async (ds) => {
    const people = await ds.getPeople({ pipelineStages: ["active_engagement"] });
    assertArray(people, "people");
    for (const p of people) {
      assert(p.pipelineStage === "active_engagement", `expected active_engagement, got ${p.pipelineStage}`);
    }
  });

  await test("getPeople() with search filter", async (ds) => {
    const people = await ds.getPeople({ search: "calloway" });
    assertArray(people, "people", 1);
    assert(people.some(p => p.fullName.toLowerCase().includes("calloway")), "should find Calloway");
  });

  await test("getPerson() returns enriched person", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const person = await ds.getPerson(people[0].id);
    assertNotNull(person, "person");
    assertType(person!.fullName, "string", "fullName");
    assert("daysSinceLastTouch" in person!, "should have computed fields");
    assert("activityCount" in person!, "should have activityCount");
  });

  await test("createPerson() + getPerson() roundtrip", async (ds) => {
    const created = await ds.createPerson({
      fullName: "Test Person ZohoKit",
      roles: ["prospect"],
      pipelineStage: "prospect",
      leadSource: "other",
      nextActionType: "follow_up",
      nextActionDetail: "Test follow up",
      nextActionDate: "2026-04-01",
      assignedRepId: null,
    });
    assertType(created.id, "string", "created.id");
    assert(created.fullName === "Test Person ZohoKit", "name mismatch");

    const fetched = await ds.getPerson(created.id);
    assertNotNull(fetched, "fetched person");
    assert(fetched!.fullName === "Test Person ZohoKit", "fetched name mismatch");
  });

  await test("updatePerson() updates fields", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const target = people[0];
    const updated = await ds.updatePerson(target.id, {
      initialInvestmentTarget: 999999,
    });
    assert(updated.initialInvestmentTarget === 999999, "target should be updated");
  });

  await test("searchPeople() returns matches", async (ds) => {
    const results = await ds.searchPeople("test");
    assertArray(results, "results");
  });
}

// ─── Activities Tests ───

async function testActivities() {
  console.log("\n📝 Activities");

  await test("getActivities() returns array", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const activities = await ds.getActivities(people[0].id);
    assertArray(activities, "activities");
    if (activities.length > 0) {
      const a = activities[0];
      assertType(a.id, "string", "id");
      assertType(a.activityType, "string", "activityType");
      assertType(a.detail, "string", "detail");
      assertType(a.date, "string", "date");
    }
  });

  await test("createActivity() creates and returns activity", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const activity = await ds.createActivity(people[0].id, {
      activityType: "call",
      source: "manual",
      date: "2026-03-19",
      time: "14:30",
      outcome: "connected",
      detail: "Test call from provider test kit",
      documentsAttached: [],
      loggedById: "u-chad",
      annotation: null,
    });
    assertType(activity.id, "string", "id");
    assert(activity.activityType === "call", "type should be call");
    assert(activity.detail.includes("Test call"), "detail mismatch");
  });

  await test("getRecentActivities() returns cross-prospect feed", async (ds) => {
    const recent = await ds.getRecentActivities({ limit: 5 });
    assertArray(recent, "recent");
    if (recent.length > 0) {
      assertType(recent[0].personName, "string", "personName");
      assertType(recent[0].personId, "string", "personId");
    }
  });
}

// ─── Organizations Tests ───

async function testOrganizations() {
  console.log("\n🏢 Organizations");

  await test("getOrganizations() returns array", async (ds) => {
    const orgs = await ds.getOrganizations();
    assertArray(orgs, "orgs", 1);
    assertType(orgs[0].name, "string", "name");
  });

  await test("createOrganization() roundtrip", async (ds) => {
    const org = await ds.createOrganization({
      name: "Test Org ZohoKit",
      type: "corporate",
      notes: null,
    });
    assertType(org.id, "string", "id");
    assert(org.name === "Test Org ZohoKit", "name mismatch");
  });

  await test("searchOrganizations() returns matches", async (ds) => {
    const results = await ds.searchOrganizations("calloway");
    assertArray(results, "results");
  });
}

// ─── Funding Entities + Investments Tests ───

async function testFundingEntities() {
  console.log("\n💰 Funding Entities & Investments");

  await test("getFundingEntities() returns array", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    // Find someone with entities (try all prospects)
    for (const p of people) {
      const entities = await ds.getFundingEntities(p.id);
      if (entities.length > 0) {
        assertType(entities[0].entityName, "string", "entityName");
        assertType(entities[0].entityType, "string", "entityType");
        return;
      }
    }
    // No entities found — not a failure, just no test data
    console.log("    (no existing entities found — skipping shape check)");
  });

  await test("createFundingEntity() creates entity", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const entity = await ds.createFundingEntity({
      entityName: "Test Entity ZohoKit",
      entityType: "llc",
      personId: people[0].id,
      status: "active",
      einTaxId: null,
      notes: null,
    });
    assertType(entity.id, "string", "id");
    assert(entity.entityName === "Test Entity ZohoKit", "name mismatch");
  });
}

// ─── Relationships Tests ───

async function testRelationships() {
  console.log("\n🔗 Relationships");

  await test("getReferrerForProspect() returns person or null", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    // Just verify it doesn't throw
    const referrer = await ds.getReferrerForProspect(people[0].id);
    assert(referrer === null || typeof referrer.fullName === "string", "referrer shape");
  });

  await test("getRelatedContacts() returns array", async (ds) => {
    const people = await ds.getPeople({ roles: ["prospect"] });
    const contacts = await ds.getRelatedContacts(people[0].id);
    assertArray(contacts, "contacts");
  });
}

// ─── Dashboard Tests ───

async function testDashboard() {
  console.log("\n📊 Dashboard");

  await test("getDashboardStats() returns all fields", async (ds) => {
    const stats = await ds.getDashboardStats();
    assertType(stats.activePipelineCount, "number", "activePipelineCount");
    assertType(stats.pipelineValue, "number", "pipelineValue");
    assertType(stats.committedValue, "number", "committedValue");
    assertType(stats.fundedYTD, "number", "fundedYTD");
  });
}

// ─── Leadership Tests ───

async function testLeadership() {
  console.log("\n👔 Leadership");

  await test("getLeadershipStats() returns all fields", async (ds) => {
    const stats = await ds.getLeadershipStats();
    assertType(stats.aumRaised, "number", "aumRaised");
    assertType(stats.fundTarget, "number", "fundTarget");
    assertType(stats.fundedYTDCount, "number", "fundedYTDCount");
    assertType(stats.activeCount, "number", "activeCount");
    assertType(stats.pipelineValue, "number", "pipelineValue");
  });

  await test("getMeetingsCount() returns number", async (ds) => {
    const count = await ds.getMeetingsCount(30);
    assertType(count, "number", "count");
  });

  await test("getFunnelData() returns stage array", async (ds) => {
    const funnel = await ds.getFunnelData();
    assertArray(funnel, "funnel");
    if (funnel.length > 0) {
      assertType(funnel[0].stage, "string", "stage");
      assertType(funnel[0].count, "number", "count");
      assertType(funnel[0].totalValue, "number", "totalValue");
    }
  });

  await test("getSourceROI() returns source array", async (ds) => {
    const roi = await ds.getSourceROI();
    assertArray(roi, "roi");
    if (roi.length > 0) {
      assertType(roi[0].source, "string", "source");
      assertType(roi[0].prospectCount, "number", "prospectCount");
      assertType(roi[0].conversionPct, "number", "conversionPct");
    }
  });

  await test("getTopReferrers() returns referrer array", async (ds) => {
    const referrers = await ds.getTopReferrers(5);
    assertArray(referrers, "referrers");
    if (referrers.length > 0) {
      assertType(referrers[0].referrerName, "string", "referrerName");
      assertType(referrers[0].referralCount, "number", "referralCount");
    }
  });

  await test("getRedFlags() returns prospect array", async (ds) => {
    const flags = await ds.getRedFlags();
    assertArray(flags, "flags");
    // All should be stale or overdue
    for (const p of flags) {
      assert(p.isStale || p.isOverdue, `${p.fullName} should be stale or overdue`);
    }
  });

  await test("getDrilldownProspects() with stage filter", async (ds) => {
    const prospects = await ds.getDrilldownProspects({ active: true });
    assertArray(prospects, "prospects");
  });

  await test("getDrilldownActivities() with type filter", async (ds) => {
    const activities = await ds.getDrilldownActivities({ activityType: "meeting", days: 90 });
    assertArray(activities, "activities");
  });
}

// ─── Users Tests ───

async function testUsers() {
  console.log("\n👥 Users");

  await test("getUsers() returns user array", async (ds) => {
    const users = await ds.getUsers();
    assertArray(users, "users", 1);
    assertType(users[0].id, "string", "id");
    assertType(users[0].fullName, "string", "fullName");
    assertType(users[0].role, "string", "role");
  });

  await test("getUserByUsername() returns user", async (ds) => {
    const user = await ds.getUserByUsername("chad");
    assertNotNull(user, "user");
    assert(user!.username === "chad", "username mismatch");
  });
}

// ─── Admin Config Tests ───

async function testAdminConfig() {
  console.log("\n⚙️  Admin Config");

  await test("getLeadSources() returns array with shape", async (ds) => {
    const sources = await ds.getLeadSources();
    assertArray(sources, "sources", 1);
    assertType(sources[0].key, "string", "key");
    assertType(sources[0].label, "string", "label");
    assertType(sources[0].isActive, "boolean", "isActive");
  });

  await test("getLeadSourceCounts() returns counts", async (ds) => {
    const counts = await ds.getLeadSourceCounts();
    assert(typeof counts === "object", "should be object");
  });

  await test("getSystemConfig() returns config", async (ds) => {
    const config = await ds.getSystemConfig();
    assertType(config.fundTarget, "number", "fundTarget");
    assertType(config.companyName, "string", "companyName");
  });

  await test("getPipelineStageConfigs() returns stages", async (ds) => {
    const stages = await ds.getPipelineStageConfigs();
    assertArray(stages, "stages", 9); // at least 9 active stages
    assertType(stages[0].key, "string", "key");
    assertType(stages[0].label, "string", "label");
  });

  await test("getActivityTypeConfigs() returns types", async (ds) => {
    const types = await ds.getActivityTypeConfigs();
    assertArray(types, "types", 5);
    assertType(types[0].key, "string", "key");
    assertType(types[0].label, "string", "label");
    assertType(types[0].isActive, "boolean", "isActive");
    assertType(types[0].isSystem, "boolean", "isSystem");
  });
}

// ─── Seed test data for non-mock providers ───

async function seedTestData() {
  const provider = process.env.DATA_PROVIDER || "mock";
  if (provider === "mock") return; // mock already has data

  console.log("  🌱 Seeding test data for non-mock provider...\n");
  const ds = await getDataService();

  // Create a test org
  await ds.createOrganization({ name: "Calloway Family Office", type: "family_office", notes: null });

  // Create test prospects with various stages
  const prospect1 = await ds.createPerson({
    fullName: "Robert Calloway",
    roles: ["prospect"],
    pipelineStage: "active_engagement",
    leadSource: "velocis_network",
    assignedRepId: "u-chad",
    email: "rcalloway@callowayfo.com",
    initialInvestmentTarget: 500000,
  });

  // Create activities for the prospect
  await ds.createActivity(prospect1.id, {
    activityType: "meeting",
    source: "manual",
    date: "2026-02-24",
    time: "16:00",
    outcome: "connected",
    detail: "Test meeting for provider test kit",
    documentsAttached: [],
    loggedById: "u-chad",
    annotation: null,
  });

  // Create a lead source
  await ds.createLeadSource({ label: "Velocis Network" });
}

// ─── Main ───

async function main() {
  console.log("🧪 OwnEZ CRM — Provider Test Kit");
  console.log(`   Provider: ${process.env.DATA_PROVIDER || "mock"}`);
  console.log("   Tests call DataService methods directly (no browser needed)\n");

  await seedTestData();

  await testPeople();
  await testActivities();
  await testOrganizations();
  await testFundingEntities();
  await testRelationships();
  await testDashboard();
  await testLeadership();
  await testUsers();
  await testAdminConfig();

  console.log("\n" + "─".repeat(50));
  console.log(`\n✅ Passed: ${passed}  ❌ Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  • ${f}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
