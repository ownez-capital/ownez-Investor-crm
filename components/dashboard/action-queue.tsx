"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/constants";
import type { PersonWithComputed } from "@/lib/types";

interface ActionQueueItem {
  person: PersonWithComputed;
  daysOverdue: number | null;
  isDueToday: boolean;
}

interface ActionQueueProps {
  items: ActionQueueItem[];
}

const MAX_VISIBLE = 8;

function UrgencyTag({ item }: { item: ActionQueueItem }) {
  if (item.daysOverdue !== null && item.daysOverdue > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-alert-red/10 px-2 py-0.5 text-xs font-medium text-alert-red shrink-0">
        Overdue {item.daysOverdue}d
      </span>
    );
  }
  if (item.isDueToday) {
    return (
      <span className="inline-flex items-center rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy shrink-0">
        Due today
      </span>
    );
  }
  if (item.person.isStale) {
    return (
      <span className="inline-flex items-center rounded-full bg-alert-red/10 px-2 py-0.5 text-xs font-medium text-alert-red shrink-0">
        Stale
      </span>
    );
  }
  return null;
}

export function ActionQueue({ items }: ActionQueueProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Action Items ({items.length})
        </h2>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="divide-y">
          {visible.map((item, index) => (
            <Link
              key={item.person.id}
              data-testid={`action-queue-item-${item.person.id}`}
              href={`/person/${item.person.id}`}
              className="block px-3 md:px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              {/* Desktop: single row */}
              <div className="hidden md:flex items-center gap-4">
                <span className="w-6 text-sm font-medium text-muted-foreground tabular-nums text-right shrink-0">
                  {index + 2}.
                </span>
                <span className="font-medium text-navy shrink-0 min-w-[140px]">
                  {item.person.fullName}
                </span>
                {item.person.pipelineStage && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {STAGE_LABELS[item.person.pipelineStage]}
                  </Badge>
                )}
                <span className="text-sm tabular-nums text-navy shrink-0">
                  {formatCurrency(item.person.initialInvestmentTarget)}
                </span>
                <UrgencyTag item={item} />
                <span className="text-sm text-muted-foreground truncate">
                  {item.person.nextActionDetail ?? "—"}
                </span>
              </div>
              {/* Mobile: two lines */}
              <div className="flex md:hidden flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                      {index + 2}.
                    </span>
                    <span className="font-medium text-navy text-sm truncate">
                      {item.person.fullName}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums text-navy shrink-0">
                    {formatCurrency(item.person.initialInvestmentTarget)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pl-5 min-w-0 flex-wrap">
                  {item.person.pipelineStage && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {STAGE_LABELS[item.person.pipelineStage]}
                    </Badge>
                  )}
                  <UrgencyTag item={item} />
                </div>
                <p className="text-xs text-muted-foreground pl-5 line-clamp-1">
                  {item.person.nextActionDetail ?? "—"}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-4 py-2.5 text-sm font-medium text-gold hover:text-gold-hover border-t transition-colors"
          >
            Show {hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}
