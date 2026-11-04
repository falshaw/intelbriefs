/**
 * IntelBriefs - Intelligence Briefing System
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Watchlist Management Page (IB-01)
 * Lists all watched items as cards with frequency badges, next/last run dates,
 * delta summaries, toggle active/inactive, delete, and "Run Now" trigger.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Eye,
  Trash2,
  Play,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pause,
  RotateCcw,
  Calendar,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { describeChangedFields } from "@/lib/changed-fields";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchlistRun {
  id: string;
  changedFields: string[];
  previousSummary: string | null;
  createdAt: string;
  brief: {
    id: string;
    status: string;
    summary: string | null;
    talkingPoints?: string[];
    riskSignals?: string[];
    createdAt: string;
  };
}

interface WatchlistItem {
  id: string;
  name: string;
  company: string | null;
  briefType: string;
  briefMode: string;
  frequency: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
  _count?: { runs: number };
  runs?: WatchlistRun[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WatchlistPage() {
  // Read the clock once per mount: the render body must stay pure.
  const [now] = useState(() => Date.now());
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<WatchlistRun[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [briefType, setBriefType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [briefMode, setBriefMode] = useState<"QUICK" | "DEEP">("DEEP");
  const [frequency, setFrequency] = useState<
    "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  >("WEEKLY");
  const [addLoading, setAddLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const data = await res.json();
        setItems(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || undefined,
          briefType,
          briefMode,
          frequency,
        }),
      });
      if (res.ok) {
        setName("");
        setCompany("");
        setShowAdd(false);
        fetchItems();
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove from watchlist?")) return;
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const handleToggleActive = async (item: WatchlistItem) => {
    await fetch(`/api/watchlist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    fetchItems();
  };

  const handleTriggerRun = async (id: string) => {
    setTriggeringId(id);
    try {
      await fetch(`/api/watchlist/${id}/run`, { method: "POST" });
      // Short delay so the pipeline starts before we refresh
      setTimeout(fetchItems, 1000);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedRuns(null);
      return;
    }
    setExpandedId(id);
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/watchlist/${id}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedRuns(data.data?.runs || []);
      }
    } finally {
      setRunsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Formatters
  // ---------------------------------------------------------------------------

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const formatRelative = (d: string) => {
    const diff = now - new Date(d).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(d);
  };

  const formatNextRun = (d: string) => {
    const diff = new Date(d).getTime() - now;
    if (diff < 0) return "overdue";
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "< 1h";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const frequencyLabel: Record<string, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    BIWEEKLY: "Bi-weekly",
    MONTHLY: "Monthly",
  };

  const frequencyColor: Record<string, string> = {
    DAILY: "bg-accent-soft text-accent border-accent/30",
    WEEKLY: "bg-accent-soft text-accent border-accent/30",
    BIWEEKLY: "bg-accent-soft text-accent border-accent/30",
    MONTHLY: "bg-accent-soft text-accent border-accent/30",
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Watchlist</h1>
          <p className="text-ink-65 text-sm">
            Recurring intelligence briefs on people and companies
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add to Watchlist
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Northwind Traders"
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">Type</label>
              <select
                value={briefType}
                onChange={(e) =>
                  setBriefType(e.target.value as "PERSON" | "COMPANY")
                }
                className="w-full"
              >
                <option value="PERSON">Person</option>
                <option value="COMPANY">Company</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">Mode</label>
              <select
                value={briefMode}
                onChange={(e) =>
                  setBriefMode(e.target.value as "QUICK" | "DEEP")
                }
                className="w-full"
              >
                <option value="DEEP">Deep (~10 min)</option>
                <option value="QUICK">Quick (~5 min)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(
                    e.target.value as
                      | "DAILY"
                      | "WEEKLY"
                      | "BIWEEKLY"
                      | "MONTHLY",
                  )
                }
                className="w-full"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every 2 Weeks</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addLoading}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              {addLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              Start Watching
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const latestRun = item.runs?.[0] as WatchlistRun | undefined;
            const latestBrief = latestRun?.brief || null;
            const isExpanded = expandedId === item.id;
            const latestChanges = latestRun?.changedFields || [];

            return (
              <div key={item.id} className="card p-0 overflow-hidden">
                {/* Card Header */}
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => handleExpand(item.id)}
                        className="mt-0.5 text-ink-45 hover:text-ink-65"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        {/* Name + Company (linked to detail) */}
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/watchlist/${item.id}`}
                            className="font-medium truncate hover:text-accent transition-colors"
                          >
                            {item.name}
                          </Link>
                          {item.company && (
                            <span className="text-ink-45 text-sm truncate">
                              @ {item.company}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              item.isActive
                                ? "bg-teal-soft text-teal border border-teal/30"
                                : "bg-g-bg2 text-ink-45 border border-line"
                            }`}
                          >
                            {item.isActive ? "Active" : "Paused"}
                          </span>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-45 flex-wrap">
                          {/* Frequency badge */}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                              frequencyColor[item.frequency] ||
                              "bg-g-bg2 text-ink-45 border-line"
                            }`}
                          >
                            {frequencyLabel[item.frequency] || item.frequency}
                          </span>

                          <span>
                            {item.briefType} / {item.briefMode}
                          </span>

                          {/* Next run */}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Next: {formatNextRun(item.nextRunAt)}
                          </span>

                          {/* Last run */}
                          {item.lastRunAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last: {formatRelative(item.lastRunAt)}
                            </span>
                          )}

                          <span>{item._count?.runs ?? 0} runs</span>

                          {/* Delta badge from latest run */}
                          {latestRun && (
                            <span
                              className={`flex items-center gap-1 ${
                                latestChanges.length > 0
                                  ? "text-accent"
                                  : "text-ink-45"
                              }`}
                            >
                              {latestChanges.length > 0 ? (
                                <>
                                  <AlertTriangle className="w-3 h-3" />
                                  {latestChanges.length} change
                                  {latestChanges.length !== 1 ? "s" : ""}
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3 h-3" />
                                  No changes
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Latest brief summary */}
                        {latestBrief?.summary && (
                          <p className="text-sm text-ink-65 mt-2 line-clamp-2">
                            {latestBrief.summary}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <button
                        onClick={() => handleTriggerRun(item.id)}
                        disabled={triggeringId === item.id}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-accent transition-colors"
                        title="Run now"
                      >
                        {triggeringId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-ink-65 transition-colors"
                        title={item.isActive ? "Pause" : "Resume"}
                      >
                        {item.isActive ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                      <Link
                        href={`/watchlist/${item.id}`}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-ink-65 transition-colors"
                        title="View details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-red transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Run History (inline preview) */}
                {isExpanded && (
                  <div className="border-t border-line-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <h4 className="text-xs font-medium text-ink-65">
                        Recent Runs
                      </h4>
                      <Link
                        href={`/watchlist/${item.id}`}
                        className="text-[10px] text-accent hover:underline"
                      >
                        View all with deltas
                      </Link>
                    </div>
                    {runsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 text-ink-45 animate-spin" />
                      </div>
                    ) : expandedRuns && expandedRuns.length > 0 ? (
                      <div className="space-y-2">
                        {expandedRuns.slice(0, 5).map((run) => (
                          <div
                            key={run.id}
                            className="bg-g-bg2 rounded-lg p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-ink-45">
                                  {formatDate(run.createdAt)}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    run.brief.status === "COMPLETE"
                                      ? "bg-teal-soft text-teal"
                                      : run.brief.status === "FAILED"
                                        ? "bg-red-soft text-red"
                                        : "bg-amber-soft text-amber"
                                  }`}
                                >
                                  {run.brief.status}
                                </span>
                                {run.changedFields.length > 0 ? (
                                  <span className="text-[10px] text-accent flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {run.changedFields.length} change
                                    {run.changedFields.length !== 1
                                      ? "s"
                                      : ""}: {describeChangedFields(run.changedFields)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-ink-45 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    No changes
                                  </span>
                                )}
                              </div>
                              <Link
                                href={`/briefs/${run.brief.id}`}
                                className="text-xs text-accent hover:underline"
                              >
                                View Brief
                              </Link>
                            </div>
                            {run.brief.summary && (
                              <p className="text-sm text-ink-65 line-clamp-2">
                                {run.brief.summary}
                              </p>
                            )}
                            {run.brief.riskSignals &&
                              run.brief.riskSignals.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {run.brief.riskSignals.map(
                                    (signal: string, i: number) => (
                                      <span
                                        key={i}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-soft text-red border border-red/30"
                                      >
                                        {signal}
                                      </span>
                                    ),
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                        {expandedRuns.length > 5 && (
                          <Link
                            href={`/watchlist/${item.id}`}
                            className="block text-center text-xs text-accent hover:underline py-1"
                          >
                            + {expandedRuns.length - 5} more runs
                          </Link>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-45 py-2">
                        No runs yet. Click the play button to trigger the first
                        brief.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Eye className="w-8 h-8 text-ink-45 mx-auto mb-3" />
          <p className="text-ink-45 mb-1">No watched items yet</p>
          <p className="text-ink-45 text-sm">
            Add people or companies to your watchlist for recurring intelligence
            briefs.
          </p>
        </div>
      )}
    </div>
  );
}
