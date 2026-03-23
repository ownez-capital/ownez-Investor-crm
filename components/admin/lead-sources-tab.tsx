"use client";

import { useState, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown, Plus } from "lucide-react";
import type { LeadSourceConfig } from "@/lib/types";

interface LeadSourcesTabProps {
  sources: LeadSourceConfig[];
  userRole?: string;
}

export function LeadSourcesTab({ sources: initialSources, userRole = "admin" }: LeadSourcesTabProps) {
  const isAdmin = userRole === "admin";
  const [sources, setSources] = useState(initialSources);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  async function saveLabelEdit(key: string) {
    const trimmed = editLabel.trim();
    if (!trimmed) { setEditingKey(null); return; }
    await fetch(`/api/admin/lead-sources/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    });
    setSources((prev) => prev.map((s) => s.key === key ? { ...s, label: trimmed } : s));
    setEditingKey(null);
  }

  async function toggleActive(key: string, current: boolean) {
    setSources((prev) => prev.map((s) => s.key === key ? { ...s, isActive: !current } : s));
    await fetch(`/api/admin/lead-sources/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
  }

  async function move(index: number, direction: "up" | "down") {
    const newSources = [...sources];
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= newSources.length) return;
    [newSources[index], newSources[swapWith]] = [newSources[swapWith], newSources[index]];
    setSources(newSources);
    await fetch("/api/admin/lead-sources/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: newSources.map((s) => s.key) }),
    });
  }

  async function addSource() {
    const trimmed = newLabel.trim();
    if (!trimmed) { setAddingNew(false); return; }
    const res = await fetch("/api/admin/lead-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    });
    const created: LeadSourceConfig = await res.json();
    setSources((prev) => [...prev, created]);
    setNewLabel("");
    setAddingNew(false);
  }

  return (
    <div>
      <div className="rounded-lg border overflow-hidden">
        {sources.map((source, i) => (
          <div
            key={source.key}
            className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 transition-colors ${
              !source.isActive ? "opacity-50 bg-muted/20" : ""
            }`}
          >
            {/* Reorder arrows */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => move(i, "up")}
                disabled={i === 0}
                className="p-0.5 text-muted-foreground hover:text-navy disabled:opacity-20 transition-colors"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => move(i, "down")}
                disabled={i === sources.length - 1}
                className="p-0.5 text-muted-foreground hover:text-navy disabled:opacity-20 transition-colors"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {/* Label (editable) */}
            <div className="flex-1 min-w-0">
              {editingKey === source.key ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => saveLabelEdit(source.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLabelEdit(source.key);
                    if (e.key === "Escape") setEditingKey(null);
                  }}
                  className="w-full text-sm border-b border-gold outline-none bg-transparent text-navy"
                />
              ) : (
                <button
                  onClick={() => { setEditingKey(source.key); setEditLabel(source.label); }}
                  className="text-sm text-navy hover:text-gold transition-colors text-left w-full"
                >
                  {source.label}
                </button>
              )}
              <div className="text-[10px] text-muted-foreground font-mono">{source.key}</div>
            </div>

            {/* Active toggle — admin only */}
            {isAdmin && (
              <Switch
                checked={source.isActive}
                onCheckedChange={() => toggleActive(source.key, source.isActive)}
              />
            )}
          </div>
        ))}

        {/* Add new row */}
        {addingNew ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-gold/5 border-t">
            <div className="w-7 shrink-0" />
            <input
              ref={addInputRef}
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New source label…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addSource();
                if (e.key === "Escape") { setAddingNew(false); setNewLabel(""); }
              }}
              className="flex-1 text-sm border-b border-gold outline-none bg-transparent text-navy placeholder:text-muted-foreground"
            />
            <button
              onClick={addSource}
              className="text-xs px-3 py-1 rounded-full bg-gold text-white font-medium hover:bg-gold/90 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewLabel(""); }}
              className="text-xs text-muted-foreground hover:text-navy transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm text-muted-foreground hover:text-gold hover:bg-gold/5 transition-colors border-t"
          >
            <Plus size={14} />
            Add source
          </button>
        )}
      </div>
    </div>
  );
}
