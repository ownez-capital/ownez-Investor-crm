import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/lib/constants";
import { formatRelativeDate } from "@/lib/format";
import type { PersonWithComputed } from "@/lib/types";

export function NeedsAttention({ people }: { people: PersonWithComputed[] }) {
  // Sort by severity: overdue first, then by days idle descending
  const sorted = [...people].sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (b.daysSinceLastTouch ?? 0) - (a.daysSinceLastTouch ?? 0);
  });

  return (
    <div id="needs-attention">
      <h2 className="mb-3 text-lg font-semibold text-navy">Needs Attention</h2>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-healthy-green/30 bg-healthy-green-light p-6 text-center">
          <p className="text-base font-medium text-healthy-green">Pipeline Healthy</p>
          <p className="mt-1 text-sm text-muted-foreground">No stale or overdue prospects</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-alert-red/20 bg-card">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium text-right">Days Idle</th>
                <th className="px-4 py-2.5 font-medium">Next Action</th>
                <th className="px-4 py-2.5 font-medium">Next Action Date</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((person) => (
                <tr
                  key={person.id}
                  data-testid={`needs-attention-${person.id}`}
                  className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-alert-red" />
                      <Link href={`/person/${person.id}`} className="font-medium text-navy hover:text-gold transition-colors">
                        {person.fullName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">
                      {person.pipelineStage ? STAGE_LABELS[person.pipelineStage] : "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-alert-red">
                    {person.daysSinceLastTouch ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {person.nextActionDetail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={person.isOverdue ? "text-alert-red font-medium" : "text-muted-foreground"}>
                      {formatRelativeDate(person.nextActionDate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
