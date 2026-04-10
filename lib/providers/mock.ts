import type {
  Person, Organization, FundingEntity, Activity, FundedInvestment, User,
  ReferrerLink, RelatedContactLink, PersonWithComputed, DashboardStats,
  PeopleFilters, ActivityFilters, RecentActivityFilters, RecentActivityEntry,
  DataService, PipelineStage, SystemConfig, ReferrerStats,
  LeadershipStats, FunnelStage, SourceROIRow, DrilldownProspectFilter,
  DrilldownActivityFilter, LeadSourceConfig, UserPermissions,
  PipelineStageConfig, ActivityTypeConfig,
} from "../types";
import { ACTIVE_PIPELINE_STAGES, COMMITTED_STAGES, TOUCH_ACTIVITY_TYPES, LEAD_SOURCES, PIPELINE_STAGES } from "../constants";
import { computeDaysSinceLastTouch, computeIsStale, computeIsOverdue } from "../stale";
import { getTodayCT } from "../format";
import { hashSync } from "bcryptjs";

// ─── Password hashes ───
const PW_HASH = hashSync("password123", 10);

// ─── Users ───
// Note: arrays are `let` so resetData() can restore them to initial state
let users: User[] = [
  { id: "u-chad", username: "chad", fullName: "Chad Cormier", role: "rep", isActive: true, passwordHash: PW_HASH },
  { id: "u-ken", username: "ken", fullName: "Ken Warsaw", role: "marketing", isActive: true, passwordHash: PW_HASH },
  { id: "u-eric", username: "eric", fullName: "Eric Gewirtzman", role: "admin", isActive: true, passwordHash: PW_HASH },
  { id: "u-efri", username: "efri", fullName: "Efri Argaman", role: "admin", isActive: true, passwordHash: PW_HASH },
];

// ─── Lead Source Configs (seeded from constants) ───
let leadSourceConfigs: LeadSourceConfig[] = LEAD_SOURCES.map((s, i) => ({
  key: s.key,
  label: s.label,
  order: i,
  isActive: true,
}));

const INITIAL_LEAD_SOURCE_CONFIGS = JSON.stringify(leadSourceConfigs);

// ─── System Config ───
let systemConfig: SystemConfig = {
  fundTarget: 10_500_000,
  companyName: "OwnEZ Capital",
  defaultRepId: "u-chad",
};

const INITIAL_SYSTEM_CONFIG = JSON.stringify(systemConfig);

// ─── Pipeline Stage Configs ───
let pipelineStageConfigs: PipelineStageConfig[] = PIPELINE_STAGES.map((s) => ({
  key: s.key,
  label: s.label,
  idleThreshold: s.idleThreshold,
  order: s.order,
}));

const INITIAL_PIPELINE_STAGE_CONFIGS = JSON.stringify(pipelineStageConfigs);

// ─── Activity Type Configs ───
const SYSTEM_ACTIVITY_TYPES = ["stage_change", "reassignment"];
let activityTypeConfigs: ActivityTypeConfig[] = [
  { key: "call", label: "Call", isActive: true, isSystem: false },
  { key: "email", label: "Email", isActive: true, isSystem: false },
  { key: "meeting", label: "Meeting", isActive: true, isSystem: false },
  { key: "note", label: "Note", isActive: true, isSystem: false },
  { key: "text_message", label: "Text Message", isActive: true, isSystem: false },
  { key: "linkedin_message", label: "LinkedIn Message", isActive: true, isSystem: false },
  { key: "whatsapp", label: "WhatsApp", isActive: true, isSystem: false },
  { key: "document_sent", label: "Document Sent", isActive: true, isSystem: false },
  { key: "document_received", label: "Document Received", isActive: true, isSystem: false },
  { key: "stage_change", label: "Stage Change", isActive: true, isSystem: true },
  { key: "reassignment", label: "Reassignment", isActive: true, isSystem: true },
];

const INITIAL_ACTIVITY_TYPE_CONFIGS = JSON.stringify(activityTypeConfigs);

// ─── Organizations ───
let organizations: Organization[] = [
  { id: "org-1", name: "Calloway Family Office", type: "family_office", notes: null },
  { id: "org-2", name: "Kim Holdings LLC", type: "corporate", notes: null },
  { id: "org-3", name: "Thornton Capital", type: "corporate", notes: null },
  { id: "org-4", name: "Wells Family Trust", type: "family_office", notes: null },
  { id: "org-5", name: "MJ Ventures", type: "corporate", notes: null },
  { id: "org-6", name: "Whitfield Enterprises", type: "corporate", notes: null },
  { id: "org-7", name: "Torres Family Office", type: "family_office", notes: null },
  { id: "org-8", name: "Huang Capital Partners", type: "corporate", notes: null },
  { id: "org-9", name: "Grant Holdings", type: "corporate", notes: null },
  { id: "org-10", name: "Blake Trust", type: "family_office", notes: null },
  { id: "org-11", name: "Park Capital", type: "corporate", notes: null },
  { id: "org-12", name: "Adams Family Trust", type: "family_office", notes: null },
  { id: "org-13", name: "Morrison Family Trust", type: "family_office", notes: null },
  { id: "org-14", name: "Chang Investments", type: "corporate", notes: null },
  { id: "org-15", name: "Reeves Capital", type: "corporate", notes: null },
  { id: "org-16", name: "Whitley Penn", type: "corporate", notes: "CPA firm" },
];

