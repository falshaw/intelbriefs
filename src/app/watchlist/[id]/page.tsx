/**
 * IntelBriefs - Intelligence Briefing System
 * Copyright (c) 2024-2026 Nick Falshaw
 *
 * Watchlist Detail Page (IB-01)
 * Shows a WatchlistItem's details, configuration, and chronological run history
 * with delta highlighting between consecutive runs.
 */

"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Loader2,
  Clock,
  Calendar,
  Eye,
  EyeOff,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefSnapshot {
  id: string;
  status: string;
  summary: string | null;
  talkingPoints: string[];
  riskSignals: string[];
  createdAt: string;
}

interface WatchlistRun {
  id: string;
  briefId: string;
  changedFields: string[];
  previousSummary: string | null;
  createdAt: string;
  brief: BriefSnapshot;
}

interface WatchlistItemDetail {
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
  runs: WatchlistRun[];
}

// ---------------------------------------------------------------------------
// Sentence-level diff utility
// ---------------------------------------------------------------------------

interface DiffSegment {
  text: string;
  type: "same" | "added" | "removed";
}

function sentenceDiff(oldText: string, newText: string): DiffSegment[] {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ text: newText, type: "added" }];
  if (!newText) return [{ text: oldText, type: "removed" }];

  // Split into sentences (keep delimiters)
  const splitSentences = (t: string) =>
    t
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const oldSentences = splitSentences(oldText);
  const newSentences = splitSentences(newText);

  const oldSet = new Set(oldSentences);
  const newSet = new Set(newSentences);

  const segments: DiffSegment[] = [];

  // Show removed sentences first
  for (const s of oldSentences) {
    if (!newSet.has(s)) {
      segments.push({ text: s, type: "removed" });
    }
  }

  // Then new sentences: same or added
  for (const s of newSentences) {
    if (oldSet.has(s)) {
      segments.push({ text: s, type: "same" });
    } else {
      segments.push({ text: s, type: "added" });
    }
  }

  return segments;
}

