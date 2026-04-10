import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { getTodayCT } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/constants";
import { EMPTY_COMMITMENT_FIELDS } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();

    const {
      entityName,
      entityType,
      amountInvested,
      investmentDate,
      track,
      growthTarget,
    } = body;

    if (!entityName || !entityType || !amountInvested || !investmentDate) {
      return NextResponse.json(
        { error: "entityName, entityType, amountInvested, and investmentDate are required" },
        { status: 400 }
      );
    }

    const ds = await getDataService();
    const person = await ds.getPerson(id);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const today = getTodayCT();

    // Step 1: Create funding entity
    const entity = await ds.createFundingEntity({
      entityName,
      entityType,
      personId: id,
      status: "active",
      einTaxId: null,
      notes: null,
    });

    // Step 2: Create funded investment
    await ds.createFundedInvestment({
      fundingEntityId: entity.id,
      personId: id,
      amountInvested: Number(amountInvested),
      investmentDate,
      track: track ?? "maintain",
      growthTarget: growthTarget ? Number(growthTarget) : null,
      nextCheckInDate: investmentDate,
      notes: null,
    });

    // Step 3: Change stage to funded
    const oldStage = person.pipelineStage;
    await ds.updatePerson(id, {
      pipelineStage: "funded",
      stageChangedDate: today,
      roles: person.roles.includes("funded_investor")
        ? person.roles
        : [...person.roles.filter((r) => r !== "prospect"), "funded_investor"],
    });

    // Auto-log stage change
    const oldLabel = oldStage ? STAGE_LABELS[oldStage] : "None";
    await ds.createActivity(id, {
      activityType: "stage_change",
      source: "manual",
      date: today,
      time: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Chicago",
      }),
      outcome: "connected",
      detail: `Stage updated from ${oldLabel} to Funded — ${entityName} $${Number(amountInvested).toLocaleString()}`,
      documentsAttached: [],
      loggedById: session.userId,
      annotation: null,
      ...EMPTY_COMMITMENT_FIELDS,
    });

    revalidatePath(`/person/${id}`);
    revalidatePath("/");
    return NextResponse.json({ success: true, entityId: entity.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    console.error("[funded-investment] error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
