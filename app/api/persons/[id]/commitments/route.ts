import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { isCommitmentsV2Enabled } from "@/lib/feature-flags";
import type { NextActionType } from "@/lib/types";

/**
 * POST /api/persons/[id]/commitments
 *
 * Creates a new Commitment Set activity row AND denormalizes the fields onto
 * Person.nextAction* for backwards compatibility with the legacy dashboard.
 * Gated behind COMMITMENTS_V2 — see docs/feature-flag-removal-checklist.md.
 *
 * Body:
 *   {
 *     commitmentType: NextActionType;
 *     commitmentDetail: string;
 *     commitmentDueDate: string;  // YYYY-MM-DD, CT
 *   }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCommitmentsV2Enabled()) {
    return NextResponse.json(
      { error: "Commitments v2 feature is not enabled" },
      { status: 501 }
    );
  }

  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();

    const { commitmentType, commitmentDetail, commitmentDueDate } = body as {
      commitmentType?: NextActionType;
      commitmentDetail?: string;
      commitmentDueDate?: string;
    };

    if (!commitmentType || !commitmentDetail || !commitmentDueDate) {
      return NextResponse.json(
        { error: "commitmentType, commitmentDetail, and commitmentDueDate are required" },
        { status: 400 }
      );
    }

    const ds = await getDataService();
    const person = await ds.getPerson(id);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Create the Commitment Set activity row.
    const commitment = await ds.createCommitment(id, {
      commitmentType,
      commitmentDetail,
      commitmentDueDate,
      loggedById: session.userId,
    });

    // Mirror to Person.nextAction* so legacy code paths (pre-flag-flip) and
    // any remaining UI that reads from Person still render correctly.
    await ds.updatePerson(id, {
      nextActionType: commitmentType,
      nextActionDetail: commitmentDetail,
      nextActionDate: commitmentDueDate,
    });

    revalidatePath(`/person/${id}`);
    revalidatePath("/");
    return NextResponse.json({ commitment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
