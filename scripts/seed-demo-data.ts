/**
 * Seed demo data into Neon for demo/presentation.
 * Run: npx tsx --env-file=.env.local scripts/seed-demo-data.ts
 */

import { getDataService } from "../lib/data";

async function main() {
  console.log("🌱 Seeding demo data into Neon...\n");
  const ds = await getDataService();

  // ─── Lead Sources ───
  console.log("  Lead Sources...");
  const leadSources = [
    "Velocis Network", "CPA Referral", "Legacy Event", "LinkedIn",
    "Ken — DBJ List", "Ken — Event Follow-up", "Tolleson WM",
    "M&A Attorney", "Cold Outreach", "Other",
  ];
  for (const label of leadSources) {
    try { await ds.createLeadSource({ label }); } catch { /* already exists */ }
  }

  // ─── Organizations ───
  console.log("  Organizations...");
  const orgs: { name: string; type: "family_office" | "corporate" | "individual_none"; id?: string }[] = [
    { name: "Calloway Family Office", type: "family_office" },
    { name: "Kim Holdings LLC", type: "corporate" },
    { name: "Thornton Capital", type: "corporate" },
    { name: "Wells Family Trust", type: "family_office" },
    { name: "MJ Ventures", type: "corporate" },
    { name: "Whitfield Enterprises", type: "corporate" },
    { name: "Torres Family Office", type: "family_office" },
    { name: "Huang Capital Partners", type: "corporate" },
    { name: "Grant Holdings", type: "corporate" },
    { name: "Blake Trust", type: "family_office" },
    { name: "Park Capital", type: "corporate" },
    { name: "Adams Family Trust", type: "family_office" },
    { name: "Morrison Family Trust", type: "family_office" },
    { name: "Chang Investments", type: "corporate" },
    { name: "Reeves Capital", type: "corporate" },
    { name: "Whitley Penn", type: "corporate" },
  ];

  const orgMap = new Map<string, string>();
  for (const o of orgs) {
    const created = await ds.createOrganization({ name: o.name, type: o.type, notes: null });
    orgMap.set(o.name, created.id);
  }

  // ─── Prospects ───
  console.log("  Prospects...");
  const prospects = [
    { fullName: "Robert Calloway", org: "Calloway Family Office", stage: "active_engagement", target: 500000, growth: 1500000, source: "velocis_network", email: "rcalloway@callowayfo.com", phone: "(214) 555-0142", notes: "Interested after Velocis event. Wants to see historical returns by vintage year before committing." },
    { fullName: "Sandra Kim", org: "Kim Holdings LLC", stage: "soft_commit", target: 250000, growth: null, source: "cpa_referral", email: "skim@kimholdings.com", phone: "(214) 555-0198", committed: 250000, notes: "Committed $250K verbally. Checking with attorney on entity structure." },
    { fullName: "David Thornton", org: "Thornton Capital", stage: "discovery", target: 500000, growth: 2000000, source: "ma_attorney", email: "dthornton@thorntoncap.com", phone: "(972) 555-0234", notes: "Recently exited $12M manufacturing business. Looking for passive yield." },
    { fullName: "Patricia Wells", org: "Wells Family Trust", stage: "pitch", target: 750000, growth: 750000, source: "legacy_event", email: "pwells@wellstrust.com", phone: "(214) 555-0311", notes: "Third-generation wealth. Very conservative. Needs peer validation." },
    { fullName: "Marcus Johnson", org: "MJ Ventures", stage: "active_engagement", target: 300000, growth: 800000, source: "linkedin", email: "mjohnson@mjventures.com", phone: "(469) 555-0178", notes: "Owns 12 rental properties. Interested in passive alternative." },
    { fullName: "James Whitfield", org: "Whitfield Enterprises", stage: "commitment_processing", target: 500000, growth: 1000000, source: "velocis_network", email: "jwhitfield@whitfield.com", phone: "(214) 555-0456", committed: 500000, notes: "Setting up new LLC for investment. Attorney reviewing sub docs." },
    { fullName: "Angela Torres", org: "Torres Family Office", stage: "kyc_docs", target: 350000, growth: null, source: "cpa_referral", email: "atorres@torresfam.com", phone: "(214) 555-0567", committed: 350000, notes: "Moved to Agora for KYC. Waiting on passport upload." },
    { fullName: "Richard Huang", org: "Huang Capital Partners", stage: "prospect", target: null, growth: null, source: "ken_dbj_list", email: "rhuang@huangcapital.com", phone: "(214) 555-0134", notes: "Recently sold tech company. Ken flagged as high-value target." },
    { fullName: "William Grant", org: "Grant Holdings", stage: "initial_contact", target: null, growth: null, source: "tolleson_wm", email: "wgrant@grantholdings.com", phone: "(214) 555-0789", notes: "Tolleson advisor made warm intro. Left voicemail." },
    { fullName: "Rachel Adams", org: "Adams Family Trust", stage: "active_engagement", target: 250000, growth: 750000, source: "ken_event_followup", email: "radams@adamstrust.com", phone: "(214) 555-0654", notes: "Met at Dallas RE event. Ken qualified and did warm handoff." },
    { fullName: "Catherine Blake", org: "Blake Trust", stage: "nurture", target: 200000, growth: 500000, source: "legacy_event", email: "cblake@blaketrust.com", phone: "(972) 555-0321", notes: "Interested but tied up through April with tax season." },
    { fullName: "Thomas Park", org: "Park Capital", stage: "dead", target: null, growth: null, source: "cold_outreach", email: null, phone: null, notes: "Not accredited. Friendly but doesn't meet requirements." },
  ];

  const personMap = new Map<string, string>();
  for (const p of prospects) {
    const created = await ds.createPerson({
      fullName: p.fullName,
      roles: ["prospect"],
      pipelineStage: p.stage as any,
      initialInvestmentTarget: p.target,
      growthTarget: p.growth,
      committedAmount: (p as any).committed ?? null,
      leadSource: p.source as any,
      assignedRepId: "u-chad",
      email: p.email,
      phone: p.phone,
      organizationId: orgMap.get(p.org) ?? null,
      notes: p.notes,
      lostReason: p.stage === "dead" ? "not_accredited" : null,
    });
    personMap.set(p.fullName, created.id);
  }

  // ─── Funded Investors ───
  console.log("  Funded investors...");
  const funded = [
    { fullName: "Steven Morrison", org: "Morrison Family Trust", target: 500000, source: "velocis_network", email: "smorrison@morrisontrust.com", invested: 500000, track: "maintain", date: "2026-01-15" },
    { fullName: "Lisa Chang", org: "Chang Investments", target: 100000, source: "cpa_referral", email: "lchang@changinv.com", invested: 100000, track: "grow", growthTarget: 400000, date: "2026-02-01" },
    { fullName: "Daniel Reeves", org: "Reeves Capital", target: 250000, source: "linkedin", email: "dreeves@reevescap.com", invested: 250000, track: "grow", growthTarget: 250000, date: "2025-12-01" },
  ];

  for (const f of funded) {
    const person = await ds.createPerson({
      fullName: f.fullName,
      roles: ["funded_investor"],
      pipelineStage: "funded",
      initialInvestmentTarget: f.target,
      committedAmount: f.target,
      leadSource: f.source as any,
      assignedRepId: "u-chad",
      email: f.email,
      organizationId: orgMap.get(f.org) ?? null,
    });
    personMap.set(f.fullName, person.id);

    const entity = await ds.createFundingEntity({
      entityName: f.org,
      entityType: "trust",
      personId: person.id,
      status: "active",
      einTaxId: null,
      notes: null,
    });

    await ds.createFundedInvestment({
      fundingEntityId: entity.id,
      personId: person.id,
      amountInvested: f.invested,
      investmentDate: f.date,
      track: f.track as any,
      growthTarget: (f as any).growthTarget ?? null,
      nextCheckInDate: "2026-04-01",
      notes: null,
    });
  }

  // ─── Referrers ───
  console.log("  Referrers...");
  const lawson = await ds.createPerson({
    fullName: "Mike Lawson",
    roles: ["referrer"],
    email: "mlawson@whitleypenn.com",
    phone: "(214) 555-1001",
    organizationId: orgMap.get("Whitley Penn") ?? null,
    contactType: "cpa",
    contactCompany: "Whitley Penn",
    notes: "CPA at Whitley Penn. Referred Sandra Kim and Angela Torres.",
  });

  const sandraId = personMap.get("Sandra Kim");
  const torresId = personMap.get("Angela Torres");
  if (sandraId) await ds.addReferrer(sandraId, lawson.id);
  if (torresId) await ds.addReferrer(torresId, lawson.id);

  // ─── Activities ───
  console.log("  Activities...");
  const activities = [
    { person: "Robert Calloway", type: "meeting", date: "2026-02-24", time: "16:00", detail: "Coffee at Ascension. Reviewed performance data. He pulled out a notepad — good sign. Wants vintage-level returns before committing." },
    { person: "Robert Calloway", type: "email", date: "2026-02-19", time: "11:00", detail: "Sent Q2 performance summary as requested." },
    { person: "Robert Calloway", type: "meeting", date: "2026-01-28", time: "10:00", detail: "Full deck presentation over breakfast at The Mansion. Serious — asked about fund structure and fee breakdown." },
    { person: "Robert Calloway", type: "call", date: "2026-03-14", time: "14:30", detail: "Inbound call — Robert asked about Fund V closing timeline." },
    { person: "Sandra Kim", type: "email", date: "2026-02-25", time: "09:15", detail: "Sent entity structure options — LLC vs Trust comparison memo." },
    { person: "Sandra Kim", type: "meeting", date: "2026-02-20", time: "14:00", detail: "Lunch at Knife. Ready to commit $250K. Checking entity with attorney." },
    { person: "Sandra Kim", type: "call", date: "2025-12-18", time: "14:00", detail: "Intro call from CPA referral." },
    { person: "David Thornton", type: "call", date: "2026-02-21", time: "09:00", detail: "Intro call — 30 min. Just exited $12M manufacturing sale. Very engaged." },
    { person: "David Thornton", type: "email", date: "2026-02-14", time: "10:00", detail: "Sent intro email with one-pager from M&A attorney referral." },
    { person: "Patricia Wells", type: "email", date: "2026-02-22", time: "15:30", detail: "Sent pitch deck follow-up. Offered to connect with existing investor. No response yet." },
    { person: "Patricia Wells", type: "meeting", date: "2026-02-14", time: "14:00", detail: "In-person pitch at Highland Park office. Receptive but cautious." },
    { person: "Marcus Johnson", type: "meeting", date: "2026-02-23", time: "14:00", detail: "Zoom — 45 min. Walked through rental portfolio yield vs OwnEZ target. Wants one more quarter." },
    { person: "Marcus Johnson", type: "meeting", date: "2026-01-30", time: "14:00", detail: "Full presentation via Zoom. Focused Q&A on comparing 6% rental yield to 9-11% target." },
    { person: "James Whitfield", type: "call", date: "2026-02-25", time: "08:30", detail: "Called attorney's office. LLC docs in progress, needs 5 more business days." },
    { person: "Angela Torres", type: "email", date: "2026-02-24", time: "11:00", detail: "Reminded to upload passport scan for KYC in Agora portal." },
    { person: "William Grant", type: "call", date: "2026-02-17", time: "10:00", detail: "Left voicemail referencing Tolleson advisor's warm intro." },
    { person: "Rachel Adams", type: "email", date: "2026-02-23", time: "10:00", detail: "Sent case study of similar investor who started at $100K and scaled to $500K." },
    { person: "Rachel Adams", type: "meeting", date: "2026-02-06", time: "15:00", detail: "Pitched via Zoom — 40 min. Detailed questions about ITIN lending model." },
    { person: "Rachel Adams", type: "meeting", date: "2026-01-28", time: "11:00", detail: "Zoom discovery — 25 min. Manages family trust, looking for yield alternatives." },
  ];

  for (const a of activities) {
    const pid = personMap.get(a.person);
    if (!pid) continue;
    await ds.createActivity(pid, {
      activityType: a.type as any,
      source: "manual",
      date: a.date,
      time: a.time,
      outcome: "connected",
      detail: a.detail,
      documentsAttached: [],
      loggedById: "u-chad",
      annotation: null,
    });
  }

  console.log("\n✅ Demo data seeded! Refresh the app to see it.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
