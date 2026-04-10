import { NextResponse } from "next/server";
import { isCommitmentsV2Enabled } from "@/lib/feature-flags";

/**
 * GET /api/feature-flags
 *
 * Returns the current server-side feature flag state. Used by E2E tests
 * (and potentially client code) to decide whether to exercise v2 or legacy
 * code paths. Read-only, no auth required — returns only public boolean
 * flags, no secrets.
 *
 * Note: this route is NOT itself gated behind `isCommitmentsV2Enabled()`.
 * It must return an honest value regardless of the flag state so callers
 * like test 5B (flag-off regression) can detect the flag is off and run
 * their legacy-path assertions. Gating the probe would defeat its purpose.
 */
export async function GET() {
  return NextResponse.json({
    commitmentsV2: isCommitmentsV2Enabled(),
  });
}