function arrayDiff(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[]; same: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((s) => !oldSet.has(s)),
    removed: oldArr.filter((s) => !newSet.has(s)),
    same: newArr.filter((s) => oldSet.has(s)),
  };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function WatchlistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // Read the clock once per mount: the render body must stay pure.
  const [now] = useState(() => Date.now());
  const [item, setItem] = useState<WatchlistItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/watchlist/${id}`);
      if (res.ok) {
        const json = await res.json();
        setItem(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/watchlist/${id}/run`, { method: "POST" });
      if (res.ok) {
        // Refresh after a short delay to show the new run
        setTimeout(fetchItem, 1500);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleToggleActive = async () => {
    if (!item) return;
    await fetch(`/api/watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    fetchItem();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatRelative = (d: string) => {
    const diff = new Date(d).getTime() - now;
    if (diff < 0) return "overdue";
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "< 1 hour";
    if (hours < 24) return `in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  };

  const frequencyLabel: Record<string, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    BIWEEKLY: "Every 2 weeks",
    MONTHLY: "Monthly",
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-4xl">
        <Link
          href="/watchlist"
          className="inline-flex items-center gap-2 text-sm text-ink-65 hover:text-ink-65 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Watchlist
        </Link>
        <div className="card text-center py-12">
          <p className="text-ink-45">Watchlist item not found.</p>
        </div>
      </div>
    );
  }

  // Build a map of run index -> previous run for delta comparison
  const runs = item.runs || [];

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-2 text-sm text-ink-65 hover:text-ink-65 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Watchlist
      </Link>

      {/* Header Card */}
      <div className="card-luxury mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              <h1 className="text-2xl font-bold">{item.name}</h1>
              {item.company && (
                <span className="text-ink-45 text-lg">@ {item.company}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-65">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  item.isActive
                    ? "bg-teal-soft text-teal border border-teal/30"
                    : "bg-g-bg2 text-ink-45 border border-line"
                }`}
              >
                {item.isActive ? "Active" : "Paused"}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {item.briefType} / {item.briefMode}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {frequencyLabel[item.frequency]}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Next: {formatRelative(item.nextRunAt)}
              </span>
              <span>{runs.length} runs</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              {item.isActive ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> Pause
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" /> Resume
                </>
              )}
            </button>
            <button
              onClick={handleRunNow}
              disabled={running}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Run Now
            </button>
          </div>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-line-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-ink-45">
              Created
            </span>
            <p className="text-sm mt-0.5">{formatDate(item.createdAt)}</p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-ink-45">
              Last Run
            </span>
            <p className="text-sm mt-0.5">
              {item.lastRunAt ? formatDateTime(item.lastRunAt) : "Never"}
            </p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-ink-45">
              Next Run
            </span>
            <p className="text-sm mt-0.5">{formatDateTime(item.nextRunAt)}</p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-ink-45">
              Total Runs
            </span>
            <p className="text-sm mt-0.5">{runs.length}</p>
          </div>
        </div>
      </div>

      {/* Run History */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Run History</h2>
        <button
          onClick={fetchItem}
          className="text-xs text-ink-45 hover:text-ink-65 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="card text-center py-12">
          <Clock className="w-8 h-8 text-ink-45 mx-auto mb-3" />
          <p className="text-ink-45 mb-1">No runs yet</p>
          <p className="text-ink-45 text-sm">
            Click &quot;Run Now&quot; to trigger the first intelligence brief.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, idx) => {
            // The previous run is the one after this in the array (since newest first)
            const previousRun: WatchlistRun | null = runs[idx + 1] || null;
            const isExpanded = expandedRunId === run.id;
            const hasChanges = run.changedFields.length > 0;

            // Compute live delta for expanded view
            const summaryDiff =
              isExpanded && previousRun
                ? sentenceDiff(
                    previousRun.brief.summary || "",
                    run.brief.summary || "",
                  )
                : null;

            const talkingPointsDiff =
              isExpanded && previousRun
                ? arrayDiff(
                    previousRun.brief.talkingPoints || [],
                    run.brief.talkingPoints || [],
                  )
                : null;

            const riskSignalsDiff =
              isExpanded && previousRun
                ? arrayDiff(
                    previousRun.brief.riskSignals || [],
                    run.brief.riskSignals || [],
                  )
                : null;

            return (
              <div key={run.id} className="card p-0 overflow-hidden">
                {/* Run header */}
                <button
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  className="w-full text-left p-4 hover:bg-g-bg2 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-ink-65">
                        {formatDateTime(run.createdAt)}
                      </span>

                      {/* Status badge */}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          run.brief.status === "COMPLETE"
                            ? "bg-teal-soft text-teal"
                            : run.brief.status === "FAILED"
                              ? "bg-red-soft text-red"
                              : "bg-amber-soft text-amber"
                        }`}
                      >
                        {run.brief.status}
                      </span>

                      {/* Delta badge */}
                      {idx < runs.length - 1 && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                            hasChanges
                              ? "bg-accent-soft text-accent border border-accent"
                              : "bg-g-bg2 text-ink-45 border border-line"
                          }`}
                        >
                          {hasChanges ? (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              {run.changedFields.length} change
                              {run.changedFields.length !== 1 ? "s" : ""}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              No changes
                            </>
                          )}
                        </span>
                      )}

                      {idx === runs.length - 1 && (
                        <span className="text-[10px] text-ink-45">
                          Initial run
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/briefs/${run.brief.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                    >
                      View Brief <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Summary preview (collapsed) */}
                  {!isExpanded && run.brief.summary && (
                    <p className="text-sm text-ink-45 mt-2 line-clamp-2">
                      {run.brief.summary}
                    </p>
                  )}
                </button>

                {/* Expanded delta view */}
                {isExpanded && (
                  <div className="border-t border-line-2 p-4 space-y-4">
                    {/* Summary section */}
                    <div>
                      <h4 className="text-xs font-medium text-ink-65 uppercase tracking-wider mb-2">
                        Summary
                      </h4>
                      {summaryDiff && summaryDiff.length > 0 ? (
                        <div className="text-sm leading-relaxed space-y-1">
                          {summaryDiff.map((seg, i) => (
                            <span
                              key={i}
                              className={
                                seg.type === "added"
                                  ? "bg-teal-soft text-teal px-1 rounded"
                                  : seg.type === "removed"
                                    ? "bg-red-soft text-red line-through px-1 rounded"
                                    : "text-ink-65"
                              }
                            >
                              {seg.text}{" "}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-65">
                          {run.brief.summary || "No summary available."}
                        </p>
                      )}
                    </div>

                    {/* Talking Points section */}
                    <div>
                      <h4 className="text-xs font-medium text-ink-65 uppercase tracking-wider mb-2">
                        Talking Points
                      </h4>
                      {talkingPointsDiff ? (
                        <ul className="space-y-1.5">
                          {talkingPointsDiff.removed.map((tp, i) => (
                            <li
                              key={`rm-${i}`}
                              className="flex items-start gap-2 text-sm"
                            >
                              <Minus className="w-3.5 h-3.5 mt-0.5 text-red shrink-0" />
                              <span className="text-red line-through">
                                {tp}
                              </span>
                            </li>
                          ))}
                          {talkingPointsDiff.same.map((tp, i) => (
                            <li
                              key={`same-${i}`}
                              className="flex items-start gap-2 text-sm"
                            >
                              <span className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span className="text-ink-65">{tp}</span>
                            </li>
                          ))}
                          {talkingPointsDiff.added.map((tp, i) => (
                            <li
                              key={`add-${i}`}
                              className="flex items-start gap-2 text-sm"
                            >
                              <Plus className="w-3.5 h-3.5 mt-0.5 text-teal shrink-0" />
                              <span className="text-teal">{tp}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="space-y-1.5">
                          {(run.brief.talkingPoints || []).map((tp, i) => (
                            <li
                              key={i}
                              className="text-sm text-ink-65 pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-accent-soft"
                            >
                              {tp}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(!run.brief.talkingPoints ||
                        run.brief.talkingPoints.length === 0) &&
                        !talkingPointsDiff && (
                          <p className="text-xs text-ink-45">
                            No talking points.
                          </p>
                        )}
                    </div>

                    {/* Risk Signals section */}
                    <div>
                      <h4 className="text-xs font-medium text-ink-65 uppercase tracking-wider mb-2">
                        Risk Signals
                      </h4>
                      {riskSignalsDiff ? (
                        <div className="flex flex-wrap gap-1.5">
                          {riskSignalsDiff.removed.map((rs, i) => (
                            <span
                              key={`rm-${i}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-red-soft text-red border border-red/30 line-through"
                            >
                              {rs}
                            </span>
                          ))}
                          {riskSignalsDiff.same.map((rs, i) => (
                            <span
                              key={`same-${i}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-g-bg2 text-ink-45 border border-line"
                            >
                              {rs}
                            </span>
                          ))}
                          {riskSignalsDiff.added.map((rs, i) => (
                            <span
                              key={`add-${i}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-teal-soft text-teal border border-teal/30"
                            >
                              + {rs}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(run.brief.riskSignals || []).map((rs, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-red-soft text-red border border-red/30"
                            >
                              {rs}
                            </span>
                          ))}
                        </div>
                      )}
                      {(!run.brief.riskSignals ||
                        run.brief.riskSignals.length === 0) &&
                        !riskSignalsDiff && (
                          <p className="text-xs text-ink-45">
                            No risk signals.
                          </p>
                        )}
                    </div>

                    {/* Previous summary comparison */}
                    {run.previousSummary && (
                      <div className="mt-3 p-3 bg-g-bg2 border border-line-2 rounded-lg">
                        <h4 className="text-[10px] font-medium text-ink-45 uppercase tracking-wider mb-1">
                          Previous Summary (for reference)
                        </h4>
                        <p className="text-xs text-ink-45 leading-relaxed">
                          {run.previousSummary}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
