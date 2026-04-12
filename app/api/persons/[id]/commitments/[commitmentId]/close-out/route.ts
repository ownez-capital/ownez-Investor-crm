import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { isCommitmentsV2Enabled } from "@/lib/feature-flags";
import { getTodayCT } from "@/lib/format";
import type { CommitmentStatus } from "@/lib/types";

/**
 * POST /api/persons/[id]/commitments/[commitmentId]/close-out
 *
 * Transitions an open Commitment Set row to a terminal state:
 *   - fulfilled  (user picked F) — also stamps fulfillsCommitmentId on the
 *                 fulfilling activity if fulfilledByActivityId is provided
 *   - superseded (user picked R)
 *   - cancelled  (lead was dropped — usually called from the drop-lead route
 *                 rather than directly, but supported here too)
 *
 * "Still pending" (user picked P) does NOT call this endpoint — the caller
 * simply leaves the commitment open and logs their activity normally. That's
 * what produces the "honest red" dashboard state (canary scenario 2B).
 *
 * Gated behind COMMITMENTS_V2 — see docs/feature-flag-removal-checklist.md.
 *
 * Body:
 *   {
 *     status: "fulfilled" | "superseded" | "cancelled";
 *     fulfilledByActivityId?: string;  // required when status === "fulfilled"
 *   }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commitmentId: string }> }
) {
  if (!isCommitmentsV2Enabled()) {
    return NextResponse.json(
      { error: "Commitments v2 feature is not enabled" },
      { status: 501 }
    );
  }

  try {
    await requireSession();
    const { id, commitmentId } = await params;
    const body = await request.json();

    const { status, fulfilledByActivityId } = body as {
      status?: Exclude<CommitmentStatus, "open">;
      fulfilledByActivityId?: string;
    };

    if (!status || !["fulfilled", "superseded", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "status must be one of: fulfilled, superseded, cancelled" },
        { status: 400 }
      );
    }
    if (status === "fulfilled" && !fulfilledByActivityId) {
      return NextResponse.json(
        { error: "fulfilledByActivityId is required when status is fulfilled" },
        { status: 400 }
      );
    }

    const ds = await getDataService();
    const updated = await ds.closeOutCommitment(commitmentId, {
      status,
      fulfilledByActivityId,
      closedDate: getTodayCT(),
    });

    revalidatePath(`/person/${id}`);
    revalidatePath("/");
    return NextResponse.json({ commitment: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
