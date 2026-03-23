"use client";

import { useState, useEffect } from "react";
import { LEAD_SOURCES } from "@/lib/constants";
import { ChevronDown, ChevronUp } from "lucide-react";

const TOP_COUNT = 5;

interface LeadSourcePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function LeadSourcePicker({ value, onChange }: LeadSourcePickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [sortedSources, setSortedSources] = useState(LEAD_SOURCES);
  const [newSource, setNewSource] = useState("");
  const [adding, setAdding] = useState(false);

  // Fetch frequency-sorted sources once on mount
  useEffect(() => {
    fetch("/api/lead-sources")
      .then((r) => r.json())
      .then((data) => {
        if (data.sources) setSortedSources(data.sources);
      })
      .catch(() => {});
  }, []);

  const primary = sortedSources.slice(0, TOP_COUNT);
  const secondary = sortedSources.slice(TOP_COUNT);
  const selectedInSecondary = secondary.some((s) => s.key === value);
  const showSecondary = expanded || selectedInSecondary;

  async function handleAddSource() {
    if (!newSource.trim()) return;
    const label = newSource.trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    // If it already exists, just select it
    const existing = sortedSources.find((s) => s.key === key);
    if (existing) {
      onChange(existing.key);
      setNewSource("");
      setAdding(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/lead-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Failed to create lead source");
      const created = await res.json();
      setSortedSources((prev) => [...prev, { key: created.key, label: created.label }]);
      onChange(created.key);
    } catch {
      setSortedSources((prev) => [...prev, { key, label }]);
      onChange(key);
    }
    setNewSource("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {primary.map((source) => (
          <Chip
            key={source.key}
            label={source.label}
            active={value === source.key}
            onClick={() => onChange(source.key)}
          />
        ))}
        {showSecondary && secondary.map((source) => (
          <Chip
            key={source.key}
            label={source.label}
            active={value === source.key}
            onClick={() => onChange(source.key)}
          />
        ))}
        {!showSecondary && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:text-navy hover:bg-muted transition-colors"
          >
            More <ChevronDown size={11} />
          </button>
        )}
      </div>

      {/* Expanded controls: collapse + add new */}
      {showSecondary && (
        <div className="flex items-center gap-2 mt-2">
          {adding ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="New source name..."
                className="rounded-full border bg-white px-3 py-1 text-xs flex-1 outline-none focus:border-gold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSource();
                  if (e.key === "Escape") { setAdding(false); setNewSource(""); }
                }}
              />
              <button
                type="button"
                onClick={handleAddSource}
                disabled={!newSource.trim()}
                className="rounded-full bg-gold px-2.5 py-1 text-[10px] font-medium text-navy hover:bg-gold-hover disabled:opacity-40"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setNewSource(""); }}
                className="text-[10px] text-muted-foreground hover:text-navy"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-[10px] font-medium text-gold hover:underline"
              >
                + New source
              </button>
              {!selectedInSecondary && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-navy ml-auto"
                >
                  Less <ChevronUp size={10} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-gold text-navy"
          : "bg-muted text-muted-foreground hover:bg-gold/15 hover:text-navy"
      }`}
    >
      {label}
    </button>
  );
}
