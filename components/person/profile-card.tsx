"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LOST_REASONS } from "@/lib/constants";
import { formatCurrency, getTodayCT } from "@/lib/format";
import { LeadSourcePicker } from "@/components/ui/lead-source-picker";
import { StageBar } from "@/components/person/stage-bar";
import { OrganizationSection } from "@/components/person/organization-section";
import type { PersonWithComputed, User, LeadSourceConfig } from "@/lib/types";

interface ProfileCardProps {
  person: PersonWithComputed;
  users: User[];
  orgMembers: PersonWithComputed[];
  sessionRole: string;
  leadSources: LeadSourceConfig[];
}

export function ProfileCard({ person, users, orgMembers, sessionRole, leadSources }: ProfileCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [stageInlineActive, setStageInlineActive] = useState(false);

  const canEdit = sessionRole === "rep" || sessionRole === "admin";
  const isAdmin = sessionRole === "admin";

  async function saveField(field: string, value: unknown) {
    const body: Record<string, unknown> = { [field]: value };
    if (field === "committedAmount" && value) {
      body.commitmentDate = getTodayCT();
    }

    // Reassignment uses dedicated route that auto-logs activity
    const url = field === "assignedRepId"
      ? `/api/persons/${person.id}/rep`
      : `/api/persons/${person.id}`;
    const method = field === "assignedRepId" ? "PATCH" : "PATCH";
    const repBody = field === "assignedRepId" ? { assignedRepId: value } : body;

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repBody),
    });
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Stage dots at top */}
      {person.pipelineStage && (
        <div className="px-4 pt-4 pb-2">
          <StageBar
            currentStage={person.pipelineStage}
            personId={person.id}
            person={person}
            onInlineModeChange={setStageInlineActive}
          />
        </div>
      )}

      {/* Main content grid */}
      <div className="px-4 pb-4 space-y-3">
        {/* Organization */}
        <div className="pt-1">
          <OrganizationSection person={person} orgMembers={orgMembers} />
        </div>

        {/* Financials row */}
        <div className="grid grid-cols-3 gap-4 pt-3 pb-2 border-t">
          <FinancialCell
            label="Target"
            value={person.initialInvestmentTarget}
            field="initialInvestmentTarget"
            editing={editing}
            setEditing={setEditing}
            saveField={saveField}
            canEdit={canEdit}
          />
          <FinancialCell
            label="Growth"
            value={person.growthTarget}
            field="growthTarget"
            editing={editing}
            setEditing={setEditing}
            saveField={saveField}
            canEdit={canEdit}
          />
          <FinancialCell
            label="Committed"
            value={person.committedAmount}
            field="committedAmount"
            editing={editing}
            setEditing={setEditing}
            saveField={saveField}
            canEdit={canEdit}
            nudge={!person.committedAmount && canEdit}
          />
        </div>

        {/* Lead Source */}
        {editing === "leadSource" && canEdit ? (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground tracking-wide">Lead Source</p>
            <LeadSourcePicker
              value={person.leadSource ?? ""}
              onChange={(val) => saveField("leadSource", val || null)}
            />
            <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:text-navy">
              Cancel
            </button>
          </div>
        ) : (
          <DetailRow
            label="Lead Source"
            value={leadSources.find((s) => s.key === person.leadSource)?.label ?? "—"}
            editable={canEdit}
            onClick={() => canEdit && setEditing("leadSource")}
          />
        )}

        {/* Assigned Rep */}
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-28 shrink-0 tracking-wide">Rep</span>
            <select
              value={person.assignedRepId ?? ""}
              onChange={(e) => saveField("assignedRepId", e.target.value || null)}
              className="rounded-md border bg-white px-2 py-1 text-xs flex-1"
            >
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        ) : (
          <DetailRow
            label="Rep"
            value={person.assignedRepName ?? "—"}
            editable={false}
            onClick={undefined}
          />
        )}

        {/* Collaborators */}
        <CollaboratorsField
          person={person}
          users={users}
          canEdit={canEdit}
          suppressAddSelect={stageInlineActive}
          onSave={(ids) => saveField("collaboratorIds", ids)}
        />

        {/* Lost Reason — only when dead */}
        {person.pipelineStage === "dead" && (
          editing === "lostReason" && canEdit ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-28 shrink-0 tracking-wide">Lost Reason</span>
              <select
                value={person.lostReason ?? ""}
                onChange={(e) => saveField("lostReason", e.target.value || null)}
                className="rounded-md border bg-white px-2 py-1 text-xs flex-1"
                autoFocus
              >
                <option value="">—</option>
                {LOST_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <DetailRow
              label="Lost Reason"
              value={LOST_REASONS.find((r) => r.key === person.lostReason)?.label ?? "—"}
              editable={canEdit}
              onClick={() => canEdit && setEditing("lostReason")}
            />
          )
        )}
      </div>
    </div>
  );
}

