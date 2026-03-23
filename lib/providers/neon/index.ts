import type { DataService } from "../../types";
import { createDb } from "./db";
import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";
import * as peopleQueries from "./queries/people";
import * as activitiesQueries from "./queries/activities";
import * as organizationsQueries from "./queries/organizations";
import * as fundingQueries from "./queries/funding";
import * as leadershipQueries from "./queries/leadership";
import * as adminQueries from "./queries/admin";
import * as relationshipsQueries from "./queries/relationships";

const globalForNeon = globalThis as unknown as {
  neonInitialized: boolean | undefined;
};

export function createNeonDataService(): DataService {
  const db = createDb();

  // Lazy init: run migrations + seed on first call
  async function ensureInitialized() {
    if (globalForNeon.neonInitialized) return;
    await runMigrations(db);
    await seedDatabase(db);
    globalForNeon.neonInitialized = true;
  }

  return {
    // ─── People ───
    async getPeople(filters) {
      await ensureInitialized();
      return peopleQueries.getPeople(db, filters);
    },
    async getPerson(id) {
      await ensureInitialized();
      return peopleQueries.getPerson(db, id);
    },
    async createPerson(data) {
      await ensureInitialized();
      return peopleQueries.createPerson(db, data);
    },
    async updatePerson(id, data) {
      await ensureInitialized();
      return peopleQueries.updatePerson(db, id, data);
    },
    async searchPeople(query) {
      await ensureInitialized();
      return peopleQueries.searchPeople(db, query);
    },

    // ─── Activities ───
    async getActivities(personId, filters) {
      await ensureInitialized();
      return activitiesQueries.getActivities(db, personId, filters);
    },
    async getRecentActivities(filters) {
      await ensureInitialized();
      return activitiesQueries.getRecentActivities(db, filters);
    },
    async createActivity(personId, data) {
      await ensureInitialized();
      return activitiesQueries.createActivity(db, personId, data);
    },

    // ─── Funding Entities ───
    async getFundingEntities(personId) {
      await ensureInitialized();
      return fundingQueries.getFundingEntities(db, personId);
    },
    async createFundingEntity(data) {
      await ensureInitialized();
      return fundingQueries.createFundingEntity(db, data);
    },

    // ─── Organizations ───
    async getOrganizations() {
      await ensureInitialized();
      return organizationsQueries.getOrganizations(db);
    },
    async searchOrganizations(query) {
      await ensureInitialized();
      return organizationsQueries.searchOrganizations(db, query);
    },
    async createOrganization(data) {
      await ensureInitialized();
      return organizationsQueries.createOrganization(db, data);
    },

    // ─── Funded Investments ───
    async getFundedInvestments(personId) {
      await ensureInitialized();
      return fundingQueries.getFundedInvestments(db, personId);
    },
    async createFundedInvestment(data) {
      await ensureInitialized();
      return fundingQueries.createFundedInvestment(db, data);
    },

    // ─── Dashboard ───
    async getDashboardStats() {
      await ensureInitialized();
      return leadershipQueries.getDashboardStats(db);
    },

    // ─── Users ───
    async getUsers() {
      await ensureInitialized();
      return adminQueries.getUsers(db);
    },
    async getUserByUsername(username) {
      await ensureInitialized();
      return adminQueries.getUserByUsername(db, username);
    },

    // ─── Relationships ───
    async getReferrerForProspect(prospectId) {
      await ensureInitialized();
      return relationshipsQueries.getReferrerForProspect(db, prospectId);
    },
    async getRelatedContacts(prospectId) {
      await ensureInitialized();
      return relationshipsQueries.getRelatedContacts(db, prospectId);
    },
    async addReferrer(prospectId, referrerId) {
      await ensureInitialized();
      return relationshipsQueries.addReferrer(db, prospectId, referrerId);
    },
    async addRelatedContact(prospectId, contactId, role) {
      await ensureInitialized();
      return relationshipsQueries.addRelatedContact(db, prospectId, contactId, role);
    },
    async removeRelatedContact(prospectId, contactId) {
      await ensureInitialized();
      return relationshipsQueries.removeRelatedContact(db, prospectId, contactId);
    },
    async getReferrals(referrerId) {
      await ensureInitialized();
      return relationshipsQueries.getReferrals(db, referrerId);
    },

    // ─── Analytics ───
    async getLeadSourceCounts() {
      await ensureInitialized();
      return leadershipQueries.getLeadSourceCounts(db);
    },

    // ─── Leadership ───
    async getLeadershipStats() {
      await ensureInitialized();
      return leadershipQueries.getLeadershipStats(db);
    },
    async getMeetingsCount(days) {
      await ensureInitialized();
      return leadershipQueries.getMeetingsCount(db, days);
    },
    async getFunnelData() {
      await ensureInitialized();
      return leadershipQueries.getFunnelData(db);
    },
    async getSourceROI() {
      await ensureInitialized();
      return leadershipQueries.getSourceROI(db);
    },
    async getDrilldownProspects(filter) {
      await ensureInitialized();
      return leadershipQueries.getDrilldownProspects(db, filter);
    },
    async getDrilldownActivities(filter) {
      await ensureInitialized();
      return leadershipQueries.getDrilldownActivities(db, filter);
    },

    // ─── Top Referrers ───
    async getTopReferrers(limit) {
      await ensureInitialized();
      return relationshipsQueries.getTopReferrers(db, limit);
    },

    // ─── Red Flags ───
    async getRedFlags() {
      await ensureInitialized();
      return peopleQueries.getRedFlags(db);
    },

    // ─── Lead Sources ───
    async getLeadSources(opts) {
      await ensureInitialized();
      return adminQueries.getLeadSources(db, opts);
    },
    async createLeadSource(data) {
      await ensureInitialized();
      return adminQueries.createLeadSource(db, data);
    },
    async updateLeadSource(key, data) {
      await ensureInitialized();
      return adminQueries.updateLeadSource(db, key, data);
    },
    async reorderLeadSources(keys) {
      await ensureInitialized();
      return adminQueries.reorderLeadSources(db, keys);
    },

    // ─── Admin — Users ───
    async updateUserPermissions(userId, permissions) {
      await ensureInitialized();
      return adminQueries.updateUserPermissions(db, userId, permissions);
    },
    async deactivateUser(userId, reassignToId) {
      await ensureInitialized();
      return adminQueries.deactivateUser(db, userId, reassignToId);
    },
    async getUnassignedProspects() {
      await ensureInitialized();
      return peopleQueries.getUnassignedProspects(db);
    },

    // ─── System Config ───
    async getSystemConfig() {
      await ensureInitialized();
      return adminQueries.getSystemConfig(db);
    },
    async updateSystemConfig(data) {
      await ensureInitialized();
      return adminQueries.updateSystemConfig(db, data);
    },

    // ─── Pipeline Stage Config ───
    async getPipelineStageConfigs() {
      await ensureInitialized();
      return adminQueries.getPipelineStageConfigs(db);
    },
    async updatePipelineStageConfig(key, data) {
      await ensureInitialized();
      return adminQueries.updatePipelineStageConfig(db, key, data);
    },

    // ─── Activity Type Config ───
    async getActivityTypeConfigs() {
      await ensureInitialized();
      return adminQueries.getActivityTypeConfigs(db);
    },
    async updateActivityTypeConfig(key, data) {
      await ensureInitialized();
      return adminQueries.updateActivityTypeConfig(db, key, data);
    },
    async createActivityType(data) {
      await ensureInitialized();
      return adminQueries.createActivityType(db, data);
    },

    // ─── Testing ───
    // resetData is NOT implemented for Neon provider
  };
}
