import { eq, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type {
  LeadershipStats,
  DashboardStats,
  FunnelStage,
  SourceROIRow,
  DrilldownProspectFilter,
  DrilldownActivityFilter,
  PersonWithComputed,
  RecentActivityEntry,
  Person,
  Activity,
  FundedInvestment,
  PipelineStage,
} from "../../../types";
import { ACTIVE_PIPELINE_STAGES, COMMITTED_STAGES, PIPELINE_STAGES, TOUCH_ACTIVITY_TYPES } from "../../../constants";
import { computeDaysSinceLastTouch, computeIsStale, computeIsOverdue } from "../../../stale";
import { getTodayCT } from "../../../format";

// Helper to convert row to Person
function rowToPerson(row: typeof schema.people.$inferSelect): Person {
  return {
    id: row.id,
    fullName: row.fullName,
    createdDate: row.createdDate,
    email: row.email,
    phone: row.phone,
    organizationId: row.organizationId,
    roles: row.roles as Person["roles"],
    pipelineStage: row.pipelineStage as Person["pipelineStage"],
    stageChangedDate: row.stageChangedDate,
    initialInvestmentTarget: row.initialInvestmentTarget ? Number(row.initialInvestmentTarget) : null,
    growthTarget: row.growthTarget ? Number(row.growthTarget) : null,
    committedAmount: row.committedAmount ? Number(row.committedAmount) : null,
    commitmentDate: row.commitmentDate,
    nextActionType: row.nextActionType as Person["nextActionType"],
    nextActionDetail: row.nextActionDetail,
    nextActionDate: row.nextActionDate,
    leadSource: row.leadSource as Person["leadSource"],
    assignedRepId: row.assignedRepId,
    collaboratorIds: row.collaboratorIds as string[],
    notes: row.notes,
    lostReason: row.lostReason as Person["lostReason"],
    reengageDate: row.reengageDate,
    contactType: row.contactType as Person["contactType"],
    contactCompany: row.contactCompany,
  };
}

async function enrichPerson(db: NeonDb, person: Person): Promise<PersonWithComputed> {
  const today = getTodayCT();

  const personActivities = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.personId, person.id));

  const activitiesTyped = personActivities as Activity[];
  const daysSinceLastTouch = computeDaysSinceLastTouch(activitiesTyped, today);
  const isStale = computeIsStale(person.pipelineStage, daysSinceLastTouch, person.nextActionDate, today);
  const isOverdue = computeIsOverdue(person.pipelineStage, person.nextActionDate, today);

  let organizationName: string | null = null;
  if (person.organizationId) {
    const org = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, person.organizationId)).limit(1);
    organizationName = org[0]?.name ?? null;
  }

  let assignedRepName: string | null = null;
  if (person.assignedRepId) {
    const rep = await db.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, person.assignedRepId)).limit(1);
    assignedRepName = rep[0]?.fullName ?? null;
  }

  let referrerName: string | null = null;
  const refLink = await db.select({ referrerId: schema.referrerLinks.referrerId }).from(schema.referrerLinks).where(eq(schema.referrerLinks.prospectId, person.id)).limit(1);
  if (refLink[0]) {
    const referrer = await db.select({ fullName: schema.people.fullName }).from(schema.people).where(eq(schema.people.id, refLink[0].referrerId)).limit(1);
    referrerName = referrer[0]?.fullName ?? null;
  }

  const activityCount = activitiesTyped.filter((a) =>
    TOUCH_ACTIVITY_TYPES.includes(a.activityType as Activity["activityType"])
  ).length;

  return {
    ...person,
    organizationName,
    assignedRepName,
    daysSinceLastTouch,
    isStale,
    isOverdue,
    activityCount,
    referrerName,
  };
}

export async function getLeadershipStats(db: NeonDb): Promise<LeadershipStats> {
  const today = getTodayCT();
  const yearStart = today.substring(0, 4) + "-01-01";

  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allInvestments = await db.select().from(schema.fundedInvestments);

  const aumRaised = allInvestments.reduce((sum, fi) => sum + Number(fi.amountInvested), 0);
  const fundedYTDCount = allInvestments.filter((fi) => fi.investmentDate >= yearStart).length;

  const activeProspects = allPeople.filter(
    (p) => (p.roles as string[]).includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
  );

  const sysConfig = await db.select().from(schema.systemConfig).limit(1);
  const fundTarget = sysConfig[0] ? Number(sysConfig[0].fundTarget) : 10_500_000;

  return {
    aumRaised,
    fundTarget,
    fundedYTDCount,
    activeCount: activeProspects.length,
    pipelineValue: activeProspects.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
  };
}

export async function getDashboardStats(db: NeonDb): Promise<DashboardStats> {
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allInvestments = await db.select().from(schema.fundedInvestments);

  const activePeople = allPeople.filter(
    (p) => (p.roles as string[]).includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
  );

  const committedPeople = allPeople.filter(
    (p) => p.pipelineStage && COMMITTED_STAGES.includes(p.pipelineStage)
  );

  return {
    activePipelineCount: activePeople.length,
    pipelineValue: activePeople.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
    committedValue: committedPeople.reduce((sum, p) => sum + (p.committedAmount ?? 0), 0),
    fundedYTD: allInvestments.reduce((sum, fi) => sum + Number(fi.amountInvested), 0),
  };
}

