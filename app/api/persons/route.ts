import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { getTodayCT } from "@/lib/format";
import { EMPTY_COMMITMENT_FIELDS } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const assignedRep = searchParams.get("assignedRep");
    const ds = await getDataService();
    const people = await ds.getPeople({
      roles: ["prospect"],
      ...(assignedRep === "unassigned" ? { assignedRepUnassigned: true } : {}),
      ...(assignedRep && assignedRep !== "unassigned" ? { assignedRepId: assignedRep } : {}),
    });
    return NextResponse.json(people);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const roles = body.roles ?? ["prospect"];
    const isProspect = roles.includes("prospect");

    const ds = await getDataService();
    const person = await ds.createPerson({
      fullName: body.fullName,
      phone: body.phone || null,
      email: body.email || null,
      roles,
      pipelineStage: isProspect ? "prospect" : (body.pipelineStage ?? null),
      leadSource: body.leadSource ?? null,
      nextActionType: body.nextActionType ?? null,
      nextActionDetail: body.nextActionDetail ?? null,
      nextActionDate: body.nextActionDate ?? null,
      assignedRepId: body.assignedRepId ?? (isProspect ? session.userId : null),
      contactType: body.contactType ?? null,
      contactCompany: body.contactCompany ?? null,
    });

    // Auto-log activity for prospects so the timeline is never empty
    if (isProspect) {
      const now = new Date();
      const currentTime = now.toLocaleTimeString("en-US", {
        hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago",
      });
      await ds.createActivity(person.id, {
        activityType: "note",
        source: "manual",
        date: getTodayCT(),
        time: currentTime,
        outcome: "connected",
        detail: `Prospect added to pipeline.`,
        documentsAttached: [],
        loggedById: session.userId,
        annotation: null,
        ...EMPTY_COMMITMENT_FIELDS,
      });
    }

    revalidatePath("/");
    revalidatePath("/pipeline");
    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
