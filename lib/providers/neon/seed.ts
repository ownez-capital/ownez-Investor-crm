import { hashSync } from "bcryptjs";
import { PIPELINE_STAGES } from "../../constants";
import type { NeonDb } from "./db";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

export async function seedDatabase(db: NeonDb): Promise<void> {
  // Check if already seeded
  const existingUsers = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existingUsers.length > 0) return;

  // ─── Seed Users ───
  const userSeeds = [
    { id: "u-chad", username: "chad", fullName: "Chad Cormier", role: "rep", envKey: "SEED_PASSWORD_CHAD" },
    { id: "u-ken", username: "ken", fullName: "Ken Warsaw", role: "marketing", envKey: "SEED_PASSWORD_KEN" },
    { id: "u-eric", username: "eric", fullName: "Eric Gewirtzman", role: "admin", envKey: "SEED_PASSWORD_ERIC" },
    { id: "u-efri", username: "efri", fullName: "Efri Argaman", role: "admin", envKey: "SEED_PASSWORD_EFRI" },
  ];

  for (const u of userSeeds) {
    const password = process.env[u.envKey];
    if (!password) {
      throw new Error(`Missing env var: ${u.envKey}`);
    }
    const passwordHash = hashSync(password, 10);
    await db
      .insert(schema.users)
      .values({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        isActive: true,
        passwordHash,
        permissions: null,
      })
      .onConflictDoNothing();
  }

  // ─── Seed Pipeline Stage Configs ───
  for (const stage of PIPELINE_STAGES) {
    await db
      .insert(schema.pipelineStageConfigs)
      .values({
        key: stage.key,
        label: stage.label,
        idleThreshold: stage.idleThreshold,
        order: stage.order,
      })
      .onConflictDoNothing();
  }

  // ─── Seed Activity Type Configs (all 11) ───
  const activityTypes = [
    { key: "call", label: "Call", isActive: true, isSystem: false },
    { key: "email", label: "Email", isActive: true, isSystem: false },
    { key: "meeting", label: "Meeting", isActive: true, isSystem: false },
    { key: "note", label: "Note", isActive: true, isSystem: false },
    { key: "text_message", label: "Text Message", isActive: true, isSystem: false },
    { key: "linkedin_message", label: "LinkedIn Message", isActive: true, isSystem: false },
    { key: "whatsapp", label: "WhatsApp", isActive: true, isSystem: false },
    { key: "document_sent", label: "Document Sent", isActive: true, isSystem: false },
    { key: "document_received", label: "Document Received", isActive: true, isSystem: false },
    { key: "stage_change", label: "Stage Change", isActive: true, isSystem: true },
    { key: "reassignment", label: "Reassignment", isActive: true, isSystem: true },
  ];

  for (const at of activityTypes) {
    await db
      .insert(schema.activityTypeConfigs)
      .values(at)
      .onConflictDoNothing();
  }

  // ─── Seed System Config (single row) ───
  await db
    .insert(schema.systemConfig)
    .values({
      id: "default",
      fundTarget: "10500000",
      companyName: "OwnEZ Capital",
      defaultRepId: "u-chad",
    })
    .onConflictDoNothing();

  // NOTE: Do NOT seed lead_source_configs — production starts empty
  // NOTE: Do NOT seed any business data (people, orgs, activities, etc.)
}
