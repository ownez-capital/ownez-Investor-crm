import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// ─── Users ───
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  passwordHash: text("password_hash").notNull(),
  permissions: jsonb("permissions"),
});

// ─── Organizations ───
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"),
  notes: text("notes"),
});

// ─── People ───
export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    createdDate: text("created_date").notNull(),
    email: text("email"),
    phone: text("phone"),
    organizationId: text("organization_id"),
    roles: jsonb("roles").notNull().$type<string[]>(),
    pipelineStage: text("pipeline_stage"),
    stageChangedDate: text("stage_changed_date"),
    initialInvestmentTarget: numeric("initial_investment_target"),
    growthTarget: numeric("growth_target"),
    committedAmount: numeric("committed_amount"),
    commitmentDate: text("commitment_date"),
    nextActionType: text("next_action_type"),
    nextActionDetail: text("next_action_detail"),
    nextActionDate: text("next_action_date"),
    leadSource: text("lead_source"),
    assignedRepId: text("assigned_rep_id"),
    collaboratorIds: jsonb("collaborator_ids").notNull().$type<string[]>(),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    reengageDate: text("reengage_date"),
    contactType: text("contact_type"),
    contactCompany: text("contact_company"),
  },
  (table) => [
    index("people_organization_id_idx").on(table.organizationId),
    index("people_assigned_rep_id_idx").on(table.assignedRepId),
  ]
);

// ─── Activities ───
export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    activityType: text("activity_type").notNull(),
    source: text("source").notNull(),
    date: text("date").notNull(),
    time: text("time"),
    outcome: text("outcome").notNull(),
    detail: text("detail").notNull(),
    documentsAttached: jsonb("documents_attached").notNull().$type<string[]>(),
    loggedById: text("logged_by_id").notNull(),
    annotation: text("annotation"),
  },
  (table) => [
    index("activities_person_id_idx").on(table.personId),
  ]
);

// ─── Funding Entities ───
export const fundingEntities = pgTable(
  "funding_entities",
  {
    id: text("id").primaryKey(),
    entityName: text("entity_name").notNull(),
    entityType: text("entity_type").notNull(),
    personId: text("person_id").notNull(),
    status: text("status").notNull(),
    einTaxId: text("ein_tax_id"),
    notes: text("notes"),
  },
  (table) => [
    index("funding_entities_person_id_idx").on(table.personId),
  ]
);

// ─── Funded Investments ───
export const fundedInvestments = pgTable(
  "funded_investments",
  {
    id: text("id").primaryKey(),
    fundingEntityId: text("funding_entity_id").notNull(),
    personId: text("person_id").notNull(),
    amountInvested: numeric("amount_invested").notNull(),
    investmentDate: text("investment_date").notNull(),
    track: text("track").notNull(),
    growthTarget: numeric("growth_target"),
    nextCheckInDate: text("next_check_in_date").notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("funded_investments_person_id_idx").on(table.personId),
    index("funded_investments_funding_entity_id_idx").on(table.fundingEntityId),
  ]
);

// ─── Referrer Links ───
export const referrerLinks = pgTable(
  "referrer_links",
  {
    prospectId: text("prospect_id").notNull(),
    referrerId: text("referrer_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.prospectId, table.referrerId] }),
  ]
);

// ─── Related Contact Links ───
export const relatedContactLinks = pgTable(
  "related_contact_links",
  {
    prospectId: text("prospect_id").notNull(),
    contactId: text("contact_id").notNull(),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.prospectId, table.contactId] }),
  ]
);

// ─── Lead Source Configs ───
export const leadSourceConfigs = pgTable("lead_source_configs", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  order: integer("order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ─── Pipeline Stage Configs ───
export const pipelineStageConfigs = pgTable("pipeline_stage_configs", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  idleThreshold: integer("idle_threshold"),
  order: integer("order").notNull(),
});

// ─── Activity Type Configs ───
export const activityTypeConfigs = pgTable("activity_type_configs", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
});

// ─── System Config ───
export const systemConfig = pgTable("system_config", {
  id: text("id").primaryKey(),
  fundTarget: numeric("fund_target").notNull(),
  companyName: text("company_name").notNull(),
  defaultRepId: text("default_rep_id"),
});
