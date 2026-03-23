import { eq, ilike, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type { Organization } from "../../../types";

function rowToOrg(row: typeof schema.organizations.$inferSelect): Organization {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Organization["type"],
    notes: row.notes,
  };
}

export async function getOrganizations(db: NeonDb): Promise<Organization[]> {
  const rows = await db.select().from(schema.organizations);
  return rows.map(rowToOrg);
}

export async function searchOrganizations(db: NeonDb, query: string): Promise<Organization[]> {
  const rows = await db
    .select()
    .from(schema.organizations)
    .where(ilike(schema.organizations.name, `%${query}%`));
  return rows.map(rowToOrg);
}

export async function createOrganization(
  db: NeonDb,
  data: Omit<Organization, "id">
): Promise<Organization> {
  const id = crypto.randomUUID();
  await db.insert(schema.organizations).values({
    id,
    name: data.name,
    type: data.type,
    notes: data.notes,
  });

  const rows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1);
  return rowToOrg(rows[0]);
}
