// ─── Core Entities ───

export type PersonRole = "prospect" | "referrer" | "related_contact" | "funded_investor";

export type PipelineStage =
  | "prospect"
  | "initial_contact"
  | "discovery"
  | "pitch"
  | "active_engagement"
  | "soft_commit"
  | "commitment_processing"
  | "kyc_docs"
  | "funded"
  | "nurture"
  | "dead";

export type NextActionType =
  | "follow_up"
  | "schedule_meeting"
  | "send_document"
  | "request_info"
  | "make_introduction"
  | "internal_review"
  | "other";

export type LeadSource =
  | "velocis_network"
  | "cpa_referral"
  | "legacy_event"
  | "linkedin"
  | "ken_dbj_list"
  | "ken_event_followup"
  | "tolleson_wm"
  | "ma_attorney"
  | "cold_outreach"
  | "other";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "text_message"
  | "linkedin_message"
  | "whatsapp"
  | "stage_change"
  | "document_sent"
  | "document_received"
  | "reassignment"
  | "commitment_set";

export type ActivitySource = "manual" | "zoho_telephony" | "o365_sync";
export type ActivityOutcome = "connected" | "attempted";

/**
 * Lifecycle status for a Commitment Set activity. See DESIGN-SPEC.md §5.9.
 *
 * - `open`: active commitment, still owed
 * - `fulfilled`: completed by a specific activity (linked via fulfillsCommitmentId)
 * - `superseded`: explicitly replaced without being fulfilled
 * - `cancelled`: lead was dropped (Dead/Nurture) while this commitment was open
 *
 * Terminal states (`fulfilled`, `superseded`, `cancelled`) are never transitioned
 * back to `open`. On resurrection, new commitments are created going forward.
 */
export type CommitmentStatus = "open" | "fulfilled" | "superseded" | "cancelled";

/**
 * Default null values for the six commitment-related fields on Activity.
 * Spread this into any activity object literal that isn't a commitment row,
 * to satisfy the required-but-null shape of the Activity interface.
 *
 *   const a: Activity = { ...EMPTY_COMMITMENT_FIELDS, id: "...", ... };
 */
export const EMPTY_COMMITMENT_FIELDS = {
  fulfillsCommitmentId: null,
  commitmentType: null,
  commitmentDetail: null,
  commitmentDueDate: null,
  commitmentStatus: null,
  commitmentClosedDate: null,
} as const;

export type EntityType = "llc" | "llp" | "trust" | "individual" | "corporation" | "other";
export type EntityStatus = "active" | "pending_setup" | "inactive";
export type InvestmentTrack = "maintain" | "grow";
export type LostReason = "not_accredited" | "not_interested" | "ghosted" | "timing" | "went_elsewhere" | "other";
export type OrgType = "family_office" | "wealth_management" | "corporate" | "individual_none";
export type ContactType = "cpa" | "attorney" | "wealth_advisor" | "spouse" | "existing_investor" | "other";
export type UserRole = "rep" | "marketing" | "admin";

// ─── Permissions ───

export interface UserPermissions {
  canViewLeadership?: boolean;
  canAccessAdmin?: boolean;
  canReassignProspects?: boolean;
  canViewAllProspects?: boolean;
  canMarkDead?: boolean;
}

// ─── Data Models ───

export interface Person {
  id: string;
  fullName: string;
  createdDate: string;
  email: string | null;
  phone: string | null;
  organizationId: string | null;
  roles: PersonRole[];

  pipelineStage: PipelineStage | null;
  stageChangedDate: string | null;
  initialInvestmentTarget: number | null;
  growthTarget: number | null;
  committedAmount: number | null;
  commitmentDate: string | null;
  nextActionType: NextActionType | null;
  nextActionDetail: string | null;
  nextActionDate: string | null;
  leadSource: LeadSource | null;
  assignedRepId: string | null;
  collaboratorIds: string[];
  notes: string | null;
  lostReason: LostReason | null;
  reengageDate: string | null;

  contactType: ContactType | null;
  contactCompany: string | null;
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType | null;
  notes: string | null;
}

export interface FundingEntity {
  id: string;
  entityName: string;
  entityType: EntityType;
  personId: string;
  status: EntityStatus;
  einTaxId: string | null;
  notes: string | null;
}

export interface Activity {
  id: string;
  personId: string;
  activityType: ActivityType;
  source: ActivitySource;
  date: string;
  time: string | null;
  outcome: ActivityOutcome;
  detail: string;
  documentsAttached: string[];
  loggedById: string;
  annotation: string | null;

  // ─── Commitments lifecycle (DESIGN-SPEC §5.9) ───
  // All commitment fields are null on non-commitment activity types.
  // `fulfillsCommitmentId` may be set on any activity type that fulfilled a prior
  // commitment. The five `commitment*` fields are only populated when
  // `activityType === "commitment_set"`.

  /** Links this activity to the Commitment Set row it fulfilled (if any). */
  fulfillsCommitmentId: string | null;

