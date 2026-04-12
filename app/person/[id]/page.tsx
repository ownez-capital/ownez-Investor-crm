import { notFound } from "next/navigation";
import Link from "next/link";
import { getDataService } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { isCommitmentsV2Enabled } from "@/lib/feature-flags";
import { IdentityBar } from "@/components/person/identity-bar";
import { NextActionBar } from "@/components/person/next-action-bar";
import { QuickLog } from "@/components/person/quick-log";
import { ActivityTimeline } from "@/components/person/activity-timeline";
import { ProfileCard } from "@/components/person/profile-card";
import { RelationshipsSection } from "@/components/person/relationships-section";
import { BackgroundNotes } from "@/components/person/background-notes";
import { SetLastViewed } from "@/components/set-last-viewed";
import { Separator } from "@/components/ui/separator";

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const session = await getSession();
  const ds = await getDataService();

  const person = await ds.getPerson(id);
  if (!person) notFound();

  const [activities, entities, relatedContacts, referrer, users] = await Promise.all([
    ds.getActivities(id),
    ds.getFundingEntities(id),
    ds.getRelatedContacts(id),
    ds.getReferrerForProspect(id),
    ds.getUsers(),
  ]);

  // Get referrals if there's a referrer
  const referrals = referrer ? await ds.getReferrals(referrer.id) : [];

  // Get org members
  const orgMembers = person.organizationId
    ? await ds.getPeople({ search: "" }).then((all) =>
        all.filter((p) => p.organizationId === person.organizationId)
      )
    : [];

  return (
    <div className="max-w-[1100px] overflow-x-hidden">
      <SetLastViewed
        id={person.id}
        fullName={person.fullName}
        pipelineStage={person.pipelineStage}
        organizationName={person.organizationName}
      />
      {/* Back link */}
      <div className="px-3 md:px-8 pt-3 md:pt-6">
        <Link
          href={from === "leadership" ? "/leadership" : from === "pipeline" ? "/pipeline" : from === "people" ? "/people" : "/"}
          className="text-xs text-muted-foreground hover:text-gold transition-colors"
        >
          &larr; {from === "leadership" ? "Leadership" : from === "pipeline" ? "Pipeline" : from === "people" ? "People" : "Dashboard"}
        </Link>
      </div>

      {/* Cockpit Zone — sticky below last-viewed bar: identity, quick log, next action */}
      <div className="sticky top-[33px] z-10 bg-background border-b px-3 md:px-8 py-3 md:py-4 space-y-2 md:space-y-3 overflow-hidden">
        <IdentityBar person={person} />
        <QuickLog person={person} commitmentsV2Enabled={isCommitmentsV2Enabled()} />
        <NextActionBar person={person} />
      </div>

      {/* Detail Zone — scrollable */}
      <div className="px-3 md:px-8 py-4 md:py-6">
        <div className="flex flex-col lg:flex-row lg:gap-6">
          {/* Left column: working data */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Profile Card — stage, org, financials, lead source, rep */}
            <ProfileCard
              person={person}
              users={users}
              orgMembers={orgMembers}
              sessionRole={session?.role ?? "rep"}
            />

            {/* Activity Timeline */}
            <ActivityTimeline activities={activities} users={users} />
          </div>

          {/* Right column: reference data (side panel on lg+, below on mobile) */}
          <div className="lg:w-[300px] xl:w-[340px] lg:shrink-0 mt-5 lg:mt-0 space-y-5">
            {/* Relationships — collapsible: referrer, funding entities, related contacts */}
            <RelationshipsSection
              person={person}
              entities={entities}
              relatedContacts={relatedContacts}
              referrer={referrer}
              referrals={referrals}
            />

            <Separator />

            {/* Background Notes */}
            <BackgroundNotes personId={person.id} notes={person.notes} />
          </div>
        </div>

        {/* Mobile separator — hidden on lg+ where columns handle separation */}
        <Separator className="mt-5 lg:hidden" />
      </div>
    </div>
  );
}
