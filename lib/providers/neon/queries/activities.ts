import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type { Activity, ActivityFilters, RecentActivityFilters, RecentActivityEntry } from "../../../types";
import { getTodayCT } from "../../../format";

function rowToActivity(row: typeof schema.activities.$inferSelect): Activity {
  return {
    id: row.id,
    personId: row.personId,
    activityType: row.activityType as Activity["activityType"],
    source: row.source as Activity["source"],
    date: row.date,
    time: row.time,
    outcome: row.outcome as Activity["outcome"],
    detail: row.detail,
    documentsAttached: row.documentsAttached as string[],
    loggedById: row.loggedById,
    annotation: row.annotation,
  };
}

export async function getActivities(
  db: NeonDb,
  personId: string,
  filters?: ActivityFilters
): Promise<Activity[]> {
  const rows = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.personId, personId));

  let result = rows.map(rowToActivity);

  if (filters?.activityTypes?.length) {
    result = result.filter((a) => filters.activityTypes!.includes(a.activityType));
  }
  if (filters?.dateFrom) {
    result = result.filter((a) => a.date >= filters.dateFrom!);
  }
  if (filters?.dateTo) {
    result = result.filter((a) => a.date <= filters.dateTo!);
  }

  // Sort by date DESC then time DESC
  result.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.time ?? "").localeCompare(a.time ?? "");
  });

  return result;
}

export async function getRecentActivities(
  db: NeonDb,
  filters?: RecentActivityFilters
): Promise<RecentActivityEntry[]> {
  const limit = filters?.limit ?? 20;
  const today = getTodayCT();
  const sevenDaysAgo = new Date(new Date(today + "T00:00:00").getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const rows = await db.select().from(schema.activities);
  let result = rows.map(rowToActivity);

  result = result
    .filter((a) => a.date >= (filters?.dateFrom ?? sevenDaysAgo))
    .filter((a) => !filters?.dateTo || a.date <= filters.dateTo)
    .filter((a) => !filters?.repId || a.loggedById === filters.repId)
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return (b.time ?? "").localeCompare(a.time ?? "");
    })
    .slice(0, limit);

  // Get person names
  const personIds = [...new Set(result.map((a) => a.personId))];
  const personMap = new Map<string, string>();
  if (personIds.length > 0) {
    const people = await db.select({ id: schema.people.id, fullName: schema.people.fullName }).from(schema.people);
    for (const p of people) {
      personMap.set(p.id, p.fullName);
    }
  }

  return result.map((a) => ({
    ...a,
    personName: personMap.get(a.personId) ?? "Unknown",
    personId: a.personId,
  }));
}

export async function createActivity(
  db: NeonDb,
  personId: string,
  data: Omit<Activity, "id" | "personId">
): Promise<Activity> {
  const id = crypto.randomUUID();

  await db.execute(
    sql`INSERT INTO activities (id, person_id, activity_type, source, date, time, outcome, detail, documents_attached, logged_by_id, annotation)
    VALUES (${id}, ${personId}, ${data.activityType}, ${data.source}, ${data.date}, ${data.time}, ${data.outcome}, ${data.detail}, ${JSON.stringify(data.documentsAttached)}::jsonb, ${data.loggedById}, ${data.annotation})`
  );

  const rows = await db.select().from(schema.activities).where(eq(schema.activities.id, id)).limit(1);
  return rowToActivity(rows[0]);
}
