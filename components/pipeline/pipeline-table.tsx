"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, MessageSquare, ArrowRight } from "lucide-react";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import { STAGE_LABELS, LEAD_SOURCE_LABELS, NEXT_ACTION_TYPES, PIPELINE_STAGES } from "@/lib/constants";
import { InlineQuickLog } from "./inline-quick-log";
import type { PersonWithComputed, PipelineStage, LeadSource, User, LeadSourceConfig } from "@/lib/types";

type SortKey = "fullName" | "organizationName" | "pipelineStage" | "initialInvestmentTarget" | "growthTarget" | "leadSource" | "activityCount" | "daysSinceLastTouch" | "nextActionDetail" | "nextActionDate" | "assignedRepName";

interface PipelineTableProps {
  people: PersonWithComputed[];
  users?: User[];
  initialRepFilter?: string;
  leadSources?: LeadSourceConfig[];
}

export function PipelineTable({ people, users = [], initialRepFilter = "", leadSources = [] }: PipelineTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("nextActionDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "">("");
  const [repFilter, setRepFilter] = useState<string>(initialRepFilter);
  const [staleOnly, setStaleOnly] = useState(false);
  const [repPickerOpen, setRepPickerOpen] = useState<string | null>(null);
  const [localReps, setLocalReps] = useState<Record<string, string | null>>({});
  const [quickLogOpen, setQuickLogOpen] = useState<string | null>(null);
  const [advancingStage, setAdvancingStage] = useState<string | null>(null);

  const reps = users.filter((u) => u.isActive && u.role === "rep");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function reassignRep(personId: string, newRepId: string | null) {
    await fetch(`/api/persons/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedRepId: newRepId }),
    });
    setLocalReps((prev) => ({ ...prev, [personId]: newRepId }));
    setRepPickerOpen(null);
  }

  async function advanceStage(person: PersonWithComputed) {
    const stages = ["prospect", "initial_contact", "discovery", "pitch", "active_engagement", "soft_commit", "commitment_processing", "kyc_docs", "funded"];
    const currentIdx = stages.indexOf(person.pipelineStage ?? "");
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return;
    const nextStage = stages[currentIdx + 1];
    const nextLabel = STAGE_LABELS[nextStage as PipelineStage] ?? nextStage;
    if (!confirm(`Advance ${person.fullName} to ${nextLabel}?`)) return;

    setAdvancingStage(person.id);
    try {
      await fetch(`/api/persons/${person.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStage: nextStage }),
      });
      window.location.reload();
    } finally {
      setAdvancingStage(null);
    }
  }

  function getNextStageName(person: PersonWithComputed): string | null {
    const stages = ["prospect", "initial_contact", "discovery", "pitch", "active_engagement", "soft_commit", "commitment_processing", "kyc_docs", "funded"];
    const currentIdx = stages.indexOf(person.pipelineStage ?? "");
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return null;
    return STAGE_LABELS[stages[currentIdx + 1] as PipelineStage] ?? null;
  }

  function getEffectiveRepId(person: PersonWithComputed): string | null {
    return localReps.hasOwnProperty(person.id) ? localReps[person.id] : person.assignedRepId;
  }

  function getRepName(repId: string | null): string | null {
    if (!repId) return null;
    return users.find((u) => u.id === repId)?.fullName ?? null;
  }

  const filtered = useMemo(() => {
    let result = [...people];
    if (stageFilter) result = result.filter((p) => p.pipelineStage === stageFilter);
    if (sourceFilter) result = result.filter((p) => p.leadSource === sourceFilter);
    if (repFilter === "unassigned") result = result.filter((p) => {
      const repId = localReps.hasOwnProperty(p.id) ? localReps[p.id] : p.assignedRepId;
      return repId === null;
    });
    else if (repFilter) result = result.filter((p) => {
      const repId = localReps.hasOwnProperty(p.id) ? localReps[p.id] : p.assignedRepId;
      return repId === repFilter;
    });
    if (staleOnly) result = result.filter((p) => p.isStale || p.isOverdue);
    return result;
  }, [people, stageFilter, sourceFilter, repFilter, staleOnly, localReps]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortKey) {
        case "fullName": aVal = a.fullName; bVal = b.fullName; break;
        case "organizationName": aVal = a.organizationName ?? ""; bVal = b.organizationName ?? ""; break;
        case "pipelineStage": {
          const stageOrder = PIPELINE_STAGES.findIndex((s) => s.key === a.pipelineStage);
          const stageOrderB = PIPELINE_STAGES.findIndex((s) => s.key === b.pipelineStage);
          aVal = stageOrder; bVal = stageOrderB; break;
        }
        case "initialInvestmentTarget": aVal = a.initialInvestmentTarget ?? 0; bVal = b.initialInvestmentTarget ?? 0; break;
        case "growthTarget": aVal = a.growthTarget ?? 0; bVal = b.growthTarget ?? 0; break;
        case "leadSource": aVal = a.leadSource ?? ""; bVal = b.leadSource ?? ""; break;
        case "activityCount": aVal = a.activityCount; bVal = b.activityCount; break;
        case "daysSinceLastTouch": aVal = a.daysSinceLastTouch ?? 999; bVal = b.daysSinceLastTouch ?? 999; break;
        case "nextActionDetail": aVal = a.nextActionDetail ?? ""; bVal = b.nextActionDetail ?? ""; break;
        case "nextActionDate": aVal = a.nextActionDate ?? "9999"; bVal = b.nextActionDate ?? "9999"; break;
        case "assignedRepName": aVal = a.assignedRepName ?? ""; bVal = b.assignedRepName ?? ""; break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const hasFilters = stageFilter || sourceFilter || repFilter || staleOnly;

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  const TH = ({ column, children, className }: { column: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-4 py-2.5 font-medium cursor-pointer select-none hover:text-navy transition-colors ${className ?? ""}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon column={column} />
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}
          className="rounded-md border bg-card px-2.5 py-1.5 text-xs"
        >
          <option value="">All Stages</option>
          {PIPELINE_STAGES.filter((s) => !["nurture", "dead", "funded"].includes(s.key)).map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as LeadSource | "")}
          className="rounded-md border bg-card px-2.5 py-1.5 text-xs"
        >
          <option value="">All Sources</option>
          {leadSources.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        {reps.length > 0 && (
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="rounded-md border bg-card px-2.5 py-1.5 text-xs"
          >
            <option value="">All Reps</option>
            <option value="unassigned">Unassigned</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.fullName}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(e) => setStaleOnly(e.target.checked)}
            className="rounded"
          />
          Stale Only
        </label>

        {hasFilters && (
          <button
            onClick={() => { setStageFilter(""); setSourceFilter(""); setRepFilter(""); setStaleOnly(false); }}
            className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/80"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {sorted.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No prospects match your filters
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <TH column="fullName">Name</TH>
                <TH column="organizationName">Company</TH>
                <TH column="pipelineStage">Stage</TH>
                <TH column="initialInvestmentTarget" className="text-right">Initial Inv.</TH>
                <TH column="growthTarget" className="text-right">Growth Target</TH>
                <TH column="leadSource">Source</TH>
                <TH column="activityCount" className="text-right">Touches</TH>
                <TH column="daysSinceLastTouch" className="text-right">Days Idle</TH>
                <TH column="assignedRepName">Rep</TH>
                <TH column="nextActionDetail">Next Action</TH>
                <TH column="nextActionDate">Date</TH>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((person) => {
                const nextStageName = getNextStageName(person);
                return (
                <React.Fragment key={person.id}>
                <tr
                  className={`border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer group ${quickLogOpen === person.id ? "bg-gold/5" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/person/${person.id}?from=pipeline`} className="font-medium text-navy hover:text-gold transition-colors">
                      {person.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {person.organizationName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-[10px]">
                      {person.pipelineStage ? STAGE_LABELS[person.pipelineStage] : "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(person.initialInvestmentTarget)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(person.growthTarget)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {person.leadSource ? LEAD_SOURCE_LABELS[person.leadSource] ?? person.leadSource : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {person.activityCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={person.isStale ? "text-alert-red font-medium" : ""}>
                      {person.daysSinceLastTouch ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs relative">
                    {reps.length > 0 ? (
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRepPickerOpen(repPickerOpen === person.id ? null : person.id); }}
                          className="flex items-center gap-1 hover:text-gold transition-colors"
                        >
                          {getEffectiveRepId(person) ? (
                            <span className="text-muted-foreground">{getRepName(getEffectiveRepId(person))}</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">Unassigned</span>
                          )}
                        </button>
                        {repPickerOpen === person.id && (
                          <div className="absolute z-10 top-full left-0 mt-1 w-40 rounded-md border bg-card shadow-md py-1">
                            <button
                              onClick={() => reassignRep(person.id, null)}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-muted/50"
                            >
                              Unassign
                            </button>
                            {reps.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => reassignRep(person.id, r.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-navy hover:bg-muted/50"
                              >
                                {r.fullName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {getEffectiveRepId(person) ? getRepName(getEffectiveRepId(person)) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">Unassigned</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                    {person.nextActionDetail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={person.isOverdue ? "text-alert-red font-medium" : "text-muted-foreground"}>
                      {formatRelativeDate(person.nextActionDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(person.isStale || person.isOverdue) && (
                        <span className="inline-block h-2 w-2 rounded-full bg-alert-red" />
                      )}
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickLogOpen(quickLogOpen === person.id ? null : person.id); }}
                          className="p-1 rounded hover:bg-gold/20 text-muted-foreground hover:text-gold transition-colors"
                          title="Quick Log"
                        >
                          <MessageSquare size={14} />
                        </button>
                        {nextStageName && (
                          <button
                            onClick={(e) => { e.stopPropagation(); advanceStage(person); }}
                            disabled={advancingStage === person.id}
                            className="p-1 rounded hover:bg-gold/20 text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
                            title={`Advance to ${nextStageName}`}
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                {quickLogOpen === person.id && (
                  <InlineQuickLog
                    person={person}
                    onDone={() => setQuickLogOpen(null)}
                  />
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