export async function getFunnelData(db: NeonDb): Promise<FunnelStage[]> {
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allStages = [...ACTIVE_PIPELINE_STAGES, "funded" as PipelineStage];

  return allStages.map((stage) => {
    const stageConfig = PIPELINE_STAGES.find((s) => s.key === stage);
    const stageProspects = allPeople.filter(
      (p) => ((p.roles as string[]).includes("prospect") || (p.roles as string[]).includes("funded_investor")) && p.pipelineStage === stage
    );
    return {
      stage,
      label: stageConfig?.label ?? stage,
      count: stageProspects.length,
      totalValue: stageProspects.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
    };
  });
}

export async function getSourceROI(db: NeonDb): Promise<SourceROIRow[]> {
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allInvestments = await db.select().from(schema.fundedInvestments);
  const lsConfigs = await db.select().from(schema.leadSourceConfigs);

  const allProspects = allPeople.filter((p) => (p.roles as string[]).includes("prospect") || (p.roles as string[]).includes("funded_investor"));
  const sourceCounts: Record<string, { prospects: number; funded: number; aum: number }> = {};

  for (const p of allProspects) {
    const src = p.leadSource ?? "other";
    if (!sourceCounts[src]) sourceCounts[src] = { prospects: 0, funded: 0, aum: 0 };
    sourceCounts[src].prospects++;
    if (p.pipelineStage === "funded") {
      sourceCounts[src].funded++;
      const inv = allInvestments.filter((fi) => fi.personId === p.id);
      sourceCounts[src].aum += inv.reduce((sum, fi) => sum + Number(fi.amountInvested), 0);
    }
  }

  const lsLabels: Record<string, string> = Object.fromEntries(
    lsConfigs.map((s) => [s.key, s.label])
  );

  return Object.entries(sourceCounts)
    .map(([source, data]) => ({
      source,
      label: lsLabels[source] ?? source,
      prospectCount: data.prospects,
      fundedCount: data.funded,
      aum: data.aum,
      conversionPct: data.prospects > 0 ? Math.round((data.funded / data.prospects) * 100) : 0,
    }))
    .sort((a, b) => b.aum - a.aum);
}

export async function getDrilldownProspects(db: NeonDb, filter: DrilldownProspectFilter): Promise<PersonWithComputed[]> {
  const today = getTodayCT();
  const yearStart = today.substring(0, 4) + "-01-01";
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allInvestments = await db.select().from(schema.fundedInvestments);

  let result = allPeople.filter((p) => (p.roles as string[]).includes("prospect") || (p.roles as string[]).includes("funded_investor"));

  if (filter.stage) {
    result = result.filter((p) => p.pipelineStage === filter.stage);
  }
  if (filter.leadSource) {
    result = result.filter((p) => p.leadSource === filter.leadSource);
  }
  if (filter.fundedYTD) {
    const ytdPersonIds = new Set(
      allInvestments.filter((fi) => fi.investmentDate >= yearStart).map((fi) => fi.personId)
    );
    result = result.filter((p) => ytdPersonIds.has(p.id));
  }
  if (filter.fundedAll) {
    const fundedPersonIds = new Set(allInvestments.map((fi) => fi.personId));
    result = result.filter((p) => fundedPersonIds.has(p.id));
  }
  if (filter.active) {
    result = result.filter((p) => p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage));
  }

  let enriched = await Promise.all(result.map((p) => enrichPerson(db, p)));

  // Sort funded drilldowns by most recent investment date (newest first)
  if (filter.fundedYTD || filter.fundedAll) {
    const latestInvestmentDate = new Map<string, string>();
    for (const fi of allInvestments) {
      const existing = latestInvestmentDate.get(fi.personId);
      if (!existing || fi.investmentDate > existing) {
        latestInvestmentDate.set(fi.personId, fi.investmentDate);
      }
    }
    enriched.sort((a, b) => (latestInvestmentDate.get(b.id) ?? "").localeCompare(latestInvestmentDate.get(a.id) ?? ""));
  }

  return enriched;
}

export async function getDrilldownActivities(db: NeonDb, filter: DrilldownActivityFilter): Promise<RecentActivityEntry[]> {
  const today = getTodayCT();
  const cutoff = new Date(new Date(today + "T00:00:00").getTime() - filter.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const allActivities = await db.select().from(schema.activities);
  const allPeople = await db.select({ id: schema.people.id, fullName: schema.people.fullName }).from(schema.people);
  const personMap = new Map(allPeople.map((p) => [p.id, p.fullName]));

  return allActivities
    .filter((a) => a.activityType === filter.activityType && a.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => ({
      id: a.id,
      personId: a.personId,
      activityType: a.activityType as Activity["activityType"],
      source: a.source as Activity["source"],
      date: a.date,
      time: a.time,
      outcome: a.outcome as Activity["outcome"],
      detail: a.detail,
      documentsAttached: a.documentsAttached as string[],
      loggedById: a.loggedById,
      annotation: a.annotation,
      personName: personMap.get(a.personId) ?? "Unknown",
    }));
}

export async function getMeetingsCount(db: NeonDb, days: number): Promise<number> {
  const today = getTodayCT();
  const cutoff = new Date(new Date(today + "T00:00:00").getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const allActivities = await db.select().from(schema.activities);
  return allActivities.filter((a) => a.activityType === "meeting" && a.date >= cutoff).length;
}

export async function getLeadSourceCounts(db: NeonDb): Promise<Record<string, number>> {
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const counts: Record<string, number> = {};
  for (const p of allPeople) {
    if (p.leadSource && (p.roles as string[]).includes("prospect")) {
      counts[p.leadSource] = (counts[p.leadSource] ?? 0) + 1;
    }
  }
  return counts;
}