  /** Snapshot of Next Action Type when this commitment was created. */
  commitmentType: NextActionType | null;

  /** Snapshot of Next Action Detail when this commitment was created. */
  commitmentDetail: string | null;

  /** Snapshot of Next Action Date when this commitment was created. */
  commitmentDueDate: string | null;

  /** Current lifecycle status of this commitment. Null on non-commitment rows. */
  commitmentStatus: CommitmentStatus | null;

  /** Date the commitment transitioned to a terminal state. Null while open. */
  commitmentClosedDate: string | null;
}

export interface FundedInvestment {
  id: string;
  fundingEntityId: string;
  personId: string;
  amountInvested: number;
  investmentDate: string;
  track: InvestmentTrack;
  growthTarget: number | null;
  nextCheckInDate: string;
  notes: string | null;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  passwordHash: string;
  permissions?: UserPermissions;
}

// ─── Relationship Links ───

export interface ReferrerLink {
  prospectId: string;
  referrerId: string;
}

export interface RelatedContactLink {
  prospectId: string;
  contactId: string;
  role: string;
}

// ─── Computed / View Models ───

export interface PersonWithComputed extends Person {
  organizationName: string | null;
  assignedRepName: string | null;
  daysSinceLastTouch: number | null;
  isStale: boolean;
  isOverdue: boolean;
  activityCount: number;
  referrerName: string | null;
  /**
   * Count of commitments currently in `open` status for this person.
   * When the feature flag is off, this is always 0 and overdue/stale are
   * computed from the legacy Person-level nextActionDate. See DESIGN-SPEC §5.9.
   */
  openCommitmentCount: number;
}

// ─── Leadership Stats ───

export interface LeadershipStats {
  aumRaised: number;
  fundTarget: number;
  fundedYTDCount: number;
  activeCount: number;
  pipelineValue: number;
}

export interface FunnelStage {
  stage: PipelineStage;
  label: string;
  count: number;
  totalValue: number;
}

export interface SourceROIRow {
  source: string;
  label: string;
  prospectCount: number;
  fundedCount: number;
  aum: number;
  conversionPct: number;
}

export interface DrilldownProspectFilter {
  stage?: PipelineStage;
  leadSource?: string;
  fundedYTD?: boolean;
  fundedAll?: boolean;
  active?: boolean;
}

export interface DrilldownActivityFilter {
  activityType: string;
  days: number;
}

// ─── Lead Source Config ───

export interface LeadSourceConfig {
  key: string;
  label: string;
  order: number;
  isActive: boolean;
}

// ─── Pipeline Stage Config ───

export interface PipelineStageConfig {
  key: PipelineStage;
  label: string;
  idleThreshold: number | null;
  order: number;
}

// ─── Activity Type Config ───

export interface ActivityTypeConfig {
  key: string;
  label: string;
  isActive: boolean;
  isSystem: boolean; // stage_change, reassignment — not editable
}

// ─── Referrer Stats ───

export interface ReferrerStats {
  referrerId: string;
  referrerName: string;
  referralCount: number;
  pipelineValue: number;
  fundedValue: number;
}

// ─── System Config ───

export interface SystemConfig {
  fundTarget: number;
  companyName: string;
  defaultRepId: string | null;
}

// ─── Dashboard Stats ───

export interface DashboardStats {
  activePipelineCount: number;
  pipelineValue: number;
  committedValue: number;
  fundedYTD: number;
}

// ─── Data Service Interface ───

export interface PeopleFilters {
  roles?: PersonRole[];
  pipelineStages?: PipelineStage[];
  leadSources?: LeadSource[];
  assignedRepId?: string;
  assignedRepUnassigned?: boolean;
  staleOnly?: boolean;
  search?: string;
}

export interface ActivityFilters {
  activityTypes?: ActivityType[];
  dateFrom?: string;
  dateTo?: string;
}

export interface RecentActivityFilters {
  repId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface RecentActivityEntry extends Activity {
  personName: string;
  personId: string;
}

export interface DataService {
  // People
  getPeople(filters?: PeopleFilters): Promise<PersonWithComputed[]>;
  getPerson(id: string): Promise<PersonWithComputed | null>;
  createPerson(data: Partial<Person>): Promise<Person>;
  updatePerson(id: string, data: Partial<Person>): Promise<Person>;
  searchPeople(query: string): Promise<PersonWithComputed[]>;

  // Activities
  getActivities(personId: string, filters?: ActivityFilters): Promise<Activity[]>;
  getRecentActivities(filters?: RecentActivityFilters): Promise<RecentActivityEntry[]>;
  createActivity(personId: string, data: Omit<Activity, "id" | "personId">): Promise<Activity>;

  // ─── Commitments lifecycle (DESIGN-SPEC §5.9) ───
  // Commitments are stored as Activity Log rows with activityType === "commitment_set".
  // These methods are convenience wrappers for the close-out flow.

