import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDataService } from "@/lib/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "@/components/admin/users-tab";
import { LeadSourcesTab } from "@/components/admin/lead-sources-tab";
import { PipelineStagesTab } from "@/components/admin/pipeline-stages-tab";
import { ActivityTypesTab } from "@/components/admin/activity-types-tab";
import { SystemSettingsTab } from "@/components/admin/system-settings-tab";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const ds = await getDataService();
  const [users, leadSources, unassigned, systemConfig, pipelineStages, activityTypes] = await Promise.all([
    ds.getUsers(),
    ds.getLeadSources({ includeInactive: true }),
    ds.getUnassignedProspects(),
    ds.getSystemConfig(),
    ds.getPipelineStageConfigs(),
    ds.getActivityTypeConfigs(),
  ]);

  return (
    <div className="p-8 max-w-[720px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-navy">Admin</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="lead-sources">Lead Sources</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="activity-types">Activity Types</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab users={users} unassignedCount={unassigned.length} />
        </TabsContent>

        <TabsContent value="lead-sources">
          <LeadSourcesTab sources={leadSources} userRole={session.role} />
        </TabsContent>

        <TabsContent value="stages">
          <PipelineStagesTab stages={pipelineStages} />
        </TabsContent>

        <TabsContent value="activity-types">
          <ActivityTypesTab types={activityTypes} />
        </TabsContent>

        <TabsContent value="settings">
          <SystemSettingsTab config={systemConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
