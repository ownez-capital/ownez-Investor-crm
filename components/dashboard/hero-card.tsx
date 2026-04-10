import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/constants";
import type { PersonWithComputed } from "@/lib/types";
import { ArrowRight } from "lucide-react";

interface HeroCardProps {
  person: PersonWithComputed;
  daysOverdue: number | null;
  isDueToday: boolean;
}

export function HeroCard({ person, daysOverdue, isDueToday }: HeroCardProps) {
  return (
    <div
      data-testid={`action-queue-item-${person.id}`}
      className="rounded-lg border-l-4 border-l-navy bg-card p-6 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-navy">
            {person.fullName}
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {person.organizationName && (
              <>
                <span>{person.organizationName}</span>
                <span>·</span>
              </>
            )}
            {person.pipelineStage && (
              <Badge variant="secondary" className="text-xs">
                {STAGE_LABELS[person.pipelineStage]}
              </Badge>
            )}
            {person.initialInvestmentTarget && (
              <>
                <span>·</span>
                <span className="tabular-nums font-medium text-navy">
                  {formatCurrency(person.initialInvestmentTarget)}
                </span>
              </>
            )}
          </div>
          <p className="text-base text-foreground">
            {person.nextActionDetail ?? "No action detail"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div>
          {daysOverdue !== null && daysOverdue > 0 ? (
            <span className="inline-flex items-center rounded-full bg-alert-red/10 px-2.5 py-0.5 text-sm font-medium text-alert-red">
              Overdue {daysOverdue}d
            </span>
          ) : isDueToday ? (
            <span className="inline-flex items-center rounded-full bg-navy/10 px-2.5 py-0.5 text-sm font-medium text-navy">
              Due today
            </span>
          ) : person.isStale ? (
            <span className="inline-flex items-center rounded-full bg-alert-red/10 px-2.5 py-0.5 text-sm font-medium text-alert-red">
              Stale · {person.daysSinceLastTouch}d idle
            </span>
          ) : null}
        </div>
        <Link
          href={`/person/${person.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:text-gold transition-colors"
        >
          Open
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

export function HeroCardEmpty({ nextUpPerson }: { nextUpPerson: PersonWithComputed | null }) {
  return (
    <div className="rounded-lg border border-healthy-green/30 bg-healthy-green-light p-6">
      <p className="text-lg font-medium text-healthy-green">All caught up.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {nextUpPerson ? (
          <>
            Next action is{" "}
            <Link
              href={`/person/${nextUpPerson.id}`}
              className="text-gold hover:underline font-medium"
            >
              {nextUpPerson.fullName}
            </Link>{" "}
            on {nextUpPerson.nextActionDate}
          </>
        ) : (
          "Pipeline healthy — no upcoming actions"
        )}
      </p>
    </div>
  );
}
