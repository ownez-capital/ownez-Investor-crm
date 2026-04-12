import type { PipelineStage, ActivityType } from "./types";

export const TIMEZONE = "America/Chicago";

export const PIPELINE_STAGES: {
  key: PipelineStage;
  label: string;
  idleThreshold: number | null;
  order: number;
}[] = [
  { key: "prospect", label: "Prospect", idleThreshold: 10, order: 1 },
  { key: "initial_contact", label: "Initial Contact", idleThreshold: 5, order: 2 },
  { key: "discovery", label: "Discovery", idleThreshold: 5, order: 3 },
  { key: "pitch", label: "Pitch", idleThreshold: 7, order: 4 },
  { key: "active_engagement", label: "Active Engagement", idleThreshold: 14, order: 5 },
  { key: "soft_commit", label: "Soft Commit", idleThreshold: 5, order: 6 },
  { key: "commitment_processing", label: "Commitment Processing", idleThreshold: 5, order: 7 },
  { key: "kyc_docs", label: "KYC/Docs", idleThreshold: 3, order: 8 },
  { key: "funded", label: "Funded", idleThreshold: null, order: 9 },
  { key: "nurture", label: "Nurture", idleThreshold: null, order: 10 },
  { key: "dead", label: "Dead", idleThreshold: null, order: 11 },
];

export const ACTIVE_PIPELINE_STAGES: PipelineStage[] = [
  "prospect",
  "initial_contact",
  "discovery",
  "pitch",
  "active_engagement",
  "soft_commit",
  "commitment_processing",
  "kyc_docs",
];

export const COMMITTED_STAGES: PipelineStage[] = [
  "soft_commit",
  "commitment_processing",
  "kyc_docs",
];

export const INACTIVE_STAGES: PipelineStage[] = ["nurture", "dead", "funded"];

export const TOUCH_ACTIVITY_TYPES: ActivityType[] = [
  "call",
  "email",
  "meeting",
  "note",
  "text_message",
  "linkedin_message",
  "whatsapp",
  "document_sent",
  "document_received",
];

/**
 * Activity types that are treated as audit markers rather than engagement signals.
 * Excluded from Days Since Last Touch and activity count calculations.
 * See DESIGN-SPEC §5.2.
 */
export const AUDIT_MARKER_ACTIVITY_TYPES: ActivityType[] = [
  "stage_change",
  "reassignment",
  "commitment_set",
];

export const NEXT_ACTION_TYPES: { key: string; label: string }[] = [
  { key: "follow_up", label: "Follow Up" },
  { key: "schedule_meeting", label: "Schedule Meeting" },
  { key: "send_document", label: "Send Document" },
  { key: "request_info", label: "Request Info" },
  { key: "make_introduction", label: "Make Introduction" },
  { key: "internal_review", label: "Internal Review" },
  { key: "other", label: "Other" },
];

export const LEAD_SOURCES: { key: string; label: string }[] = [
  { key: "velocis_network", label: "Velocis Network" },
  { key: "cpa_referral", label: "CPA Referral" },
  { key: "legacy_event", label: "Legacy Event" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "ken_dbj_list", label: "Ken — DBJ List" },
  { key: "ken_event_followup", label: "Ken — Event Follow-up" },
  { key: "tolleson_wm", label: "Tolleson WM" },
  { key: "ma_attorney", label: "M&A Attorney" },
  { key: "cold_outreach", label: "Cold Outreach" },
  { key: "other", label: "Other" },
];

export const LEAD_SOURCE_GROUPS: { label: string; sources: string[] }[] = [
  { label: "Referral", sources: ["cpa_referral", "ma_attorney", "tolleson_wm", "ken_dbj_list", "ken_event_followup"] },
  { label: "Network / Event", sources: ["velocis_network", "legacy_event"] },
  { label: "Direct", sources: ["linkedin", "cold_outreach", "other"] },
];

export const ACTIVITY_TYPES: {
  key: ActivityType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: "call", label: "Call", icon: "Phone", color: "var(--color-activity-call)" },
  { key: "email", label: "Email", icon: "Mail", color: "var(--color-activity-email)" },
  { key: "meeting", label: "Meeting", icon: "Users", color: "var(--color-activity-meeting)" },
  { key: "note", label: "Note", icon: "StickyNote", color: "var(--color-activity-note)" },
  { key: "text_message", label: "Text", icon: "MessageSquare", color: "var(--color-activity-text)" },
  { key: "linkedin_message", label: "LinkedIn", icon: "Linkedin", color: "var(--color-activity-linkedin)" },
  { key: "whatsapp", label: "WhatsApp", icon: "MessageCircle", color: "var(--color-activity-whatsapp)" },
  { key: "document_sent", label: "Doc Sent", icon: "FileUp", color: "var(--color-activity-doc)" },
  { key: "document_received", label: "Doc Received", icon: "FileDown", color: "var(--color-activity-doc)" },
  { key: "stage_change", label: "Stage Change", icon: "ArrowRight", color: "var(--color-activity-stage)" },
  { key: "reassignment", label: "Reassignment", icon: "UserPlus", color: "var(--color-activity-stage)" },
  { key: "commitment_set", label: "Next Action Set", icon: "Target", color: "var(--color-activity-stage)" },
];

export const LOST_REASONS: { key: string; label: string }[] = [
  { key: "not_accredited", label: "Not Accredited" },
  { key: "not_interested", label: "Not Interested" },
  { key: "ghosted", label: "Ghosted" },
  { key: "timing", label: "Timing" },
  { key: "went_elsewhere", label: "Went Elsewhere" },
  { key: "other", label: "Other" },
];

export const STAGE_LABELS: Record<PipelineStage, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.label])
) as Record<PipelineStage, string>;

export const LEAD_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_SOURCES.map((s) => [s.key, s.label])
);
