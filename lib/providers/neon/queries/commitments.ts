import { and, eq, sql } from "drizzle-orm";
import type { NeonDb } from "../db";
import * as schema from "../schema";
import type {
  Activity,
  CommitmentStatus,
  NextActionType,
  Person,
  LostReason,
} from "../../../types";
import { PIPELINE_STAGES } from "../../../constants";
import { getTodayCT } from "../../../format";
import { rowToActivity } from "./activities";

/**
 * Commitment lifecycle queries for the Neon provider.
 * Mirrors the mock provider semantics (lib/providers/mock.ts). See
 * DESIGN-SPEC.md §5.9 and §5.10 for the model.
 */

function timeCT(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

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

export async function getOpenCommitments(db: NeonDb, personId: string): Promise<Activity[]> {
  const rows = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.personId, personId),
        eq(schema.activities.activityType, "commitment_set"),
        eq(schema.activities.commitmentStatus, "open")
      )
    );

  return rows
    .map(rowToActivity)
    .sort((a, b) => (a.commitmentDueDate ?? "").localeCompare(b.commitmentDueDate ?? ""));
}

export async function createCommitment(
  db: NeonDb,
  personId: string,
  data: {
    commitmentType: NextActionType;
    commitmentDetail: string;
    commitmentDueDate: string;
    loggedById: string;
  }
): Promise<Activity> {
  const id = crypto.randomUUID();
  const today = getTodayCT();
  const time = timeCT();
  const detail = `Next action set: ${data.commitmentDetail}`;

  await db.execute(
    sql`INSERT INTO activities (
      id, person_id, activity_type, source, date, time, outcome, detail,
      documents_attached, logged_by_id, annotation,
      fulfills_commitment_id, commitment_type, commitment_detail,
      commitment_due_date, commitment_status, commitment_closed_date
    )
    VALUES (
      ${id}, ${personId}, 'commitment_set', 'manual', ${today}, ${time},
      'connected', ${detail}, '[]'::jsonb, ${data.loggedById}, NULL,
      NULL, ${data.commitmentType}, ${data.commitmentDetail},
      ${data.commitmentDueDate}, 'open', NULL
    )`
  );

  const rows = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.id, id))
    .limit(1);
  return rowToActivity(rows[0]);
}

export async function closeOutCommitment(
  db: NeonDb,
  commitmentId: string,
  resolution: {
    status: Exclude<CommitmentStatus, "open">;
    fulfilledByActivityId?: string;
    closedDate: string;
  }
): Promise<Activity> {
  // Fetch the commitment row
  const rows = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.id, commitmentId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Commitment ${commitmentId} not found`);
  }
  const commitment = rowToActivity(rows[0]);

  if (commitment.activityType !== "commitment_set") {
    throw new Error(`Activity ${commitmentId} is not a commitment`);
  }
  if (commitment.commitmentStatus !== "open") {
    throw new Error(
      `Commitment ${commitmentId} is not open (status: ${commitment.commitmentStatus})`
    );
  }

  // Transition to terminal state
  await db.execute(
    sql`UPDATE activities
        SET commitment_status = ${resolution.status},
            commitment_closed_date = ${resolution.closedDate}
        WHERE id = ${commitmentId}`
  );

  // Stamp the fulfilling activity if provided
  if (resolution.status === "fulfilled" && resolution.fulfilledByActivityId) {
    await db.execute(
      sql`UPDATE activities
          SET fulfills_commitment_id = ${commitmentId}
          WHERE id = ${resolution.fulfilledByActivityId}`
    );
  }

  const updated = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.id, commitmentId))
    .limit(1);
  return rowToActivity(updated[0]);
}

export async function dropLead(
  db: NeonDb,
  personId: string,
  data: {
    target: "dead" | "nurture";
    lostReason?: LostReason;
    reasonNote?: string;
    reengageDate?: string;
    loggedById: string;
  }
): Promise<Person> {
  const personRows = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, personId))
    .limit(1);
  if (personRows.length === 0) {
    throw new Error(`Person ${personId} not found`);
  }
  const person = rowToPerson(personRows[0]);
  const today = getTodayCT();
  const oldStage = person.pipelineStage;

  const nextLostReason = data.target === "dead" && data.lostReason ? data.lostReason : person.lostReason;
  const nextReengageDate = data.target === "nurture" && data.reengageDate ? data.reengageDate : person.reengageDate;

  // Update person: stage + clear next action + optional lostReason/reengageDate
  await db.execute(
    sql`UPDATE people
        SET pipeline_stage = ${data.target},
            stage_changed_date = ${today},
            next_action_type = NULL,
            next_action_detail = NULL,
            next_action_date = NULL,
            lost_reason = ${nextLostReason},
            reengage_date = ${nextReengageDate}
        WHERE id = ${personId}`
  );

  // Cancel all open commitments for this person
  await db.execute(
    sql`UPDATE activities
        SET commitment_status = 'cancelled',
            commitment_closed_date = ${today}
        WHERE person_id = ${personId}
          AND activity_type = 'commitment_set'
          AND commitment_status = 'open'`
  );

  // Auto-log stage change activity
  const oldLabel = oldStage
    ? PIPELINE_STAGES.find((s) => s.key === oldStage)?.label ?? oldStage
    : "None";
  const newLabel = data.target === "dead" ? "Dead" : "Nurture";
  const reasonSuffix = data.target === "dead" && data.reasonNote ? ` — ${data.reasonNote}` : "";
  const stageChangeId = crypto.randomUUID();
  const time = timeCT();
  const stageChangeDetail = `Stage updated from ${oldLabel} to ${newLabel}${reasonSuffix}`;

  await db.execute(
    sql`INSERT INTO activities (
      id, person_id, activity_type, source, date, time, outcome, detail,
      documents_attached, logged_by_id, annotation,
      fulfills_commitment_id, commitment_type, commitment_detail,
      commitment_due_date, commitment_status, commitment_closed_date
    )
    VALUES (
      ${stageChangeId}, ${personId}, 'stage_change', 'manual', ${today}, ${time},
      'connected', ${stageChangeDetail}, '[]'::jsonb, ${data.loggedById}, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL
    )`
  );

  // Return the updated person
  const updatedRows = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, personId))
    .limit(1);
  return rowToPerson(updatedRows[0]);
}