  /** Returns commitments in `open` status for this person, sorted by due date ASC. */
  getOpenCommitments(personId: string): Promise<Activity[]>;

  /**
   * Creates a new Commitment Set activity row.
   * Callers should also update the Person's denormalized nextAction* fields
   * via updatePerson() in the same logical operation.
   */
  createCommitment(
    personId: string,
    data: {
      commitmentType: NextActionType;
      commitmentDetail: string;
      commitmentDueDate: string;
      loggedById: string;
    }
  ): Promise<Activity>;

  /**
   * Transitions a Commitment Set row from `open` to a terminal state.
   * When status is `fulfilled`, caller must pass `fulfilledByActivityId` so the
   * fulfilling activity's `fulfillsCommitmentId` field is stamped.
   */
  closeOutCommitment(
    commitmentId: string,
    resolution: {
      status: Exclude<CommitmentStatus, "open">;
      fulfilledByActivityId?: string;
      closedDate: string;
    }
  ): Promise<Activity>;

  /**
   * Drop a lead (Dead or Nurture) from the post-activity flow.
   * Atomically: updates stage, clears next action fields, cancels open
   * commitments, and logs a Stage Change activity.
   * See DESIGN-SPEC §5.10.
   */
  dropLead(
    personId: string,
    data: {
      target: "dead" | "nurture";
      lostReason?: LostReason;
      reasonNote?: string;
      reengageDate?: string;
      loggedById: string;
    }
  ): Promise<Person>;

  // Funding Entities
  getFundingEntities(personId: string): Promise<FundingEntity[]>;
  createFundingEntity(data: Omit<FundingEntity, "id">): Promise<FundingEntity>;

  // Organizations
  getOrganizations(): Promise<Organization[]>;
  searchOrganizations(query: string): Promise<Organization[]>;
  createOrganization(data: Omit<Organization, "id">): Promise<Organization>;

  // Funded Investments
  getFundedInvestments(personId: string): Promise<FundedInvestment[]>;
  createFundedInvestment(data: Omit<FundedInvestment, "id">): Promise<FundedInvestment>;

  // Dashboard
  getDashboardStats(): Promise<DashboardStats>;

  // Users
  getUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | null>;

  // Relationships
  getReferrerForProspect(prospectId: string): Promise<Person | null>;
  getRelatedContacts(prospectId: string): Promise<(Person & { relationRole: string })[]>;
  addReferrer(prospectId: string, referrerId: string): Promise<void>;
  addRelatedContact(prospectId: string, contactId: string, role: string): Promise<void>;
  removeRelatedContact(prospectId: string, contactId: string): Promise<void>;
  getReferrals(referrerId: string): Promise<PersonWithComputed[]>;

  // Analytics
  getLeadSourceCounts(): Promise<Record<string, number>>;

  // Leadership
  getLeadershipStats(): Promise<LeadershipStats>;
  getMeetingsCount(days: number): Promise<number>;
  getFunnelData(): Promise<FunnelStage[]>;
  getSourceROI(): Promise<SourceROIRow[]>;
  getDrilldownProspects(filter: DrilldownProspectFilter): Promise<PersonWithComputed[]>;
  getDrilldownActivities(filter: DrilldownActivityFilter): Promise<RecentActivityEntry[]>;

  // Top Referrers
  getTopReferrers(limit?: number): Promise<ReferrerStats[]>;

  // Red Flags (stale/overdue)
  getRedFlags(): Promise<PersonWithComputed[]>;

  // Lead Sources (dynamic)
  getLeadSources(opts?: { includeInactive?: boolean }): Promise<LeadSourceConfig[]>;
  createLeadSource(data: { label: string }): Promise<LeadSourceConfig>;
  updateLeadSource(key: string, data: Partial<Pick<LeadSourceConfig, "label" | "isActive">>): Promise<LeadSourceConfig>;
  reorderLeadSources(keys: string[]): Promise<void>;

  // Admin — Users
  updateUserPermissions(userId: string, permissions: UserPermissions): Promise<User>;
  deactivateUser(userId: string, reassignToId?: string): Promise<void>;
  getUnassignedProspects(): Promise<PersonWithComputed[]>;

  // System Config
  getSystemConfig(): Promise<SystemConfig>;
  updateSystemConfig(data: Partial<SystemConfig>): Promise<SystemConfig>;

  // Pipeline Stage Config
  getPipelineStageConfigs(): Promise<PipelineStageConfig[]>;
  updatePipelineStageConfig(key: PipelineStage, data: Partial<Pick<PipelineStageConfig, "label" | "idleThreshold">>): Promise<PipelineStageConfig>;

  // Activity Type Config
  getActivityTypeConfigs(): Promise<ActivityTypeConfig[]>;
  updateActivityTypeConfig(key: string, data: Partial<Pick<ActivityTypeConfig, "label" | "isActive">>): Promise<ActivityTypeConfig>;
  createActivityType(data: { label: string }): Promise<ActivityTypeConfig>;

  // Testing
  resetData?(): void;
}
