"use client";

import { useMemo, useState } from "react";
import { Zap, Paperclip, ChevronDown, ChevronRight, Target } from "lucide-react";
import { ACTIVITY_TYPES, NEXT_ACTION_TYPES } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/format";
import type { Activity, User } from "@/lib/types";

function commitmentTypeLabel(key: string | null | undefined): string {
  if (!key) return "Next Action";
  return NEXT_ACTION_TYPES.find((t) => t.key === key)?.label ?? "Next Action";
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "call", label: "Calls" },
  { key: "email", label: "Emails" },
  { key: "meeting", label: "Meetings" },
  { key: "note", label: "Notes" },
];

interface ActivityTimelineProps {
  activities: Activity[];
  users: User[];
}

export function ActivityTimeline({ activities, users }: ActivityTimelineProps) {
  const [filter, setFilter] = useState("all");

  const filtered = activities.filter((a) => {
    if (filter === "all") return true;
    return a.activityType === filter;
  });

  // Audit markers (stage_change, reassignment, commitment_set) always render
  // regardless of active filter — they form the backbone of the narrative.
  // See DESIGN-SPEC.md §6.4.5.
  const auditMarkers = activities.filter(
    (a) =>
      a.activityType === "stage_change" ||
      a.activityType === "reassignment" ||
      a.activityType === "commitment_set"
  );
  const withAuditMarkers =
    filter === "all"
      ? filtered
      : [
          ...filtered.filter(
            (a) =>
              a.activityType !== "stage_change" &&
              a.activityType !== "reassignment" &&
              a.activityType !== "commitment_set"
          ),
          ...auditMarkers,
        ].sort(
          (a, b) =>
            b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "")
        );

  // Index commitments by id so fulfillment links in TimelineEntry can resolve
  // the commitment detail/due-date they reference without re-scanning.
  const commitmentsById = useMemo(() => {
    const m = new Map<string, Activity>();
    for (const a of activities) {
      if (a.activityType === "commitment_set") m.set(a.id, a);
    }
    return m;
  }, [activities]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-navy">Activity Timeline</h3>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
              filter === opt.key
                ? "bg-navy text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {withAuditMarkers.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground italic">
          No activity logged yet.
        </p>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[13px] top-3 bottom-3 w-0.5 bg-border" />

          <div className="space-y-0">
            {withAuditMarkers.map((activity) => {
              const typeConfig = ACTIVITY_TYPES.find((t) => t.key === activity.activityType);
              const logger = users.find((u) => u.id === activity.loggedById);
              const isAuto = activity.source !== "manual";

              if (activity.activityType === "stage_change") {
                return (
                  <div key={activity.id} className="relative flex items-center py-2 pl-[28px]">
                    {/* Stage change dot on the line */}
                    <div className="absolute left-[10px] flex h-[10px] w-[10px] items-center justify-center rounded-full bg-muted-foreground/30 ring-2 ring-background" />
                    <span className="text-[10px] md:text-xs text-muted-foreground italic">
                      {activity.detail} · {formatDate(activity.date)}
                    </span>
                  </div>
                );
              }

              if (activity.activityType === "commitment_set") {
                return <CommitmentMarker key={activity.id} activity={activity} />;
              }

              const fulfills =
                activity.fulfillsCommitmentId != null
                  ? commitmentsById.get(activity.fulfillsCommitmentId) ?? null
                  : null;

              return (
                <TimelineEntry
                  key={activity.id}
                  activity={activity}
                  typeConfig={typeConfig}
                  logger={logger}
                  isAuto={isAuto}
                  fulfillsCommitment={fulfills}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline marker for a Commitment Set activity row. Per DESIGN-SPEC §6.4.5:
 *
 *   ◉ Commitment set · Follow up · Q3 deck · due Mar 5
 *   ◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ✓ fulfilled (2d late)
 *   ◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ↺ superseded
 *   ◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ✕ cancelled
 */
function CommitmentMarker({ activity }: { activity: Activity }) {
  const label = commitmentTypeLabel(activity.commitmentType);
  const detail = activity.commitmentDetail?.trim();
  const due = activity.commitmentDueDate ? formatDate(activity.commitmentDueDate) : null;

  let statusBadge: { text: string; className: string } | null = null;
  if (activity.commitmentStatus === "fulfilled") {
    const lateDays =
      activity.commitmentClosedDate && activity.commitmentDueDate
        ? daysBetween(activity.commitmentDueDate, activity.commitmentClosedDate)
        : 0;
    const lateSuffix = lateDays > 0 ? ` (${lateDays}d late)` : "";
    statusBadge = {
      text: `✓ fulfilled${lateSuffix}`,
      className: "text-healthy-green",
    };
  } else if (activity.commitmentStatus === "superseded") {
    statusBadge = { text: "↺ superseded", className: "text-muted-foreground" };
  } else if (activity.commitmentStatus === "cancelled") {
    statusBadge = { text: "✕ cancelled", className: "text-muted-foreground" };
  }

  return (
    <div
      data-testid={`timeline-commitment-marker-${activity.id}`}
      className="relative flex items-center py-2 pl-[28px]"
    >
      {/* Commitment marker dot on the line (gold so it reads as an intent) */}
      <div className="absolute left-[8px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-gold/15 ring-2 ring-background">
        <Target size={9} className="text-gold" aria-hidden />
      </div>
      <span className="text-[10px] md:text-xs text-muted-foreground italic">
        Commitment set · <span className="font-medium text-navy not-italic">{label}</span>
        {detail ? <span className="not-italic"> · {detail}</span> : null}
        {due ? <span> · due {due}</span> : null}
        {statusBadge ? (
          <>
            {" · "}
            <span className={`not-italic font-medium ${statusBadge.className}`}>
              {statusBadge.text}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}

function TimelineEntry({
  activity,
  typeConfig,
  logger,
  isAuto,
  fulfillsCommitment,
}: {
  activity: Activity;
  typeConfig: typeof ACTIVITY_TYPES[number] | undefined;
  logger: User | undefined;
  isAuto: boolean;
  fulfillsCommitment: Activity | null;
}) {
  const [docsExpanded, setDocsExpanded] = useState(false);
  const hasDocs = activity.documentsAttached.length > 0;

  return (
    <div className="relative flex gap-3 py-3 pl-0">
      {/* Dot on the timeline line */}
      <div
        className="relative z-10 mt-0.5 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-white text-[10px] font-medium ring-2 ring-background"
        style={{ backgroundColor: typeConfig?.color ?? "#6b7280" }}
      >
        {typeConfig?.label?.[0] ?? "?"}
      </div>

      <div className="flex-1 min-w-0">
        {/* Line 1: type + date */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-navy">
            {typeConfig?.label ?? activity.activityType}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(activity.date)} {formatTime(activity.time)}
          </span>
        </div>

        {/* Line 2: detail */}
        <p className="mt-0.5 text-sm text-foreground/80 leading-relaxed">
          {activity.detail}
        </p>

        {/* Fulfillment link: shown when this activity closed out a commitment.
            Links visually to the Commitment Set row rendered above. */}
        {fulfillsCommitment ? (
          <p
            data-testid={`timeline-fulfillment-link-${activity.id}`}
            className="mt-1 text-xs font-medium text-healthy-green"
          >
            ✓ Fulfilled: {commitmentTypeLabel(fulfillsCommitment.commitmentType)}
            {fulfillsCommitment.commitmentDetail
              ? ` — ${fulfillsCommitment.commitmentDetail}`
              : ""}
            {fulfillsCommitment.commitmentDueDate && activity.date
              ? (() => {
                  const late = daysBetween(
                    fulfillsCommitment.commitmentDueDate!,
                    activity.date
                  );
                  return late > 0 ? ` (${late}d late)` : "";
                })()
              : ""}
          </p>
        ) : null}

        {/* Line 3: metadata — logger, attempted, auto, docs */}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {logger && (
            <span className="text-xs text-muted-foreground" title={logger.fullName}>
              {logger.fullName.split(" ").map((n) => n[0]).join("")}
            </span>
          )}
          {activity.outcome === "attempted" && (
            <span className="text-[10px] font-medium text-alert-red">Attempted</span>
          )}
          {isAuto && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gold">
              <Zap size={9} />AUTO
            </span>
          )}
          {hasDocs && (
            <button
              onClick={() => setDocsExpanded(!docsExpanded)}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-navy hover:text-gold transition-colors"
            >
              <Paperclip size={10} />
              {activity.documentsAttached.length} {activity.documentsAttached.length === 1 ? "file" : "files"}
              {docsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}
        </div>

        {/* Expanded documents list */}
        {hasDocs && docsExpanded && (
          <div className="mt-2 flex flex-col gap-1 pl-1">
            {activity.documentsAttached.map((doc) => (
              <a
                key={doc}
                href="#"
                className="inline-flex items-center gap-1.5 text-xs text-navy hover:text-gold transition-colors"
                title={doc}
              >
                <Paperclip size={11} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{doc}</span>
              </a>
            ))}
          </div>
        )}

        {/* Add notes prompt for auto-synced without annotation */}
        {isAuto && !activity.annotation && (
          <p className="mt-1 text-[10px] text-gold italic cursor-pointer hover:underline">
            Add notes
          </p>
        )}
      </div>
    </div>
  );
}
