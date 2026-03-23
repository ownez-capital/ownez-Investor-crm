import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type {
  Person,
  PersonWithComputed,
  PeopleFilters,
  Activity,
} from "../../../types";
import { TOUCH_ACTIVITY_TYPES, ACTIVE_PIPELINE_STAGES } from "../../../constants";
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

  // Get activities for this person
  const personActivities = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.personId, person.id));

  const activitiesTyped = personActivities as Activity[];
  const daysSinceLastTouch = computeDaysSinceLastTouch(activitiesTyped, today);
  const isStale = computeIsStale(person.pipelineStage, daysSinceLastTouch, person.nextActionDate, today);
  const isOverdue = computeIsOverdue(person.pipelineStage, person.nextActionDate, today);

  // Get org name
  let organizationName: string | null = null;
  if (person.organizationId) {
    const org = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, person.organizationId))
      .limit(1);
    organizationName = org[0]?.name ?? null;
  }

  // Get rep name
  let assignedRepName: string | null = null;
  if (person.assignedRepId) {
    const rep = await db
      .select({ fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.id, person.assignedRepId))
      .limit(1);
    assignedRepName = rep[0]?.fullName ?? null;
  }

  // Get referrer name
  let referrerName: string | null = null;
  const refLink = await db
    .select({ referrerId: schema.referrerLinks.referrerId })
    .from(schema.referrerLinks)
    .where(eq(schema.referrerLinks.prospectId, person.id))
    .limit(1);
  if (refLink[0]) {
    const referrer = await db
      .select({ fullName: schema.people.fullName })
      .from(schema.people)
      .where(eq(schema.people.id, refLink[0].referrerId))
      .limit(1);
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

export async function getPeople(db: NeonDb, filters?: PeopleFilters): Promise<PersonWithComputed[]> {
  const rows = await db.select().from(schema.people);
  let people = rows.map(rowToPerson);

  if (filters?.roles?.length) {
    people = people.filter((p) =>
      filters.roles!.some((r) => (p.roles as string[]).includes(r))
    );
  }
  if (filters?.pipelineStages?.length) {
    people = people.filter((p) =>
      p.pipelineStage && filters.pipelineStages!.includes(p.pipelineStage)
    );
  }
  if (filters?.leadSources?.length) {
    people = people.filter((p) =>
      p.leadSource && filters.leadSources!.includes(p.leadSource)
    );
  }
  if (filters?.assignedRepId) {
    people = people.filter((p) => p.assignedRepId === filters.assignedRepId);
  }
  if (filters?.assignedRepUnassigned) {
    people = people.filter((p) => p.assignedRepId === null);
  }

  let enriched = await Promise.all(people.map((p) => enrichPerson(db, p)));

  if (filters?.staleOnly) {
    enriched = enriched.filter((p) => p.isStale || p.isOverdue);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    enriched = enriched.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.organizationName?.toLowerCase().includes(q) ?? false) ||
        (p.email?.toLowerCase().includes(q) ?? false)
    );
  }

  return enriched;
}

export async function getPerson(db: NeonDb, id: string): Promise<PersonWithComputed | null> {
  const rows = await db.select().from(schema.people).where(eq(schema.people.id, id)).limit(1);
  if (rows.length === 0) return null;
  const person = rowToPerson(rows[0]);
  return enrichPerson(db, person);
}

export async function createPerson(db: NeonDb, data: Partial<Person>): Promise<Person> {
  const id = crypto.randomUUID();
  const today = getTodayCT();

  const newPerson = {
    id,
    fullName: data.fullName ?? "",
    createdDate: today,
    email: data.email ?? null,
    phone: data.phone ?? null,
    organizationId: data.organizationId ?? null,
    roles: JSON.stringify(data.roles ?? ["prospect"]),
    pipelineStage: data.pipelineStage ?? "prospect",
    stageChangedDate: today,
    initialInvestmentTarget: data.initialInvestmentTarget?.toString() ?? null,
    growthTarget: data.growthTarget?.toString() ?? null,
    committedAmount: data.committedAmount?.toString() ?? null,
    commitmentDate: data.commitmentDate ?? null,
    nextActionType: data.nextActionType ?? null,
    nextActionDetail: data.nextActionDetail ?? null,
    nextActionDate: data.nextActionDate ?? null,
    leadSource: data.leadSource ?? null,
    assignedRepId: data.assignedRepId ?? null,
    collaboratorIds: JSON.stringify(data.collaboratorIds ?? []),
    notes: data.notes ?? null,
    lostReason: data.lostReason ?? null,
    reengageDate: data.reengageDate ?? null,
    contactType: data.contactType ?? null,
    contactCompany: data.contactCompany ?? null,
  };

  await db.execute(
    sql`INSERT INTO people (id, full_name, created_date, email, phone, organization_id, roles, pipeline_stage, stage_changed_date, initial_investment_target, growth_target, committed_amount, commitment_date, next_action_type, next_action_detail, next_action_date, lead_source, assigned_rep_id, collaborator_ids, notes, lost_reason, reengage_date, contact_type, contact_company)
    VALUES (${newPerson.id}, ${newPerson.fullName}, ${newPerson.createdDate}, ${newPerson.email}, ${newPerson.phone}, ${newPerson.organizationId}, ${newPerson.roles}::jsonb, ${newPerson.pipelineStage}, ${newPerson.stageChangedDate}, ${newPerson.initialInvestmentTarget}, ${newPerson.growthTarget}, ${newPerson.committedAmount}, ${newPerson.commitmentDate}, ${newPerson.nextActionType}, ${newPerson.nextActionDetail}, ${newPerson.nextActionDate}, ${newPerson.leadSource}, ${newPerson.assignedRepId}, ${newPerson.collaboratorIds}::jsonb, ${newPerson.notes}, ${newPerson.lostReason}, ${newPerson.reengageDate}, ${newPerson.contactType}, ${newPerson.contactCompany})`
  );

  const rows = await db.select().from(schema.people).where(eq(schema.people.id, id)).limit(1);
  return rowToPerson(rows[0]);
}

