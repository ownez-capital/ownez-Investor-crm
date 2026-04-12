/**
 * Feature flags for OwnEZ CRM.
 *
 * Every flag in this file must have an entry in
 * `docs/feature-flag-removal-checklist.md` listing every call site, so the
 * flag can be removed surgically once the feature is stabilized.
 *
 * Flags default to `off`. A flag is `on` only when the corresponding env var
 * is explicitly set to `"on"` (case-insensitive). All other values — including
 * unset, empty, "false", "0", "off" — count as `off`.
 *
 * Usage:
 *
 *   import { isCommitmentsV2Enabled } from "@/lib/feature-flags";
 *   if (isCommitmentsV2Enabled()) { ... }
 *
 * Never read `process.env.COMMITMENTS_V2` directly anywhere else in the codebase.
 * A single read site per flag is what makes surgical removal possible.
 */

function readBoolFlag(envVarName: string): boolean {
  const raw = process.env[envVarName];
  if (!raw) return false;
  return raw.trim().toLowerCase() === "on";
}

/**
 * COMMITMENTS_V2 — auditable Next Action lifecycle + inline Drop Lead.
 *
 * When ON:
 *   - Quick Log shows the F/P/R close-out prompt when an overdue open commitment exists
 *   - Next Action prompt includes the Drop Lead inline panel
 *   - Creating/updating a Next Action writes a Commitment Set activity row
 *   - Dashboard overdue/stale flags are computed from Commitment Set rows
 *   - Timeline renders commitment markers and fulfillment links
 *
 * When OFF:
 *   - Behavior matches the pre-feature implementation. Existing Commitment Set rows
 *     in the database are still stored but not written or read operationally.
 *
 * Removal checklist: docs/feature-flag-removal-checklist.md
 */
export function isCommitmentsV2Enabled(): boolean {
  return readBoolFlag("COMMITMENTS_V2");
}