function CollaboratorsField({
  person,
  users,
  canEdit,
  suppressAddSelect,
  onSave,
}: {
  person: PersonWithComputed;
  users: User[];
  canEdit: boolean;
  suppressAddSelect?: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const collaborators = users.filter((u) => person.collaboratorIds.includes(u.id));
  // Users that could be added (non-admin, not the assigned rep)
  const available = users.filter(
    (u) =>
      !person.collaboratorIds.includes(u.id) &&
      u.role !== "admin" &&
      u.id !== person.assignedRepId
  );

  function addCollaborator(userId: string) {
    if (!userId) return;
    onSave([...person.collaboratorIds, userId]);
    setShowAdd(false);
  }

  function removeCollaborator(userId: string) {
    onSave(person.collaboratorIds.filter((id) => id !== userId));
  }

  return (
    <article className="flex items-start gap-2">
      <span className="text-[10px] text-muted-foreground w-28 shrink-0 pt-0.5 tracking-wide">Collaborators</span>
      <section className="flex-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {collaborators.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1">
              <span className="text-xs font-medium text-navy">{u.fullName}</span>
              {canEdit && (
                <button
                  onClick={() => removeCollaborator(u.id)}
                  className="text-muted-foreground/30 hover:text-alert-red transition-colors text-sm leading-none"
                  aria-label={`remove collaborator ${u.fullName}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {collaborators.length === 0 && !showAdd && (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </div>
        {canEdit && available.length > 0 && !suppressAddSelect && (
          showAdd ? (
            <div className="flex items-center gap-1 mt-1.5">
              <select
                value=""
                onChange={(e) => addCollaborator(e.target.value)}
                className="rounded border border-muted bg-white px-2 py-0.5 text-xs flex-1"
                aria-label="add collaborator"
                autoFocus
                onBlur={() => setShowAdd(false)}
              >
                <option value="">Select person…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowAdd(false); }}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-sm leading-none"
                aria-label="cancel"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-1 text-[10px] text-muted-foreground/40 hover:text-navy transition-colors flex items-center gap-0.5"
            >
              <span className="text-xs leading-none">+</span> Add
            </button>
          )
        )}
      </section>
    </article>
  );
}

function DetailRow({
  label,
  value,
  editable,
  onClick,
}: {
  label: string;
  value: string;
  editable: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 ${editable ? "cursor-pointer hover:bg-muted/30 -mx-1 px-1 py-0.5 rounded transition-colors" : ""}`}
      onClick={onClick}
    >
      <span className="text-[10px] text-muted-foreground w-28 shrink-0 tracking-wide">{label}</span>
      <span className="text-xs font-medium text-navy flex-1">{value}</span>
      {editable && (
        <Pencil size={9} className="text-transparent group-hover:text-muted-foreground/35 transition-colors shrink-0" />
      )}
    </div>
  );
}

function FinancialCell({
  label,
  value,
  field,
  editing,
  setEditing,
  saveField,
  canEdit,
  nudge,
}: {
  label: string;
  value: number | null;
  field: string;
  editing: string | null;
  setEditing: (v: string | null) => void;
  saveField: (field: string, value: unknown) => void;
  canEdit: boolean;
  nudge?: boolean;
}) {
  if (editing === field && canEdit) {
    return (
      <div>
        <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
        <Input
          type="number"
          defaultValue={value != null ? String(value) : ""}
          className="text-xs h-7"
          autoFocus
          onBlur={(e) => {
            const raw = e.target.value.trim();
            saveField(field, raw ? Number(raw) : null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const raw = (e.target as HTMLInputElement).value.trim();
              saveField(field, raw ? Number(raw) : null);
            }
            if (e.key === "Escape") setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`group ${canEdit ? "cursor-pointer hover:bg-muted/30 -mx-1 px-1 py-0.5 rounded transition-colors" : ""}`}
      onClick={() => canEdit && setEditing(field)}
    >
      <p className="text-[10px] text-muted-foreground tracking-wide mb-0.5">{label}</p>
      {value != null ? (
        <p className="text-sm font-semibold text-navy tabular-nums">{formatCurrency(value)}</p>
      ) : nudge ? (
        <p className="text-xs text-gold/60 italic font-medium">Not set</p>
      ) : (
        <p className="text-xs text-muted-foreground/40 italic">Not set</p>
      )}
    </div>
  );
}