export async function updatePerson(db: NeonDb, id: string, data: Partial<Person>): Promise<Person> {
  // Get current person
  const currentRows = await db.select().from(schema.people).where(eq(schema.people.id, id)).limit(1);
  if (currentRows.length === 0) throw new Error(`Person not found: ${id}`);
  const current = rowToPerson(currentRows[0]);

  // Build update fields
  const updates: Record<string, unknown> = {};

  if (data.fullName !== undefined) updates.fullName = data.fullName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.organizationId !== undefined) updates.organizationId = data.organizationId;
  if (data.roles !== undefined) updates.roles = data.roles;
  if (data.pipelineStage !== undefined) {
    updates.pipelineStage = data.pipelineStage;
    // Auto-set stageChangedDate when pipeline stage changes
    if (data.pipelineStage !== current.pipelineStage) {
      updates.stageChangedDate = getTodayCT();
    }
  }
  if (data.stageChangedDate !== undefined) updates.stageChangedDate = data.stageChangedDate;
  if (data.initialInvestmentTarget !== undefined) updates.initialInvestmentTarget = data.initialInvestmentTarget?.toString() ?? null;
  if (data.growthTarget !== undefined) updates.growthTarget = data.growthTarget?.toString() ?? null;
  if (data.committedAmount !== undefined) {
    updates.committedAmount = data.committedAmount?.toString() ?? null;
    // Auto-set commitmentDate when committedAmount changes
    if (data.committedAmount !== current.committedAmount) {
      updates.commitmentDate = getTodayCT();
    }
  }
  if (data.commitmentDate !== undefined) updates.commitmentDate = data.commitmentDate;
  if (data.nextActionType !== undefined) updates.nextActionType = data.nextActionType;
  if (data.nextActionDetail !== undefined) updates.nextActionDetail = data.nextActionDetail;
  if (data.nextActionDate !== undefined) updates.nextActionDate = data.nextActionDate;
  if (data.leadSource !== undefined) updates.leadSource = data.leadSource;
  if (data.assignedRepId !== undefined) updates.assignedRepId = data.assignedRepId;
  if (data.collaboratorIds !== undefined) updates.collaboratorIds = data.collaboratorIds;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.lostReason !== undefined) updates.lostReason = data.lostReason;
  if (data.reengageDate !== undefined) updates.reengageDate = data.reengageDate;
  if (data.contactType !== undefined) updates.contactType = data.contactType;
  if (data.contactCompany !== undefined) updates.contactCompany = data.contactCompany;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.people).set(updates).where(eq(schema.people.id, id));
  }

  const rows = await db.select().from(schema.people).where(eq(schema.people.id, id)).limit(1);
  return rowToPerson(rows[0]);
}

export async function searchPeople(db: NeonDb, query: string): Promise<PersonWithComputed[]> {
  return getPeople(db, { search: query });
}

export async function getRedFlags(db: NeonDb): Promise<PersonWithComputed[]> {
  const rows = await db.select().from(schema.people);
  const people = rows.map(rowToPerson).filter(
    (p) => (p.roles as string[]).includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
  );

  const enriched = await Promise.all(people.map((p) => enrichPerson(db, p)));
  return enriched
    .filter((p) => p.isStale || p.isOverdue)
    .sort((a, b) => (b.daysSinceLastTouch ?? 0) - (a.daysSinceLastTouch ?? 0));
}

export async function getUnassignedProspects(db: NeonDb): Promise<PersonWithComputed[]> {
  const rows = await db.select().from(schema.people);
  const people = rows.map(rowToPerson).filter(
    (p) =>
      (p.roles as string[]).includes("prospect") &&
      p.assignedRepId === null &&
      p.pipelineStage &&
      ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
  );
  return Promise.all(people.map((p) => enrichPerson(db, p)));
}
