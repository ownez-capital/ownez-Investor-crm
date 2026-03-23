import { eq, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type {
  User,
  UserPermissions,
  LeadSourceConfig,
  PipelineStageConfig,
  PipelineStage,
  ActivityTypeConfig,
  SystemConfig,
} from "../../../types";

function rowToUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role as User["role"],
    isActive: row.isActive,
    passwordHash: row.passwordHash,
    permissions: (row.permissions as UserPermissions | null) ?? undefined,
  };
}

export async function getUsers(db: NeonDb): Promise<User[]> {
  const rows = await db.select().from(schema.users);
  return rows.map((r) => {
    const u = rowToUser(r);
    return { ...u, passwordHash: "" };
  });
}

export async function getUserByUsername(db: NeonDb, username: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

export async function updateUserPermissions(
  db: NeonDb,
  userId: string,
  permissions: UserPermissions
): Promise<User> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (rows.length === 0) throw new Error(`User not found: ${userId}`);

  await db
    .update(schema.users)
    .set({ permissions })
    .where(eq(schema.users.id, userId));

  const updated = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const u = rowToUser(updated[0]);
  return { ...u, passwordHash: "" };
}

export async function deactivateUser(
  db: NeonDb,
  userId: string,
  reassignToId?: string
): Promise<void> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (rows.length === 0) throw new Error(`User not found: ${userId}`);

  await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, userId));

  // Reassign prospects
  await db
    .update(schema.people)
    .set({ assignedRepId: reassignToId ?? null })
    .where(eq(schema.people.assignedRepId, userId));
}

// ─── Lead Source Config ───

export async function getLeadSources(
  db: NeonDb,
  opts?: { includeInactive?: boolean }
): Promise<LeadSourceConfig[]> {
  const rows = await db.select().from(schema.leadSourceConfigs);
  const sorted = rows
    .map((r) => ({
      key: r.key,
      label: r.label,
      order: r.order,
      isActive: r.isActive,
    }))
    .sort((a, b) => a.order - b.order);
  return opts?.includeInactive ? sorted : sorted.filter((s) => s.isActive);
}

export async function createLeadSource(
  db: NeonDb,
  data: { label: string }
): Promise<LeadSourceConfig> {
  const key = data.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const existing = await db.select().from(schema.leadSourceConfigs);
  const order = existing.length;

  const newSource = { key, label: data.label, order, isActive: true };
  await db.insert(schema.leadSourceConfigs).values(newSource);
  return newSource;
}

export async function updateLeadSource(
  db: NeonDb,
  key: string,
  data: Partial<Pick<LeadSourceConfig, "label" | "isActive">>
): Promise<LeadSourceConfig> {
  const rows = await db
    .select()
    .from(schema.leadSourceConfigs)
    .where(eq(schema.leadSourceConfigs.key, key))
    .limit(1);
  if (rows.length === 0) throw new Error(`Lead source not found: ${key}`);

  const updates: Record<string, unknown> = {};
  if (data.label !== undefined) updates.label = data.label;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.leadSourceConfigs)
      .set(updates)
      .where(eq(schema.leadSourceConfigs.key, key));
  }

  const updated = await db
    .select()
    .from(schema.leadSourceConfigs)
    .where(eq(schema.leadSourceConfigs.key, key))
    .limit(1);

  return {
    key: updated[0].key,
    label: updated[0].label,
    order: updated[0].order,
    isActive: updated[0].isActive,
  };
}

export async function reorderLeadSources(db: NeonDb, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i++) {
    await db
      .update(schema.leadSourceConfigs)
      .set({ order: i })
      .where(eq(schema.leadSourceConfigs.key, keys[i]));
  }
}

// ─── Pipeline Stage Config ───

export async function getPipelineStageConfigs(db: NeonDb): Promise<PipelineStageConfig[]> {
  const rows = await db.select().from(schema.pipelineStageConfigs);
  return rows
    .map((r) => ({
      key: r.key as PipelineStage,
      label: r.label,
      idleThreshold: r.idleThreshold,
      order: r.order,
    }))
    .sort((a, b) => a.order - b.order);
}

