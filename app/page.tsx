import { getDataService } from "@/lib/data";
import { getTodayCT } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { HeroCard, HeroCardEmpty } from "@/components/dashboard/hero-card";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { StatsFooter } from "@/components/dashboard/stats-footer";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import type { PersonWithComputed } from "@/lib/types";

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getActionQueue(people: PersonWithComputed[], today: string) {
  const seen = new Set<string>();
  const result: PersonWithComputed[] = [];

  function addUnique(list: PersonWithComputed[]) {
    for (const p of list) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        result.push(p);
      }
    }
  }

  // 1. Overdue: driven by computed p.isOverdue. In legacy mode this is
  // equivalent to `nextActionDate < today`; in v2 mode (COMMITMENTS_V2=on)
  // it reads from open commitment rows, so a fulfilled/superseded commitment
  // correctly clears the overdue flag even though Person.nextActionDate may
  // still point at the old past date. See lib/stale.ts computeIsOverdue.
  const overdue = people
    .filter(
      (p) =>
        p.isOverdue &&
        p.pipelineStage !== "dead" &&
        p.pipelineStage !== "funded" &&
        p.pipelineStage !== "nurture"
    )
    .sort((a, b) => {
      const aDays = a.nextActionDate ? daysBetween(a.nextActionDate, today) : 0;
      const bDays = b.nextActionDate ? daysBetween(b.nextActionDate, today) : 0;
      if (bDays !== aDays) return bDays - aDays;
      return (b.initialInvestmentTarget ?? 0) - (a.initialInvestmentTarget ?? 0);
    });
  addUnique(overdue);

  // 2. Stale but not overdue: isStale === true, not already captured above
  const stale = people
    .filter(
      (p) =>
        p.isStale &&
        p.pipelineStage !== "dead" &&
        p.pipelineStage !== "funded" &&
        p.pipelineStage !== "nurture"
    )
    .sort((a, b) => (b.daysSinceLastTouch ?? 0) - (a.daysSinceLastTouch ?? 0));
  addUnique(stale);

  // 3. Due today (sorted by dollar value)
  const dueToday = people
    .filter(
      (p) =>
        p.nextActionDate === today &&
        p.pipelineStage !== "dead" &&
        p.pipelineStage !== "funded"
    )
    .sort(
      (a, b) =>
        (b.initialInvestmentTarget ?? 0) - (a.initialInvestmentTarget ?? 0)
    );
  addUnique(dueToday);

  // 4. Nurture re-engage today
  const reengageToday = people.filter(
    (p) => p.pipelineStage === "nurture" && p.reengageDate === today
  );
  addUnique(reengageToday);

  return result;
}

export default async function DashboardPage() {
  const ds = await getDataService();
  const today = getTodayCT();
  const session = await getSession();

  const [stats, allPeople, recentActivities, users] = await Promise.all([
    ds.getDashboardStats(),
    ds.getPeople({ roles: ["prospect"] }),
    ds.getRecentActivities({ limit: 20 }),
    ds.getUsers(),
  ]);

  const queue = getActionQueue(allPeople, today);

  // Find next upcoming person for empty state
  const nextUpPerson =
    allPeople
      .filter(
        (p) =>
          p.nextActionDate &&
          p.nextActionDate > today &&
          p.pipelineStage !== "dead"
      )
      .sort((a, b) =>
        (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? "")
      )[0] ?? null;

  // Hero = first item, rest go to action queue
  const hero = queue[0] ?? null;
  const rest = queue.slice(1);

  // Compute urgency info for each item. Uses the computed p.isOverdue flag
  // so v2 mode honors commitment close-out state, not the mirrored
  // Person.nextActionDate (which can lag behind fulfilled/superseded rows).
  function getUrgencyInfo(person: PersonWithComputed) {
    const daysOverdue =
      person.isOverdue && person.nextActionDate
        ? daysBetween(person.nextActionDate, today)
        : null;
    const isDueToday = person.nextActionDate === today && !person.isOverdue;
    return { daysOverdue, isDueToday };
  }

  const heroUrgency = hero ? getUrgencyInfo(hero) : null;
  const queueItems = rest.map((person) => ({
    person,
    ...getUrgencyInfo(person),
  }));

  return (
    <div className="p-4 md:p-8 max-w-[1200px]">
      {/* Zone 1: Header */}
      <DashboardHeader
        prospects={allPeople.filter(p => p.roles.includes("prospect"))}
        currentUserId={session?.userId ?? ""}
        users={users}
      />

      <div className="space-y-6">
        {/* Zone 2: Hero Card */}
        {hero && heroUrgency ? (
          <HeroCard
            person={hero}
            daysOverdue={heroUrgency.daysOverdue}
            isDueToday={heroUrgency.isDueToday}
          />
        ) : (
          <HeroCardEmpty nextUpPerson={nextUpPerson} />
        )}

        {/* Zone 3: Action Queue */}
        <ActionQueue items={queueItems} />

        {/* Zone 4: Recent Activity (unchanged) */}
        <RecentActivity activities={recentActivities} users={users} />

        {/* Zone 5: Stats Footer */}
        <StatsFooter stats={stats} />
      </div>
    </div>
  );
}