// ─── People (12 Prospects + 3 Funded + 5 External) ───
let people: Person[] = [
  // === 12 PROSPECTS ===
  {
    id: "p-robert", fullName: "Robert Calloway", createdDate: "2026-01-10",
    email: "rcalloway@callowayfo.com", phone: "(214) 555-0142", organizationId: "org-1",
    roles: ["prospect"], pipelineStage: "active_engagement", stageChangedDate: "2026-02-05",
    initialInvestmentTarget: 500000, growthTarget: 1500000, committedAmount: null, commitmentDate: null,
    nextActionType: "send_document", nextActionDetail: "Send Q3 performance deck", nextActionDate: "2026-03-17",
    leadSource: "velocis_network", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Interested after Velocis event. Wants to see historical returns by vintage year before committing. Wife is also involved in financial decisions.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-sandra", fullName: "Sandra Kim", createdDate: "2025-12-15",
    email: "skim@kimholdings.com", phone: "(214) 555-0198", organizationId: "org-2",
    roles: ["prospect"], pipelineStage: "soft_commit", stageChangedDate: "2026-02-18",
    initialInvestmentTarget: 250000, growthTarget: null, committedAmount: 250000, commitmentDate: "2026-02-18",
    nextActionType: "request_info", nextActionDetail: "Confirm entity for investment", nextActionDate: "2026-02-27",
    leadSource: "cpa_referral", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Committed $250K verbally. Checking with attorney on entity structure. CPA is Mike Lawson at Whitley Penn.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-david", fullName: "David Thornton", createdDate: "2026-02-10",
    email: "dthornton@thorntoncap.com", phone: "(972) 555-0234", organizationId: "org-3",
    roles: ["prospect"], pipelineStage: "discovery", stageChangedDate: "2026-02-20",
    initialInvestmentTarget: 500000, growthTarget: 2000000, committedAmount: null, commitmentDate: null,
    nextActionType: "schedule_meeting", nextActionDetail: "Discovery meeting — 2:00 PM today", nextActionDate: "2026-02-25",
    leadSource: "ma_attorney", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Recently exited $12M manufacturing business. Looking for passive yield. Doesn't want to manage RE directly. Very high potential.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-patricia", fullName: "Patricia Wells", createdDate: "2026-01-20",
    email: "pwells@wellstrust.com", phone: "(214) 555-0311", organizationId: "org-4",
    roles: ["prospect"], pipelineStage: "pitch", stageChangedDate: "2026-02-14",
    initialInvestmentTarget: 750000, growthTarget: 750000, committedAmount: null, commitmentDate: null,
    nextActionType: "follow_up", nextActionDetail: "Follow up on pitch — no response yet", nextActionDate: "2026-02-24",
    leadSource: "legacy_event", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Third-generation wealth. Very conservative. Needs peer validation before committing — asked if she could speak with an existing investor.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-marcus", fullName: "Marcus Johnson", createdDate: "2026-01-05",
    email: "mjohnson@mjventures.com", phone: "(469) 555-0178", organizationId: "org-5",
    roles: ["prospect"], pipelineStage: "active_engagement", stageChangedDate: "2026-02-06",
    initialInvestmentTarget: 300000, growthTarget: 800000, committedAmount: null, commitmentDate: null,
    nextActionType: "make_introduction", nextActionDetail: "Invite to investor dinner March 5", nextActionDate: "2026-03-01",
    leadSource: "linkedin", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Owns 12 rental properties. Interested in passive alternative but wants to see one more quarter of performance. Patient approach.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-whitfield", fullName: "James Whitfield", createdDate: "2025-11-20",
    email: "jwhitfield@whitfield.com", phone: "(214) 555-0456", organizationId: "org-6",
    roles: ["prospect"], pipelineStage: "commitment_processing", stageChangedDate: "2026-02-15",
    initialInvestmentTarget: 500000, growthTarget: 1000000, committedAmount: 500000, commitmentDate: "2026-02-01",
    nextActionType: "follow_up", nextActionDetail: "Check with attorney on LLC docs", nextActionDate: "2026-02-28",
    leadSource: "velocis_network", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Setting up new LLC for investment. Attorney is reviewing sub docs. Needs 5 more business days. Very methodical.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-torres", fullName: "Angela Torres", createdDate: "2025-11-10",
    email: "atorres@torresfam.com", phone: "(214) 555-0567", organizationId: "org-7",
    roles: ["prospect"], pipelineStage: "kyc_docs", stageChangedDate: "2026-02-20",
    initialInvestmentTarget: 350000, growthTarget: null, committedAmount: 350000, commitmentDate: "2026-01-20",
    nextActionType: "follow_up", nextActionDetail: "Follow up on passport upload in Agora", nextActionDate: "2026-02-26",
    leadSource: "cpa_referral", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Moved to Agora for KYC. Waiting on passport upload. Everything else complete.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-huang", fullName: "Richard Huang", createdDate: "2026-02-22",
    email: "rhuang@huangcapital.com", phone: "(214) 555-0134", organizationId: "org-8",
    roles: ["prospect"], pipelineStage: "prospect", stageChangedDate: "2026-02-22",
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: "other", nextActionDetail: "Research background, prep outreach", nextActionDate: "2026-02-27",
    leadSource: "ken_dbj_list", assignedRepId: "u-chad", collaboratorIds: ["u-ken"],
    notes: "Recently sold tech company. Ken flagged as high-value target from DBJ list.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-grant", fullName: "William Grant", createdDate: "2026-02-18",
    email: "wgrant@grantholdings.com", phone: "(214) 555-0789", organizationId: "org-9",
    roles: ["prospect"], pipelineStage: "initial_contact", stageChangedDate: "2026-02-23",
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: "follow_up", nextActionDetail: "Schedule intro call", nextActionDate: "2026-02-26",
    leadSource: "tolleson_wm", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Tolleson advisor made warm intro. Left voicemail, sent follow-up email.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-blake", fullName: "Catherine Blake", createdDate: "2025-12-01",
    email: "cblake@blaketrust.com", phone: "(972) 555-0321", organizationId: "org-10",
    roles: ["prospect"], pipelineStage: "nurture", stageChangedDate: "2026-01-20",
    initialInvestmentTarget: 200000, growthTarget: 500000, committedAmount: null, commitmentDate: null,
    nextActionType: "follow_up", nextActionDetail: "Re-engage after tax season", nextActionDate: "2026-04-15",
    leadSource: "legacy_event", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Interested but completely tied up through April with tax season. Re-engage mid-April.",
    lostReason: null, reengageDate: "2026-04-15", contactType: null, contactCompany: null,
  },
  {
    id: "p-park", fullName: "Thomas Park", createdDate: "2025-12-10",
    email: null, phone: null, organizationId: "org-11",
    roles: ["prospect"], pipelineStage: "dead", stageChangedDate: "2026-01-15",
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: "cold_outreach", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Not accredited. Friendly conversation but doesn't meet requirements.",
    lostReason: "not_accredited", reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-rachel", fullName: "Rachel Adams", createdDate: "2026-01-15",
    email: "radams@adamstrust.com", phone: "(214) 555-0654", organizationId: "org-12",
    roles: ["prospect"], pipelineStage: "active_engagement", stageChangedDate: "2026-02-12",
    initialInvestmentTarget: 250000, growthTarget: 750000, committedAmount: null, commitmentDate: null,
    nextActionType: "send_document", nextActionDetail: "Send case study — similar investor profile", nextActionDate: "2026-02-28",
    leadSource: "ken_event_followup", assignedRepId: "u-chad", collaboratorIds: ["u-ken"],
    notes: "Met at Dallas RE event. Ken qualified and did warm handoff to Chad. Very engaged, asks smart questions about ITIN lending.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  // === 3 FUNDED INVESTORS ===
  {
    id: "p-morrison", fullName: "Steven Morrison", createdDate: "2025-10-01",
    email: "smorrison@morrisontrust.com", phone: "(214) 555-0901", organizationId: "org-13",
    roles: ["funded_investor"], pipelineStage: "funded", stageChangedDate: "2026-01-15",
    initialInvestmentTarget: 500000, growthTarget: null, committedAmount: 500000, commitmentDate: "2025-12-15",
    nextActionType: "follow_up", nextActionDetail: "Quarterly check-in", nextActionDate: "2026-03-15",
    leadSource: "velocis_network", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Happy. Quarterly check-in.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-chang", fullName: "Lisa Chang", createdDate: "2025-11-01",
    email: "lchang@changinv.com", phone: "(214) 555-0902", organizationId: "org-14",
    roles: ["funded_investor"], pipelineStage: "funded", stageChangedDate: "2026-02-01",
    initialInvestmentTarget: 100000, growthTarget: 400000, committedAmount: 100000, commitmentDate: "2026-01-20",
    nextActionType: "follow_up", nextActionDetail: "Target $500K total", nextActionDate: "2026-03-01",
    leadSource: "cpa_referral", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Toe-dipper. Target $500K total.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  {
    id: "p-reeves", fullName: "Daniel Reeves", createdDate: "2025-09-01",
    email: "dreeves@reevescap.com", phone: "(214) 555-0903", organizationId: "org-15",
    roles: ["funded_investor"], pipelineStage: "funded", stageChangedDate: "2025-12-01",
    initialInvestmentTarget: 250000, growthTarget: 250000, committedAmount: 250000, commitmentDate: "2025-11-15",
    nextActionType: "follow_up", nextActionDetail: "Wants to double after Q4 returns", nextActionDate: "2026-03-10",
    leadSource: "linkedin", assignedRepId: "u-chad", collaboratorIds: [],
    notes: "Wants to double after Q4 returns.",
    lostReason: null, reengageDate: null, contactType: null, contactCompany: null,
  },
  // === 5 EXTERNAL CONTACTS ===
  {
    id: "p-lawson", fullName: "Mike Lawson", createdDate: "2025-12-15",
    email: "mlawson@whitleypenn.com", phone: "(214) 555-1001", organizationId: "org-16",
    roles: ["referrer"], pipelineStage: null, stageChangedDate: null,
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: null, assignedRepId: null, collaboratorIds: [],
    notes: "CPA at Whitley Penn. Referred Sandra Kim.",
    lostReason: null, reengageDate: null, contactType: "cpa", contactCompany: "Whitley Penn",
  },
  {
    id: "p-tolleson-advisor", fullName: "Tolleson Advisor", createdDate: "2026-02-18",
    email: null, phone: null, organizationId: null,
    roles: ["referrer"], pipelineStage: null, stageChangedDate: null,
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: null, assignedRepId: null, collaboratorIds: [],
    notes: "Wealth Advisor at Tolleson WM. Referred William Grant.",
    lostReason: null, reengageDate: null, contactType: "wealth_advisor", contactCompany: "Tolleson WM",
  },
  {
    id: "p-whitfield-atty", fullName: "Attorney for Whitfield", createdDate: "2025-11-20",
    email: null, phone: null, organizationId: null,
    roles: ["related_contact"], pipelineStage: null, stageChangedDate: null,
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: null, assignedRepId: null, collaboratorIds: [],
    notes: "Handling LLC setup for Whitfield's investment.",
    lostReason: null, reengageDate: null, contactType: "attorney", contactCompany: null,
  },
  {
    id: "p-mrs-calloway", fullName: "Mrs. Calloway", createdDate: "2026-01-10",
    email: null, phone: null, organizationId: "org-1",
    roles: ["related_contact"], pipelineStage: null, stageChangedDate: null,
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: null, assignedRepId: null, collaboratorIds: [],
    notes: "Robert Calloway's wife. Involved in financial decisions.",
    lostReason: null, reengageDate: null, contactType: "spouse", contactCompany: null,
  },
  {
    id: "p-kim-attorney", fullName: "Sandra Kim's Attorney", createdDate: "2025-12-20",
    email: null, phone: null, organizationId: null,
    roles: ["related_contact"], pipelineStage: null, stageChangedDate: null,
    initialInvestmentTarget: null, growthTarget: null, committedAmount: null, commitmentDate: null,
    nextActionType: null, nextActionDetail: null, nextActionDate: null,
    leadSource: null, assignedRepId: null, collaboratorIds: [],
    notes: "Handling entity structure decision for Sandra Kim's investment.",
    lostReason: null, reengageDate: null, contactType: "attorney", contactCompany: null,
  },
];

// ─── Funding Entities ───
let fundingEntities: FundingEntity[] = [
  { id: "fe-1", entityName: "Calloway Family Office LP", entityType: "llp", personId: "p-robert", status: "active", einTaxId: null, notes: null },
  { id: "fe-2", entityName: "Kim Holdings LLC", entityType: "llc", personId: "p-sandra", status: "active", einTaxId: null, notes: null },
  { id: "fe-3", entityName: "Whitfield Enterprises LLC", entityType: "llc", personId: "p-whitfield", status: "pending_setup", einTaxId: null, notes: "New LLC being set up by attorney" },
  { id: "fe-4", entityName: "Torres Family Trust", entityType: "trust", personId: "p-torres", status: "active", einTaxId: null, notes: null },
  { id: "fe-5", entityName: "Morrison Family Trust", entityType: "trust", personId: "p-morrison", status: "active", einTaxId: null, notes: null },
  { id: "fe-6", entityName: "Chang Investments LLC", entityType: "llc", personId: "p-chang", status: "active", einTaxId: null, notes: null },
  { id: "fe-7", entityName: "Reeves Capital Trust", entityType: "trust", personId: "p-reeves", status: "active", einTaxId: null, notes: null },
];

// ─── Funded Investments ───
let fundedInvestments: FundedInvestment[] = [
  { id: "fi-1", fundingEntityId: "fe-5", personId: "p-morrison", amountInvested: 500000, investmentDate: "2026-01-15", track: "maintain", growthTarget: null, nextCheckInDate: "2026-03-15", notes: "Happy. Quarterly check-in." },
  { id: "fi-2", fundingEntityId: "fe-6", personId: "p-chang", amountInvested: 100000, investmentDate: "2026-02-01", track: "grow", growthTarget: 400000, nextCheckInDate: "2026-03-01", notes: "Toe-dipper. Target $500K total." },
  { id: "fi-3", fundingEntityId: "fe-7", personId: "p-reeves", amountInvested: 250000, investmentDate: "2025-12-01", track: "grow", growthTarget: 250000, nextCheckInDate: "2026-03-10", notes: "Wants to double after Q4 returns." },
];

// ─── Activities (30+ entries from reference TIMELINE) ───
let activities: Activity[] = [
  // Robert Calloway activities
  { id: "a-1", personId: "p-robert", activityType: "meeting", source: "manual", date: "2026-02-24", time: "16:00", outcome: "connected", detail: "Coffee at Ascension. Reviewed performance data together. He pulled out a notepad and wrote down yield numbers — good sign. Wants vintage-level returns before committing. Wife is involved, may need a couple meeting. Asked about liquidity terms.", documentsAttached: ["Q3 Performance Summary.pdf", "Fund V Overview - 1 Pager.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-2", personId: "p-robert", activityType: "email", source: "manual", date: "2026-02-19", time: "11:00", outcome: "connected", detail: "Sent Q2 performance summary as requested after our Jan meeting.", documentsAttached: ["Q2 Performance Summary.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-3", personId: "p-robert", activityType: "stage_change", source: "manual", date: "2026-02-05", time: "10:00", outcome: "connected", detail: "Stage updated from Pitch to Active Engagement — requested vintage data.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-4", personId: "p-robert", activityType: "meeting", source: "manual", date: "2026-01-28", time: "10:00", outcome: "connected", detail: "Full deck presentation over breakfast at The Mansion. He's serious — asked about fund structure, fee breakdown, and who else is in. Wants vintage returns.", documentsAttached: ["OwnEZ Investor Deck v3.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-5", personId: "p-robert", activityType: "meeting", source: "manual", date: "2026-01-20", time: "10:00", outcome: "connected", detail: "Coffee at Ascension for discovery. Discussed investment goals and timeline.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-6", personId: "p-robert", activityType: "email", source: "manual", date: "2026-01-12", time: "09:00", outcome: "connected", detail: "Sent intro email after Velocis event.", documentsAttached: ["OwnEZ Fund V - 1 Pager.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // Sandra Kim activities
  { id: "a-7", personId: "p-sandra", activityType: "email", source: "manual", date: "2026-02-25", time: "09:15", outcome: "connected", detail: "Sent entity structure options — LLC vs Trust comparison memo.", documentsAttached: ["Entity Structure Options.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-8", personId: "p-sandra", activityType: "stage_change", source: "manual", date: "2026-02-18", time: "10:00", outcome: "connected", detail: "Stage updated from Active Engagement to Soft Commit — $250K verbal commitment at lunch.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-9", personId: "p-sandra", activityType: "meeting", source: "manual", date: "2026-02-20", time: "14:00", outcome: "connected", detail: "Lunch at Knife. She's ready to commit $250K. Checking with attorney on which entity to use — personal vs LLC. CPA (Mike Lawson) is supportive.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-10", personId: "p-sandra", activityType: "email", source: "manual", date: "2026-01-14", time: "10:00", outcome: "connected", detail: "Sent pitch deck and case study.", documentsAttached: ["OwnEZ Investor Deck v3.pdf", "Case Study.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-11", personId: "p-sandra", activityType: "meeting", source: "manual", date: "2026-01-06", time: "12:00", outcome: "connected", detail: "Lunch meeting for discovery.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-12", personId: "p-sandra", activityType: "call", source: "manual", date: "2025-12-18", time: "14:00", outcome: "connected", detail: "Intro call from CPA referral.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // David Thornton activities
  { id: "a-13", personId: "p-david", activityType: "call", source: "manual", date: "2026-02-21", time: "09:00", outcome: "connected", detail: "Intro call — 30 min. Just exited $12M manufacturing sale. Advisor told him to park cash in real estate credit. Very engaged, asked about default rates, underwriting standards, team background. Scheduled discovery for Feb 25 at 2pm.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-14", personId: "p-david", activityType: "stage_change", source: "manual", date: "2026-02-20", time: "14:00", outcome: "connected", detail: "Stage updated from Initial Contact to Discovery — scheduled for Feb 25.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-15", personId: "p-david", activityType: "email", source: "manual", date: "2026-02-14", time: "10:00", outcome: "connected", detail: "Sent intro email with one-pager from M&A attorney referral.", documentsAttached: ["OwnEZ Fund V - 1 Pager.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // Patricia Wells activities
  { id: "a-16", personId: "p-patricia", activityType: "email", source: "manual", date: "2026-02-22", time: "15:30", outcome: "attempted", detail: "Sent pitch deck follow-up. Referenced our conversation about peer validation — offered to connect her with an existing investor. No response yet.", documentsAttached: ["OwnEZ Investor Deck v3.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-17", personId: "p-patricia", activityType: "stage_change", source: "manual", date: "2026-02-14", time: "15:00", outcome: "connected", detail: "Stage updated from Discovery to Pitch Delivered.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-18", personId: "p-patricia", activityType: "meeting", source: "manual", date: "2026-02-14", time: "14:00", outcome: "connected", detail: "In-person pitch at her Highland Park office. She was receptive but cautious. Third-gen wealth, very conservative allocation. Biggest concern: she wants to talk to someone who's already invested before she commits. Asked about minimum investment.", documentsAttached: ["OwnEZ Investor Deck v3.pdf", "Fund V Overview.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-19", personId: "p-patricia", activityType: "meeting", source: "manual", date: "2026-02-03", time: "10:00", outcome: "connected", detail: "Office visit for discovery.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // Marcus Johnson activities
  { id: "a-20", personId: "p-marcus", activityType: "meeting", source: "manual", date: "2026-02-23", time: "14:00", outcome: "connected", detail: "Zoom call — 45 min. Walked through his rental portfolio yield (~6%) vs OwnEZ target (~9-11%). He's genuinely interested but wants to see one more quarter play out before committing. Not a stall — he's methodical. Suggested inviting him to March investor dinner.", documentsAttached: ["Rental vs Credit Fund Comparison.pdf", "Marcus Johnson - Portfolio Analysis.xlsx"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-21", personId: "p-marcus", activityType: "meeting", source: "manual", date: "2026-01-30", time: "14:00", outcome: "connected", detail: "Full presentation via Zoom. Walked through deck, Q&A was focused on how this compares to his direct RE holdings. He's doing the math himself — comparing 6% rental yield to 9-11% OwnEZ target.", documentsAttached: ["OwnEZ Investor Deck v3.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-22", personId: "p-marcus", activityType: "meeting", source: "manual", date: "2026-01-18", time: "10:00", outcome: "connected", detail: "Zoom discovery meeting.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-23", personId: "p-marcus", activityType: "call", source: "manual", date: "2026-01-08", time: "11:00", outcome: "connected", detail: "LinkedIn DM followed by intro call.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // James Whitfield activities
  { id: "a-24", personId: "p-whitfield", activityType: "call", source: "manual", date: "2026-02-25", time: "08:30", outcome: "connected", detail: "Called attorney's office. LLC docs in progress, needs 5 more business days. No concerns, just process.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-25", personId: "p-whitfield", activityType: "stage_change", source: "manual", date: "2026-02-18", time: "16:30", outcome: "connected", detail: "Stage updated from Active Engagement to Soft Commit — $500K confirmed.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-26", personId: "p-whitfield", activityType: "call", source: "manual", date: "2026-02-18", time: "16:00", outcome: "connected", detail: "Confirmed soft commit — $500K. Wants to invest through new LLC rather than existing entity. Attorney will handle setup. Very straightforward conversation.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // Angela Torres activities
  { id: "a-27", personId: "p-torres", activityType: "email", source: "manual", date: "2026-02-24", time: "11:00", outcome: "connected", detail: "Reminded to upload passport scan for KYC in Agora portal. She said she'd do it tonight.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // William Grant activities
  { id: "a-28", personId: "p-grant", activityType: "call", source: "manual", date: "2026-02-17", time: "10:00", outcome: "attempted", detail: "Left voicemail referencing Tolleson advisor's warm intro. Sent follow-up email with one-pager.", documentsAttached: ["OwnEZ Fund V - 1 Pager.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // Rachel Adams activities
  { id: "a-29", personId: "p-rachel", activityType: "email", source: "manual", date: "2026-02-23", time: "10:00", outcome: "connected", detail: "Sent case study of anonymous investor with similar profile who started at $100K and scaled to $500K over 18 months.", documentsAttached: ["Investor Case Study - Anonymous.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-30", personId: "p-rachel", activityType: "stage_change", source: "manual", date: "2026-02-12", time: "11:00", outcome: "connected", detail: "Stage updated from Pitch to Active Engagement. Post-pitch interest confirmed — wants case study.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-31", personId: "p-rachel", activityType: "meeting", source: "manual", date: "2026-02-06", time: "15:00", outcome: "connected", detail: "Pitched OwnEZ via Zoom — 40 min. She asked detailed questions about ITIN lending model, default rates, and borrower demographics. Very analytical. Wants a case study of a similar investor before committing. Ken's warm intro clearly helped.", documentsAttached: ["OwnEZ Investor Deck v3.pdf"], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-32", personId: "p-rachel", activityType: "meeting", source: "manual", date: "2026-01-28", time: "11:00", outcome: "connected", detail: "Zoom discovery — 25 min. Ken's warm intro set good context. She manages family trust, looking for yield alternatives to fixed income. Currently 60/40 traditional allocation.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-33", personId: "p-rachel", activityType: "email", source: "manual", date: "2026-01-18", time: "09:00", outcome: "connected", detail: "Ken sent intro email connecting Rachel with Chad.", documentsAttached: [], loggedById: "u-ken", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },

  // === 3 AUTO-SYNCED ACTIVITIES ===
  { id: "a-auto-1", personId: "p-robert", activityType: "call", source: "zoho_telephony", date: "2026-03-14", time: "14:30", outcome: "connected", detail: "Inbound call — 8 min. Robert called to ask about Fund V closing timeline.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-auto-2", personId: "p-sandra", activityType: "email", source: "o365_sync", date: "2026-03-12", time: "10:15", outcome: "connected", detail: "Auto-synced email: RE: Entity Structure — Sandra confirmed LLC route with attorney.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
  { id: "a-auto-3", personId: "p-grant", activityType: "call", source: "zoho_telephony", date: "2026-02-20", time: "09:45", outcome: "attempted", detail: "Outbound call — no answer. Left second voicemail.", documentsAttached: [], loggedById: "u-chad", annotation: null, fulfillsCommitmentId: null, commitmentType: null, commitmentDetail: null, commitmentDueDate: null, commitmentStatus: null, commitmentClosedDate: null },
];

// ─── Relationship Links ───
let referrerLinks: ReferrerLink[] = [
  { prospectId: "p-sandra", referrerId: "p-lawson" },
  { prospectId: "p-grant", referrerId: "p-tolleson-advisor" },
  { prospectId: "p-torres", referrerId: "p-lawson" },
];

let relatedContactLinks: RelatedContactLink[] = [
  { prospectId: "p-whitfield", contactId: "p-whitfield-atty", role: "Attorney — handling LLC setup" },
  { prospectId: "p-robert", contactId: "p-mrs-calloway", role: "Spouse — involved in financial decisions" },
  { prospectId: "p-sandra", contactId: "p-kim-attorney", role: "Attorney — entity structure decision" },
];

// ─── Initial state snapshots (for test reset) ───
const INITIAL_ORGANIZATIONS = JSON.stringify(organizations);
const INITIAL_PEOPLE = JSON.stringify(people);
const INITIAL_FUNDING_ENTITIES = JSON.stringify(fundingEntities);
const INITIAL_FUNDED_INVESTMENTS = JSON.stringify(fundedInvestments);
const INITIAL_ACTIVITIES = JSON.stringify(activities);
const INITIAL_REFERRER_LINKS = JSON.stringify(referrerLinks);
const INITIAL_RELATED_CONTACT_LINKS = JSON.stringify(relatedContactLinks);
const INITIAL_USERS = JSON.stringify(users);

function resetMockData() {
  organizations = JSON.parse(INITIAL_ORGANIZATIONS);
  people = JSON.parse(INITIAL_PEOPLE);
  fundingEntities = JSON.parse(INITIAL_FUNDING_ENTITIES);
  fundedInvestments = JSON.parse(INITIAL_FUNDED_INVESTMENTS);
  activities = JSON.parse(INITIAL_ACTIVITIES);
  referrerLinks = JSON.parse(INITIAL_REFERRER_LINKS);
  relatedContactLinks = JSON.parse(INITIAL_RELATED_CONTACT_LINKS);
  users = JSON.parse(INITIAL_USERS);
  leadSourceConfigs = JSON.parse(INITIAL_LEAD_SOURCE_CONFIGS);
  systemConfig = JSON.parse(INITIAL_SYSTEM_CONFIG);
  pipelineStageConfigs = JSON.parse(INITIAL_PIPELINE_STAGE_CONFIGS);
  activityTypeConfigs = JSON.parse(INITIAL_ACTIVITY_TYPE_CONFIGS);
}

// ─── Helper: enrich person with computed fields ───
function enrichPerson(person: Person): PersonWithComputed {
  const personActivities = activities.filter((a) => a.personId === person.id);
  const today = getTodayCT();
  const daysSinceLastTouch = computeDaysSinceLastTouch(personActivities, today);
  const isStale = computeIsStale(person.pipelineStage, daysSinceLastTouch, person.nextActionDate, today);
  const isOverdue = computeIsOverdue(person.pipelineStage, person.nextActionDate, today);

  const org = person.organizationId
    ? organizations.find((o) => o.id === person.organizationId)
    : null;
  const rep = person.assignedRepId
    ? users.find((u) => u.id === person.assignedRepId)
    : null;
  const referrerLink = referrerLinks.find((r) => r.prospectId === person.id);
  const referrer = referrerLink
    ? people.find((p) => p.id === referrerLink.referrerId)
    : null;

  const openCommitmentCount = personActivities.filter(
    (a) => a.activityType === "commitment_set" && a.commitmentStatus === "open"
  ).length;

  return {
    ...person,
    organizationName: org?.name ?? null,
    assignedRepName: rep?.fullName ?? null,
    daysSinceLastTouch,
    isStale,
    isOverdue,
    activityCount: personActivities.filter((a) => TOUCH_ACTIVITY_TYPES.includes(a.activityType)).length,
    referrerName: referrer?.fullName ?? null,
    openCommitmentCount,
  };
}

// ─── Mock Data Service ───
export function createMockDataService(): DataService {
  return {
    // ─── People ───
    async getPeople(filters?: PeopleFilters): Promise<PersonWithComputed[]> {
      let result = people.map(enrichPerson);

      if (filters?.roles?.length) {
        result = result.filter((p) =>
          filters.roles!.some((r) => p.roles.includes(r))
        );
      }
      if (filters?.pipelineStages?.length) {
        result = result.filter((p) =>
          p.pipelineStage && filters.pipelineStages!.includes(p.pipelineStage)
        );
      }
      if (filters?.leadSources?.length) {
        result = result.filter((p) =>
          p.leadSource && filters.leadSources!.includes(p.leadSource)
        );
      }
      if (filters?.assignedRepId) {
        result = result.filter((p) => p.assignedRepId === filters.assignedRepId);
      }
      if (filters?.assignedRepUnassigned) {
        result = result.filter((p) => p.assignedRepId === null);
      }
      if (filters?.staleOnly) {
        result = result.filter((p) => p.isStale || p.isOverdue);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
          (p) =>
            p.fullName.toLowerCase().includes(q) ||
            (p.organizationName?.toLowerCase().includes(q) ?? false) ||
            (p.email?.toLowerCase().includes(q) ?? false)
        );
      }

      return result;
    },

    async getPerson(id: string): Promise<PersonWithComputed | null> {
      const person = people.find((p) => p.id === id);
      if (!person) return null;
      return enrichPerson(person);
    },

    async createPerson(data: Partial<Person>): Promise<Person> {
      const newPerson: Person = {
        id: `p-${Date.now()}`,
        fullName: data.fullName ?? "",
        createdDate: getTodayCT(),
        email: data.email ?? null,
        phone: data.phone ?? null,
        organizationId: data.organizationId ?? null,
        roles: data.roles ?? ["prospect"],
        pipelineStage: data.pipelineStage ?? "prospect",
        stageChangedDate: getTodayCT(),
        initialInvestmentTarget: data.initialInvestmentTarget ?? null,
        growthTarget: data.growthTarget ?? null,
        committedAmount: data.committedAmount ?? null,
        commitmentDate: data.commitmentDate ?? null,
        nextActionType: data.nextActionType ?? null,
        nextActionDetail: data.nextActionDetail ?? null,
        nextActionDate: data.nextActionDate ?? null,
        leadSource: data.leadSource ?? null,
        assignedRepId: data.assignedRepId ?? null,
        collaboratorIds: data.collaboratorIds ?? [],
        notes: data.notes ?? null,
        lostReason: data.lostReason ?? null,
        reengageDate: data.reengageDate ?? null,
        contactType: data.contactType ?? null,
        contactCompany: data.contactCompany ?? null,
      };
      people.push(newPerson);
      return newPerson;
    },

    async updatePerson(id: string, data: Partial<Person>): Promise<Person> {
      const idx = people.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Person not found: ${id}`);
      people[idx] = { ...people[idx], ...data };
      return people[idx];
    },

    async searchPeople(query: string): Promise<PersonWithComputed[]> {
      return this.getPeople({ search: query });
    },

    // ─── Activities ───
    async getActivities(personId: string, filters?: ActivityFilters): Promise<Activity[]> {
      let result = activities
        .filter((a) => a.personId === personId)
        .sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          return (b.time ?? "").localeCompare(a.time ?? "");
        });

      if (filters?.activityTypes?.length) {
        result = result.filter((a) => filters.activityTypes!.includes(a.activityType));
      }
      if (filters?.dateFrom) {
        result = result.filter((a) => a.date >= filters.dateFrom!);
      }
      if (filters?.dateTo) {
        result = result.filter((a) => a.date <= filters.dateTo!);
      }

      return result;
    },

    async getRecentActivities(filters?: RecentActivityFilters): Promise<RecentActivityEntry[]> {
      const limit = filters?.limit ?? 20;
      const today = getTodayCT();
      const sevenDaysAgo = new Date(new Date(today + "T00:00:00").getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      let result = activities
        .filter((a) => a.date >= (filters?.dateFrom ?? sevenDaysAgo))
        .filter((a) => !filters?.dateTo || a.date <= filters.dateTo)
        .filter((a) => !filters?.repId || a.loggedById === filters.repId)
        .sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          return (b.time ?? "").localeCompare(a.time ?? "");
        })
        .slice(0, limit);

      return result.map((a) => {
        const person = people.find((p) => p.id === a.personId);
        return {
          ...a,
          personName: person?.fullName ?? "Unknown",
          personId: a.personId,
        };
      });
    },

    async createActivity(personId: string, data: Omit<Activity, "id" | "personId">): Promise<Activity> {
      const newActivity: Activity = {
        id: `a-${Date.now()}`,
        personId,
        ...data,
      };
      activities.push(newActivity);
      return newActivity;
    },

    // ─── Funding Entities ───
    async getFundingEntities(personId: string): Promise<FundingEntity[]> {
      return fundingEntities.filter((fe) => fe.personId === personId);
    },

    async createFundingEntity(data: Omit<FundingEntity, "id">): Promise<FundingEntity> {
      const newEntity: FundingEntity = {
        id: `fe-${Date.now()}`,
        ...data,
      };
      fundingEntities.push(newEntity);
      return newEntity;
    },

    // ─── Organizations ───
    async getOrganizations(): Promise<Organization[]> {
      return [...organizations];
    },

    async searchOrganizations(query: string): Promise<Organization[]> {
      const q = query.toLowerCase();
      return organizations.filter((o) => o.name.toLowerCase().includes(q));
    },

    async createOrganization(data: Omit<Organization, "id">): Promise<Organization> {
      const newOrg: Organization = {
        id: `org-${Date.now()}`,
        ...data,
      };
      organizations.push(newOrg);
      return newOrg;
    },

    // ─── Funded Investments ───
    async getFundedInvestments(personId: string): Promise<FundedInvestment[]> {
      return fundedInvestments.filter((fi) => fi.personId === personId);
    },

    async createFundedInvestment(data: Omit<FundedInvestment, "id">): Promise<FundedInvestment> {
      const newInvestment: FundedInvestment = {
        id: `fi-${Date.now()}`,
        ...data,
      };
      fundedInvestments.push(newInvestment);
      return newInvestment;
    },

    // ─── Dashboard ───
    async getDashboardStats(): Promise<DashboardStats> {
      const activePeople = people.filter(
        (p) => p.roles.includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
      );

      const committedPeople = people.filter(
        (p) => p.pipelineStage && COMMITTED_STAGES.includes(p.pipelineStage)
      );

      return {
        activePipelineCount: activePeople.length,
        pipelineValue: activePeople.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
        committedValue: committedPeople.reduce((sum, p) => sum + (p.committedAmount ?? 0), 0),
        fundedYTD: fundedInvestments.reduce((sum, fi) => sum + fi.amountInvested, 0),
      };
    },

    // ─── Users ───
    async getUsers(): Promise<User[]> {
      return users.map(({ passwordHash: _, ...u }) => ({ ...u, passwordHash: "" })) as User[];
    },

    async getUserByUsername(username: string): Promise<User | null> {
      return users.find((u) => u.username === username) ?? null;
    },

    // ─── Relationships ───
    async getReferrerForProspect(prospectId: string): Promise<Person | null> {
      const link = referrerLinks.find((r) => r.prospectId === prospectId);
      if (!link) return null;
      return people.find((p) => p.id === link.referrerId) ?? null;
    },

    async getRelatedContacts(prospectId: string): Promise<(Person & { relationRole: string })[]> {
      const links = relatedContactLinks.filter((r) => r.prospectId === prospectId);
      return links
        .map((link) => {
          const person = people.find((p) => p.id === link.contactId);
          if (!person) return null;
          return { ...person, relationRole: link.role };
        })
        .filter(Boolean) as (Person & { relationRole: string })[];
    },

    async addReferrer(prospectId: string, referrerId: string): Promise<void> {
      const existing = referrerLinks.find((r) => r.prospectId === prospectId);
      if (existing) {
        existing.referrerId = referrerId;
      } else {
        referrerLinks.push({ prospectId, referrerId });
      }
    },

    async addRelatedContact(prospectId: string, contactId: string, role: string): Promise<void> {
      relatedContactLinks.push({ prospectId, contactId, role });
    },

    async removeRelatedContact(prospectId: string, contactId: string): Promise<void> {
      relatedContactLinks = relatedContactLinks.filter(
        (r) => !(r.prospectId === prospectId && r.contactId === contactId)
      );
    },

    async getReferrals(referrerId: string): Promise<PersonWithComputed[]> {
      const links = referrerLinks.filter((r) => r.referrerId === referrerId);
      return links
        .map((link) => {
          const person = people.find((p) => p.id === link.prospectId);
          if (!person) return null;
          return enrichPerson(person);
        })
        .filter(Boolean) as PersonWithComputed[];
    },

    // ─── Analytics ───
    async getLeadSourceCounts(): Promise<Record<string, number>> {
      const counts: Record<string, number> = {};
      for (const p of people) {
        if (p.leadSource && p.roles.includes("prospect")) {
          counts[p.leadSource] = (counts[p.leadSource] ?? 0) + 1;
        }
      }
      return counts;
    },

    // ─── Leadership ───
    async getLeadershipStats(): Promise<LeadershipStats> {
      const today = getTodayCT();
      const yearStart = today.substring(0, 4) + "-01-01";
      const aumRaised = fundedInvestments.reduce((sum, fi) => sum + fi.amountInvested, 0);
      const fundedYTDCount = fundedInvestments.filter((fi) => fi.investmentDate >= yearStart).length;
      const activeProspects = people.filter(
        (p) => p.roles.includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage)
      );
      return {
        aumRaised,
        fundTarget: systemConfig.fundTarget,
        fundedYTDCount,
        activeCount: activeProspects.length,
        pipelineValue: activeProspects.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
      };
    },

    async getMeetingsCount(days: number): Promise<number> {
      const today = getTodayCT();
      const cutoff = new Date(new Date(today + "T00:00:00").getTime() - days * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];
      return activities.filter((a) => a.activityType === "meeting" && a.date >= cutoff).length;
    },

    async getFunnelData(): Promise<FunnelStage[]> {
      const allStages = [...ACTIVE_PIPELINE_STAGES, "funded" as PipelineStage];
      return allStages.map((stage) => {
        const stageConfig = PIPELINE_STAGES.find((s) => s.key === stage);
        const stageProspects = people.filter(
          (p) => (p.roles.includes("prospect") || p.roles.includes("funded_investor")) && p.pipelineStage === stage
        );
        return {
          stage,
          label: stageConfig?.label ?? stage,
          count: stageProspects.length,
          totalValue: stageProspects.reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0),
        };
      });
    },

    async getSourceROI(): Promise<SourceROIRow[]> {
      const allProspects = people.filter((p) => p.roles.includes("prospect") || p.roles.includes("funded_investor"));
      const sourceCounts: Record<string, { prospects: number; funded: number; aum: number }> = {};

      for (const p of allProspects) {
        const src = p.leadSource ?? "other";
        if (!sourceCounts[src]) sourceCounts[src] = { prospects: 0, funded: 0, aum: 0 };
        sourceCounts[src].prospects++;
        if (p.pipelineStage === "funded") {
          sourceCounts[src].funded++;
          const inv = fundedInvestments.filter((fi) => fi.personId === p.id);
          sourceCounts[src].aum += inv.reduce((sum, fi) => sum + fi.amountInvested, 0);
        }
      }

      const lsLabels: Record<string, string> = Object.fromEntries(
        leadSourceConfigs.map((s) => [s.key, s.label])
      );

      return Object.entries(sourceCounts)
        .map(([source, data]) => ({
          source,
          label: lsLabels[source] ?? source,
          prospectCount: data.prospects,
          fundedCount: data.funded,
          aum: data.aum,
          conversionPct: data.prospects > 0 ? Math.round((data.funded / data.prospects) * 100) : 0,
        }))
        .sort((a, b) => b.aum - a.aum);
    },

    async getDrilldownProspects(filter: DrilldownProspectFilter): Promise<PersonWithComputed[]> {
      const today = getTodayCT();
      const yearStart = today.substring(0, 4) + "-01-01";
      let result = people.filter((p) => p.roles.includes("prospect") || p.roles.includes("funded_investor"));

      if (filter.stage) {
        result = result.filter((p) => p.pipelineStage === filter.stage);
      }
      if (filter.leadSource) {
        result = result.filter((p) => p.leadSource === filter.leadSource);
      }
      if (filter.fundedYTD) {
        const ytdPersonIds = new Set(
          fundedInvestments.filter((fi) => fi.investmentDate >= yearStart).map((fi) => fi.personId)
        );
        result = result.filter((p) => ytdPersonIds.has(p.id));
      }
      if (filter.fundedAll) {
        const fundedPersonIds = new Set(fundedInvestments.map((fi) => fi.personId));
        result = result.filter((p) => fundedPersonIds.has(p.id));
      }
      if (filter.active) {
        result = result.filter((p) => p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage));
      }

      let enriched = result.map(enrichPerson);

      // Sort funded drilldowns by most recent investment date (newest first)
      if (filter.fundedYTD || filter.fundedAll) {
        const latestInvestmentDate = new Map<string, string>();
        for (const fi of fundedInvestments) {
          const existing = latestInvestmentDate.get(fi.personId);
          if (!existing || fi.investmentDate > existing) {
            latestInvestmentDate.set(fi.personId, fi.investmentDate);
          }
        }
        enriched.sort((a, b) => (latestInvestmentDate.get(b.id) ?? "").localeCompare(latestInvestmentDate.get(a.id) ?? ""));
      }

      return enriched;
    },

    async getDrilldownActivities(filter: DrilldownActivityFilter): Promise<RecentActivityEntry[]> {
      const today = getTodayCT();
      const cutoff = new Date(new Date(today + "T00:00:00").getTime() - filter.days * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];

      return activities
        .filter((a) => a.activityType === filter.activityType && a.date >= cutoff)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => {
          const person = people.find((p) => p.id === a.personId);
          return { ...a, personName: person?.fullName ?? "Unknown", personId: a.personId };
        });
    },

    // ─── Top Referrers ───
    async getTopReferrers(limit = 5): Promise<ReferrerStats[]> {
      const referrerMap = new Map<string, { referrerId: string; referrerName: string; prospects: string[] }>();

      for (const link of referrerLinks) {
        const referrer = people.find((p) => p.id === link.referrerId);
        if (!referrer) continue;
        if (!referrerMap.has(link.referrerId)) {
          referrerMap.set(link.referrerId, { referrerId: link.referrerId, referrerName: referrer.fullName, prospects: [] });
        }
        referrerMap.get(link.referrerId)!.prospects.push(link.prospectId);
      }

      return Array.from(referrerMap.values())
        .map((r) => {
          const prospects = r.prospects.map((pid) => people.find((p) => p.id === pid)).filter(Boolean) as Person[];
          const pipelineValue = prospects
            .filter((p) => p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage))
            .reduce((sum, p) => sum + (p.initialInvestmentTarget ?? 0), 0);
          const fundedValue = fundedInvestments
            .filter((fi) => r.prospects.includes(fi.personId))
            .reduce((sum, fi) => sum + fi.amountInvested, 0);
          return {
            referrerId: r.referrerId,
            referrerName: r.referrerName,
            referralCount: r.prospects.length,
            pipelineValue,
            fundedValue,
          };
        })
        .sort((a, b) => b.referralCount - a.referralCount || b.fundedValue - a.fundedValue)
        .slice(0, limit);
    },

    // ─── Red Flags ───
    async getRedFlags(): Promise<PersonWithComputed[]> {
      return people
        .filter((p) => p.roles.includes("prospect") && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage))
        .map(enrichPerson)
        .filter((p) => p.isStale || p.isOverdue)
        .sort((a, b) => (b.daysSinceLastTouch ?? 0) - (a.daysSinceLastTouch ?? 0));
    },

    // ─── Lead Sources ───
    async getLeadSources(opts?: { includeInactive?: boolean }): Promise<LeadSourceConfig[]> {
      const sorted = [...leadSourceConfigs].sort((a, b) => a.order - b.order);
      return opts?.includeInactive ? sorted : sorted.filter((s) => s.isActive);
    },

    async createLeadSource(data: { label: string }): Promise<LeadSourceConfig> {
      const key = data.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const order = leadSourceConfigs.length;
      const newSource: LeadSourceConfig = { key, label: data.label, order, isActive: true };
      leadSourceConfigs.push(newSource);
      return newSource;
    },

    async updateLeadSource(key: string, data: Partial<Pick<LeadSourceConfig, "label" | "isActive">>): Promise<LeadSourceConfig> {
      const idx = leadSourceConfigs.findIndex((s) => s.key === key);
      if (idx === -1) throw new Error(`Lead source not found: ${key}`);
      leadSourceConfigs[idx] = { ...leadSourceConfigs[idx], ...data };
      return leadSourceConfigs[idx];
    },

    async reorderLeadSources(keys: string[]): Promise<void> {
      keys.forEach((key, i) => {
        const src = leadSourceConfigs.find((s) => s.key === key);
        if (src) src.order = i;
      });
    },

    // ─── Admin — Users ───
    async updateUserPermissions(userId: string, permissions: UserPermissions): Promise<User> {
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error(`User not found: ${userId}`);
      users[idx] = { ...users[idx], permissions };
      const { passwordHash: _, ...safe } = users[idx];
      return { ...safe, passwordHash: "" };
    },

    async deactivateUser(userId: string, reassignToId?: string): Promise<void> {
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) throw new Error(`User not found: ${userId}`);
      users[idx] = { ...users[idx], isActive: false };
      // Reassign prospects
      for (const p of people) {
        if (p.assignedRepId === userId) {
          p.assignedRepId = reassignToId ?? null;
        }
      }
    },

    async getUnassignedProspects(): Promise<PersonWithComputed[]> {
      return people
        .filter((p) => p.roles.includes("prospect") && p.assignedRepId === null && p.pipelineStage && ACTIVE_PIPELINE_STAGES.includes(p.pipelineStage))
        .map(enrichPerson);
    },

    // ─── Pipeline Stage Config ───
    async getPipelineStageConfigs(): Promise<PipelineStageConfig[]> {
      return [...pipelineStageConfigs].sort((a, b) => a.order - b.order);
    },

    async updatePipelineStageConfig(
      key: PipelineStage,
      data: Partial<Pick<PipelineStageConfig, "label" | "idleThreshold">>
    ): Promise<PipelineStageConfig> {
      const config = pipelineStageConfigs.find((c) => c.key === key);
      if (!config) throw new Error(`Stage not found: ${key}`);
      if (data.label !== undefined) config.label = data.label;
      if (data.idleThreshold !== undefined) config.idleThreshold = data.idleThreshold;
      return { ...config };
    },

    // ─── Activity Type Config ───
    async getActivityTypeConfigs(): Promise<ActivityTypeConfig[]> {
      return [...activityTypeConfigs];
    },

    async updateActivityTypeConfig(
      key: string,
      data: Partial<Pick<ActivityTypeConfig, "label" | "isActive">>
    ): Promise<ActivityTypeConfig> {
      const config = activityTypeConfigs.find((c) => c.key === key);
      if (!config) throw new Error(`Activity type not found: ${key}`);
      if (config.isSystem) throw new Error(`System activity types cannot be modified`);
      if (data.label !== undefined) config.label = data.label;
      if (data.isActive !== undefined) config.isActive = data.isActive;
      return { ...config };
    },

    async createActivityType(data: { label: string }): Promise<ActivityTypeConfig> {
      const key = data.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const newType: ActivityTypeConfig = { key, label: data.label, isActive: true, isSystem: false };
      activityTypeConfigs.push(newType);
      return newType;
    },

    // ─── System Config ───
    async getSystemConfig(): Promise<SystemConfig> {
      return { ...systemConfig };
    },

    async updateSystemConfig(data: Partial<SystemConfig>): Promise<SystemConfig> {
      systemConfig = { ...systemConfig, ...data };
      return { ...systemConfig };
    },

    // ─── Commitments lifecycle (DESIGN-SPEC §5.9) ───
    // Mock provider has a complete in-memory implementation. The Neon provider
    // stubs these until the schema migration adding commitment columns lands.

    async getOpenCommitments(personId: string): Promise<Activity[]> {
      return activities
        .filter(
          (a) =>
            a.personId === personId &&
            a.activityType === "commitment_set" &&
            a.commitmentStatus === "open"
        )
        .sort((a, b) => (a.commitmentDueDate ?? "").localeCompare(b.commitmentDueDate ?? ""));
    },

    async createCommitment(personId, data): Promise<Activity> {
      const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const now = new Date();
      const time = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Chicago",
      });
      const newActivity: Activity = {
        id,
        personId,
        activityType: "commitment_set",
        source: "manual",
        date: getTodayCT(),
        time,
        outcome: "connected",
        detail: `Next action set: ${data.commitmentDetail}`,
        documentsAttached: [],
        loggedById: data.loggedById,
        annotation: null,
        fulfillsCommitmentId: null,
        commitmentType: data.commitmentType,
        commitmentDetail: data.commitmentDetail,
        commitmentDueDate: data.commitmentDueDate,
        commitmentStatus: "open",
        commitmentClosedDate: null,
      };
      activities.push(newActivity);
      return newActivity;
    },

    async closeOutCommitment(commitmentId, resolution): Promise<Activity> {
      const commitment = activities.find((a) => a.id === commitmentId);
      if (!commitment) {
        throw new Error(`Commitment ${commitmentId} not found`);
      }
      if (commitment.activityType !== "commitment_set") {
        throw new Error(`Activity ${commitmentId} is not a commitment`);
      }
      if (commitment.commitmentStatus !== "open") {
        throw new Error(
          `Commitment ${commitmentId} is not open (status: ${commitment.commitmentStatus})`
        );
      }
      commitment.commitmentStatus = resolution.status;
      commitment.commitmentClosedDate = resolution.closedDate;

      if (resolution.status === "fulfilled" && resolution.fulfilledByActivityId) {
        const fulfilling = activities.find((a) => a.id === resolution.fulfilledByActivityId);
        if (fulfilling) {
          fulfilling.fulfillsCommitmentId = commitmentId;
        }
      }
      return commitment;
    },

    async dropLead(personId, data): Promise<Person> {
      const person = people.find((p) => p.id === personId);
      if (!person) {
        throw new Error(`Person ${personId} not found`);
      }
      const today = getTodayCT();
      const oldStage = person.pipelineStage;

      // Update stage + clear next action
      person.pipelineStage = data.target;
      person.stageChangedDate = today;
      person.nextActionType = null;
      person.nextActionDetail = null;
      person.nextActionDate = null;
      if (data.target === "dead" && data.lostReason) {
        person.lostReason = data.lostReason;
      }
      if (data.target === "nurture" && data.reengageDate) {
        person.reengageDate = data.reengageDate;
      }

      // Cancel any open commitments for this person
      for (const a of activities) {
        if (
          a.personId === personId &&
          a.activityType === "commitment_set" &&
          a.commitmentStatus === "open"
        ) {
          a.commitmentStatus = "cancelled";
          a.commitmentClosedDate = today;
        }
      }

      // Auto-log stage change activity
      const oldLabel = oldStage
        ? PIPELINE_STAGES.find((s) => s.key === oldStage)?.label ?? oldStage
        : "None";
      const newLabel = data.target === "dead" ? "Dead" : "Nurture";
      const reasonSuffix =
        data.target === "dead" && data.reasonNote ? ` — ${data.reasonNote}` : "";
      const stageChange: Activity = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        personId,
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
        detail: `Stage updated from ${oldLabel} to ${newLabel}${reasonSuffix}`,
        documentsAttached: [],
        loggedById: data.loggedById,
        annotation: null,
        fulfillsCommitmentId: null,
        commitmentType: null,
        commitmentDetail: null,
        commitmentDueDate: null,
        commitmentStatus: null,
        commitmentClosedDate: null,
      };
      activities.push(stageChange);

      return { ...person };
    },

    // ─── Testing ───
    resetData() {
      resetMockData();
    },
  };
}
