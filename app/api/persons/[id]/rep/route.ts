import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { getTodayCT } from "@/lib/format";
import { EMPTY_COMMITMENT_FIELDS } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { assignedRepId } = await request.json();

    const ds = await getDataService();
    const person = await ds.getPerson(id);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const oldRepName = person.assignedRepName ?? "Unassigned";

    // Get new rep name
    const users = await ds.getUsers();
    const newRep = assignedRepId ? users.find((u) => u.id === assignedRepId) : null;
    const newRepName = newRep?.fullName ?? "Unassigned";

    // Update person
    await ds.updatePerson(id, { assignedRepId: assignedRepId ?? null });

    // Auto-log reassignment activity
    const today = getTodayCT();
    await ds.createActivity(id, {
      activityType: "reassignment",
      source: "manual",
      date: today,
      time: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Chicago",
      }),
      outcome: "connected",
      detail: `Reassigned from ${oldRepName} to ${newRepName}`,
      documentsAttached: [],
      loggedById: session.userId,
      annotation: null,
      ...EMPTY_COMMITMENT_FIELDS,
    });

    revalidatePath(`/person/${id}`);
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
