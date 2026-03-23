import type { NeonDb } from "./db";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Run schema setup by creating tables if they don't exist.
 * Uses Drizzle's schema definitions to create tables directly.
 * For production migrations, use `npx drizzle-kit migrate`.
 */
export async function runMigrations(db: NeonDb): Promise<void> {
  // Create tables using raw SQL derived from schema
  // This approach works without needing migration files for initial setup

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      password_hash TEXT NOT NULL,
      permissions JSONB
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      notes TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      created_date TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      organization_id TEXT,
      roles JSONB NOT NULL,
      pipeline_stage TEXT,
      stage_changed_date TEXT,
      initial_investment_target NUMERIC,
      growth_target NUMERIC,
      committed_amount NUMERIC,
      commitment_date TEXT,
      next_action_type TEXT,
      next_action_detail TEXT,
      next_action_date TEXT,
      lead_source TEXT,
      assigned_rep_id TEXT,
      collaborator_ids JSONB NOT NULL,
      notes TEXT,
      lost_reason TEXT,
      reengage_date TEXT,
      contact_type TEXT,
      contact_company TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      source TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      outcome TEXT NOT NULL,
      detail TEXT NOT NULL,
      documents_attached JSONB NOT NULL,
      logged_by_id TEXT NOT NULL,
      annotation TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS funding_entities (
      id TEXT PRIMARY KEY,
      entity_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      person_id TEXT NOT NULL,
      status TEXT NOT NULL,
      ein_tax_id TEXT,
      notes TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS funded_investments (
      id TEXT PRIMARY KEY,
      funding_entity_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      amount_invested NUMERIC NOT NULL,
      investment_date TEXT NOT NULL,
      track TEXT NOT NULL,
      growth_target NUMERIC,
      next_check_in_date TEXT NOT NULL,
      notes TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referrer_links (
      prospect_id TEXT NOT NULL,
      referrer_id TEXT NOT NULL,
      PRIMARY KEY (prospect_id, referrer_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS related_contact_links (
      prospect_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (prospect_id, contact_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lead_source_configs (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pipeline_stage_configs (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      idle_threshold INTEGER,
      "order" INTEGER NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activity_type_configs (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_system BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_config (
      id TEXT PRIMARY KEY,
      fund_target NUMERIC NOT NULL,
      company_name TEXT NOT NULL,
      default_rep_id TEXT
    )
  `);

  // Create indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS people_organization_id_idx ON people (organization_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS people_assigned_rep_id_idx ON people (assigned_rep_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS activities_person_id_idx ON activities (person_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS funding_entities_person_id_idx ON funding_entities (person_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS funded_investments_person_id_idx ON funded_investments (person_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS funded_investments_funding_entity_id_idx ON funded_investments (funding_entity_id)`);
}
