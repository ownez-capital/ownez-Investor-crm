import { eq, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type { FundingEntity, FundedInvestment } from "../../../types";

function rowToFundingEntity(row: typeof schema.fundingEntities.$inferSelect): FundingEntity {
  return {
    id: row.id,
    entityName: row.entityName,
    entityType: row.entityType as FundingEntity["entityType"],
    personId: row.personId,
    status: row.status as FundingEntity["status"],
    einTaxId: row.einTaxId,
    notes: row.notes,
  };
}

function rowToFundedInvestment(row: typeof schema.fundedInvestments.$inferSelect): FundedInvestment {
  return {
    id: row.id,
    fundingEntityId: row.fundingEntityId,
    personId: row.personId,
    amountInvested: Number(row.amountInvested),
    investmentDate: row.investmentDate,
    track: row.track as FundedInvestment["track"],
    growthTarget: row.growthTarget ? Number(row.growthTarget) : null,
    nextCheckInDate: row.nextCheckInDate,
    notes: row.notes,
  };
}

export async function getFundingEntities(db: NeonDb, personId: string): Promise<FundingEntity[]> {
  const rows = await db
    .select()
    .from(schema.fundingEntities)
    .where(eq(schema.fundingEntities.personId, personId));
  return rows.map(rowToFundingEntity);
}

export async function createFundingEntity(
  db: NeonDb,
  data: Omit<FundingEntity, "id">
): Promise<FundingEntity> {
  const id = crypto.randomUUID();
  await db.insert(schema.fundingEntities).values({
    id,
    entityName: data.entityName,
    entityType: data.entityType,
    personId: data.personId,
    status: data.status,
    einTaxId: data.einTaxId,
    notes: data.notes,
  });

  const rows = await db.select().from(schema.fundingEntities).where(eq(schema.fundingEntities.id, id)).limit(1);
  return rowToFundingEntity(rows[0]);
}

export async function getFundedInvestments(db: NeonDb, personId: string): Promise<FundedInvestment[]> {
  const rows = await db
    .select()
    .from(schema.fundedInvestments)
    .where(eq(schema.fundedInvestments.personId, personId));
  return rows.map(rowToFundedInvestment);
}

export async function createFundedInvestment(
  db: NeonDb,
  data: Omit<FundedInvestment, "id">
): Promise<FundedInvestment> {
  const id = crypto.randomUUID();
  await db.insert(schema.fundedInvestments).values({
    id,
    fundingEntityId: data.fundingEntityId,
    personId: data.personId,
    amountInvested: data.amountInvested.toString(),
    investmentDate: data.investmentDate,
    track: data.track,
    growthTarget: data.growthTarget?.toString() ?? null,
    nextCheckInDate: data.nextCheckInDate,
    notes: data.notes,
  });

  const rows = await db.select().from(schema.fundedInvestments).where(eq(schema.fundedInvestments.id, id)).limit(1);
  return rowToFundedInvestment(rows[0]);
}