export async function updatePipelineStageConfig(
  db: NeonDb,
  key: PipelineStage,
  data: Partial<Pick<PipelineStageConfig, "label" | "idleThreshold">>
): Promise<PipelineStageConfig> {
  const rows = await db
    .select()
    .from(schema.pipelineStageConfigs)
    .where(eq(schema.pipelineStageConfigs.key, key))
    .limit(1);
  if (rows.length === 0) throw new Error(`Stage not found: ${key}`);

  const updates: Record<string, unknown> = {};
  if (data.label !== undefined) updates.label = data.label;
  if (data.idleThreshold !== undefined) updates.idleThreshold = data.idleThreshold;

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.pipelineStageConfigs)
      .set(updates)
      .where(eq(schema.pipelineStageConfigs.key, key));
  }

  const updated = await db
    .select()
    .from(schema.pipelineStageConfigs)
    .where(eq(schema.pipelineStageConfigs.key, key))
    .limit(1);

  return {
    key: updated[0].key as PipelineStage,
    label: updated[0].label,
    idleThreshold: updated[0].idleThreshold,
    order: updated[0].order,
  };
}

// ─── Activity Type Config ───

export async function getActivityTypeConfigs(db: NeonDb): Promise<ActivityTypeConfig[]> {
  const rows = await db.select().from(schema.activityTypeConfigs);
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    isActive: r.isActive,
    isSystem: r.isSystem,
  }));
}

export async function updateActivityTypeConfig(
  db: NeonDb,
  key: string,
  data: Partial<Pick<ActivityTypeConfig, "label" | "isActive">>
): Promise<ActivityTypeConfig> {
  const rows = await db
    .select()
    .from(schema.activityTypeConfigs)
    .where(eq(schema.activityTypeConfigs.key, key))
    .limit(1);
  if (rows.length === 0) throw new Error(`Activity type not found: ${key}`);
  if (rows[0].isSystem) throw new Error(`System activity types cannot be modified`);

  const updates: Record<string, unknown> = {};
  if (data.label !== undefined) updates.label = data.label;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.activityTypeConfigs)
      .set(updates)
      .where(eq(schema.activityTypeConfigs.key, key));
  }

  const updated = await db
    .select()
    .from(schema.activityTypeConfigs)
    .where(eq(schema.activityTypeConfigs.key, key))
    .limit(1);

  return {
    key: updated[0].key,
    label: updated[0].label,
    isActive: updated[0].isActive,
    isSystem: updated[0].isSystem,
  };
}

export async function createActivityType(
  db: NeonDb,
  data: { label: string }
): Promise<ActivityTypeConfig> {
  const key = data.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const newType = { key, label: data.label, isActive: true, isSystem: false };
  await db.insert(schema.activityTypeConfigs).values(newType);
  return newType;
}

// ─── System Config ───

export async function getSystemConfig(db: NeonDb): Promise<SystemConfig> {
  const rows = await db.select().from(schema.systemConfig).limit(1);
  if (rows.length === 0) {
    return { fundTarget: 10_500_000, companyName: "OwnEZ Capital", defaultRepId: null };
  }
  return {
    fundTarget: Number(rows[0].fundTarget),
    companyName: rows[0].companyName,
    defaultRepId: rows[0].defaultRepId,
  };
}

export async function updateSystemConfig(
  db: NeonDb,
  data: Partial<SystemConfig>
): Promise<SystemConfig> {
  const current = await getSystemConfig(db);
  const updated = { ...current, ...data };

  await db
    .update(schema.systemConfig)
    .set({
      fundTarget: updated.fundTarget.toString(),
      companyName: updated.companyName,
      defaultRepId: updated.defaultRepId,
    })
    .where(eq(schema.systemConfig.id, "default"));

  return updated;
}
