import { eq, and, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type {
  Person,
  PersonWithComputed,
  ReferrerStats,
  Activity,
} from "../../../types";
import { ACTIVE_PIPELINE_STAGES, TOUCH_ACTIVITY_TYPES } from "../../../constants";
import { computeDaysSinceLastTouch, computeIsStale, computeIsOverdue } from "../../../stale";
import { getTodayCT } from "../../../format";

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
    TOUCH_ACTIVITY_TYPES.includes(a.activityType)
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

export async function getReferrerForProspect(db: NeonDb, prospectId: string): Promise<Person | null> {
  const link = await db
    .select()
    .from(schema.referrerLinks)
    .where(eq(schema.referrerLinks.prospectId, prospectId))
    .limit(1);
  if (link.length === 0) return null;

  const rows = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, link[0].referrerId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToPerson(rows[0]);
}

export async function getRelatedContacts(
  db: NeonDb,
  prospectId: string
): Promise<(Person & { relationRole: string })[]> {
  const links = await db
    .select()
    .from(schema.relatedContactLinks)
    .where(eq(schema.relatedContactLinks.prospectId, prospectId));

  const result: (Person & { relationRole: string })[] = [];
  for (const link of links) {
    const rows = await db
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, link.contactId))
      .limit(1);
    if (rows.length > 0) {
      result.push({ ...rowToPerson(rows[0]), relationRole: link.role });
    }
  }
  return result;
}

export async function addReferrer(db: NeonDb, prospectId: string, referrerId: string): Promise<void> {
  // Delete existing referrer link if any
  await db
    .delete(schema.referrerLinks)
    .where(eq(schema.referrerLinks.prospectId, prospectId));

  await db.insert(schema.referrerLinks).values({ prospectId, referrerId });
}

export async function addRelatedContact(
  db: NeonDb,
  prospectId: string,
  contactId: string,
  role: string
): Promise<void> {
  await db.insert(schema.relatedContactLinks).values({ prospectId, contactId, role });
}

export async function removeRelatedContact(
  db: NeonDb,
  prospectId: string,
  contactId: string
): Promise<void> {
  await db
    .delete(schema.relatedContactLinks)
    .where(
      and(
        eq(schema.relatedContactLinks.prospectId, prospectId),
        eq(schema.relatedContactLinks.contactId, contactId)
      )
    );
}

export async function getReferrals(db: NeonDb, referrerId: string): Promise<PersonWithComputed[]> {
  const links = await db
    .select()
    .from(schema.referrerLinks)
    .where(eq(schema.referrerLinks.referrerId, referrerId));

  const result: PersonWithComputed[] = [];
  for (const link of links) {
    const rows = await db
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, link.prospectId))
      .limit(1);
    if (rows.length > 0) {
      result.push(await enrichPerson(db, rowToPerson(rows[0])));
    }
  }
  return result;
}

export async function getTopReferrers(db: NeonDb, limit = 5): Promise<ReferrerStats[]> {
  const allLinks = await db.select().from(schema.referrerLinks);
  const allPeople = (await db.select().from(schema.people)).map(rowToPerson);
  const allInvestments = await db.select().from(schema.fundedInvestments);

  const peopleMap = new Map(allPeople.map((p) => [p.id, p]));

  const referrerMap = new Map<string, { referrerId: string; referrerName: string; prospects: string[] }>();

  for (const link of allLinks) {
    const referrer = peopleMap.get(link.referrerId);
    if (!referrer) continue;
    if (!referrerMap.has(link.referrerId)) {
      referrerMap.set(link.referrerId, { referrerId: link.referrerId, referrerName: referrer.fullName, prospects: [] });
    }
    referrerMap.get(link.referrerId)!.prospects.push(link.prospectId);
  }

  return Array.from(referrerMap.values())
    .map((r) => {
      const prospects = r.prospects.map((pid) => peopleMap.get(pid)).filter(Boolean) as Person[];
      const pipelineValue = prospects
        .filter((p) => p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage))
        .reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0);
      const fundedValue = allInvestments
        .filter((fi) => r.prospects.includes(fi.personId))
        .reduce((sum, fi) => sum + Number(fi.amountInvested), 0);
      return {
        referrerId: r.referrerId,
        referrerName: r.referrerName,
        referralCount: r.prospects.length,
        pipelineValue,
        fundedValue,
      };
    })
    .sort((a, b) => b.referralCount - a.referralCount || b.fundedValue - a.fundedValue)
    .slice(0, limit);
}
