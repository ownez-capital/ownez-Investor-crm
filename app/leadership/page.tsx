import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { getDataService } from "@/lib/data";
import { StatColumn } from "@/components/leadership/stat-column";
import { PipelineFunnel } from "@/components/leadership/pipeline-funnel";
import { SourceROITable } from "@/components/leadership/source-roi-table";
import { TopReferrers } from "@/components/leadership/top-referrers";
import { RedFlags } from "@/components/leadership/red-flags";

export default async function LeadershipPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Auth guard: role or permission override
  if (!hasPermission(session, "canViewLeadership")) {
    redirect("/");
  }

  // Marketing role gets partial access: Source ROI + Top Referrers only.
  // Admins and rep-with-override see the full board.
  const isPartialAccess = session.role === "marketing";

  const ds = await getDataService();
  const [stats, meetingsCount, funnel, sourceROI, topReferrers, redFlags] = await Promise.all([
    ds.getLeadershipStats(),
    ds.getMeetingsCount(30),
    ds.getFunnelData(),
    ds.getSourceROI(),
    ds.getTopReferrers(5),
    ds.getRedFlags(),
  ]);

  // Ken's partial view: source attribution + top referrers only
  if (isPartialAccess) {
    return (
      <div className="p-8 max-w-[720px]">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-navy">Source Attribution</h1>
          <p className="text-sm text-muted-foreground">Lead source performance &amp; referrer network</p>
        </div>

        <SourceROITable rows={sourceROI} />
        <TopReferrers referrers={topReferrers} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[720px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-navy">Leadership</h1>
        <p className="text-sm text-muted-foreground">Fund performance &amp; pipeline overview</p>
      </div>

      <div className="flex gap-4 items-start">
        {/* Left: stat column */}
        <StatColumn stats={stats} meetingsCount={meetingsCount} />

        {/* Right: funnel + source ROI + referrers + red flags */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pipeline Funnel</h3>
          <PipelineFunnel funnel={funnel} />
          <SourceROITable rows={sourceROI} />
          <TopReferrers referrers={topReferrers} />
          <RedFlags prospects={redFlags} />
        </div>
      </div>
    </div>
  );
}
