import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDataService } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { isCommitmentsV2Enabled } from "@/lib/feature-flags";
import type { LostReason } from "@/lib/types";

/**
 * POST /api/persons/[id]/drop-lead
 *
 * Atomic drop-lead flow from the post-activity prompt. Updates pipeline stage,
 * clears next-action fields, cancels open commitments, and auto-logs a
 * stage_change activity. See DESIGN-SPEC §5.10.
 *
 * Gated behind COMMITMENTS_V2 — see docs/feature-flag-removal-checklist.md.
 *
 * Body (one of two shapes):
 *   { target: "dead"; lostReason: LostReason; reasonNote?: string }
 *   { target: "nurture"; reengageDate: string }
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

    const { target, lostReason, reasonNote, reengageDate } = body as {
      target?: "dead" | "nurture";
      lostReason?: LostReason;
      reasonNote?: string;
      reengageDate?: string;
    };

    if (target !== "dead" && target !== "nurture") {
      return NextResponse.json(
        { error: "target must be 'dead' or 'nurture'" },
        { status: 400 }
      );
    }
    if (target === "dead" && !lostReason) {
      return NextResponse.json(
        { error: "lostReason is required when target is 'dead'" },
        { status: 400 }
      );
    }
    if (target === "nurture" && !reengageDate) {
      return NextResponse.json(
        { error: "reengageDate is required when target is 'nurture'" },
        { status: 400 }
      );
    }

    const ds = await getDataService();
    const person = await ds.getPerson(id);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const updated = await ds.dropLead(id, {
      target,
      lostReason,
      reasonNote,
      reengageDate,
      loggedById: session.userId,
    });

    revalidatePath(`/person/${id}`);
    revalidatePath("/");
    return NextResponse.json({ person: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
