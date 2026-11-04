/**
 * IntelBriefs - Source Quality Scoring Page (IB-05)
 * Copyright (c) 2024-2026 Nick Falshaw
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Globe,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Info,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceScoreEntry {
  id: string;
  domain: string;
  credibilityScore: number;
  category: string;
  notes: string | null;
  createdAt: string;
}

interface KnownDomain {
  category: string;
  score: number;
}

interface SourceStats {
  overview: {
    totalBriefs: number;
    totalSources: number;
    scoredSources: number;
    avgOverallScore: number;
    uniqueDomains: number;
    userOverrides: number;
  };
  categoryBreakdown: Record<string, { count: number; avgScore: number }>;
  typeBreakdown: Record<string, { count: number; avgScore: number }>;
  topDomains: {
    domain: string;
    timesUsed: number;
    avgScore: number;
    category: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 0.8) return "var(--teal)"; // green
  if (score >= 0.6) return "var(--amber)"; // yellow
  if (score >= 0.4) return "var(--amber)"; // orange
  return "var(--red)"; // red
}

function getScoreBadge(score: number): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (score >= 0.8)
    return {
      label: "High",
      bg: "rgba(16, 185, 129, 0.1)",
      text: "var(--teal)",
      border: "rgba(16, 185, 129, 0.3)",
    };
  if (score >= 0.6)
    return {
      label: "Medium",
      bg: "rgba(245, 158, 11, 0.1)",
      text: "var(--amber)",
      border: "rgba(245, 158, 11, 0.3)",
    };
  if (score >= 0.4)
    return {
      label: "Low",
      bg: "rgba(249, 115, 22, 0.1)",
      text: "var(--amber)",
      border: "rgba(249, 115, 22, 0.3)",
    };
  return {
    label: "Very Low",
    bg: "rgba(239, 68, 68, 0.1)",
    text: "var(--red)",
    border: "rgba(239, 68, 68, 0.3)",
  };
}

function getScoreIcon(score: number) {
  if (score >= 0.8) return ShieldCheck;
  if (score >= 0.6) return Info;
  if (score >= 0.4) return AlertTriangle;
  return XCircle;
}

const CATEGORIES = [
  { value: "academic", label: "Academic", defaultScore: 0.9 },
  { value: "government", label: "Government", defaultScore: 0.9 },
  {
    value: "established_media",
    label: "Established Media",
    defaultScore: 0.8,
  },
  { value: "industry", label: "Industry", defaultScore: 0.7 },
  { value: "blog", label: "Blog", defaultScore: 0.6 },
  { value: "forum", label: "Forum", defaultScore: 0.4 },
  { value: "social", label: "Social Media", defaultScore: 0.3 },
  { value: "unknown", label: "Unknown", defaultScore: 0.5 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const [userScores, setUserScores] = useState<SourceScoreEntry[]>([]);
  const [knownDomains, setKnownDomains] = useState<Record<string, KnownDomain>>(
    {},
  );
  const [categoryDefaults, setCategoryDefaults] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Form state
  const [domain, setDomain] = useState("");
  const [score, setScore] = useState(0.5);
  const [category, setCategory] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sources/scores");
      if (res.ok) {
        const data = await res.json();
        setUserScores(data.data.userScores || []);
        setKnownDomains(data.data.knownDomains || {});
        setCategoryDefaults(data.data.categoryDefaults || {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/sources/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.data || null);
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
    fetchStats();
  }, [fetchScores, fetchStats]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/sources/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          credibilityScore: score,
          category,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setDomain("");
        setScore(0.5);
        setCategory("unknown");
        setNotes("");
        setShowAdd(false);
        fetchScores();
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this score override?")) return;
    await fetch(`/api/sources/scores/${id}`, { method: "DELETE" });
    fetchScores();
  };

  const knownDomainEntries = Object.entries(knownDomains).sort(
    ([, a], [, b]) => b.score - a.score,
  );

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Source Quality</h1>
          <p className="text-ink-65 text-sm">
            Manage source credibility scores for intelligence briefs
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Override
        </button>
      </div>

      {/* Source Quality Stats */}
      {stats && (
        <div className="card mb-6 border-accent">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider">
              Quality Metrics
            </h2>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
            {[
              { label: "Briefs", value: stats.overview.totalBriefs },
              { label: "Sources", value: stats.overview.totalSources },
              { label: "Scored", value: stats.overview.scoredSources },
              {
                label: "Avg Score",
                value: `${(stats.overview.avgOverallScore * 100).toFixed(0)}%`,
                color: getScoreColor(stats.overview.avgOverallScore),
              },
              { label: "Domains", value: stats.overview.uniqueDomains },
              { label: "Overrides", value: stats.overview.userOverrides },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center p-2.5 rounded-lg bg-g-bg2 border border-line-2"
              >
                <div
                  className="text-lg font-bold"
                  style={{ color: stat.color || "var(--accent)" }}
                >
                  {stat.value}
                </div>
                <div className="text-[10px] text-ink-45">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tier Distribution */}
          {Object.keys(stats.categoryBreakdown).length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs text-ink-45 mb-2">Tier Distribution</h3>
              <div className="flex items-end gap-2 h-16">
                {["Tier 1", "Tier 2", "Tier 3", "Tier 4"].map((tier) => {
                  const data = stats.categoryBreakdown[tier];
                  const count = data?.count || 0;
                  const maxCount = Math.max(
                    ...Object.values(stats.categoryBreakdown).map(
                      (d) => d.count,
                    ),
                    1,
                  );
                  const height = Math.max(4, (count / maxCount) * 100);
                  const colors: Record<string, string> = {
                    "Tier 1": "var(--teal)",
                    "Tier 2": "var(--accent)",
                    "Tier 3": "var(--amber)",
                    "Tier 4": "var(--red)",
                  };
                  return (
                    <div
                      key={tier}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-ink-45">{count}</span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${height}%`,
                          backgroundColor: colors[tier] || "#666",
                          opacity: 0.6,
                          minHeight: "4px",
                        }}
                      />
                      <span className="text-[10px] text-ink-45">{tier}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Domains */}
          {stats.topDomains.length > 0 && (
            <div>
              <h3 className="text-xs text-ink-45 mb-2">Most Used Sources</h3>
              <div className="space-y-1">
                {stats.topDomains.slice(0, 8).map((d) => {
                  const badge = getScoreBadge(d.avgScore);
                  return (
                    <div
                      key={d.domain}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-g-bg2"
                    >
                      <Globe className="w-3 h-3 text-ink-45 shrink-0" />
                      <span className="text-xs text-ink-65 flex-1 truncate">
                        {d.domain}
                      </span>
                      <span className="text-[10px] text-ink-45">
                        {d.timesUsed}x
                      </span>
                      <span
                        className="text-xs font-bold w-10 text-right"
                        style={{ color: badge.text }}
                      >
                        {(d.avgScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {statsLoading && !stats && (
        <div className="card mb-6 flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-ink-45 animate-spin" />
        </div>
      )}

      {/* Category Defaults Legend */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-3">
          Default Scoring by Category
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const catScore = categoryDefaults[cat.value] || cat.defaultScore;
            const badge = getScoreBadge(catScore);
            const Icon = getScoreIcon(catScore);
            return (
              <div
                key={cat.value}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-g-bg2 border border-line-2"
              >
                <Icon className="w-4 h-4" style={{ color: badge.text }} />
                <div>
                  <span className="text-xs font-medium text-ink-65 block">
                    {cat.label}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: badge.text }}
                  >
                    {(catScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Override Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink-65">
            Add Domain Score Override
          </h3>
          <p className="text-xs text-ink-45">
            Override the default score for a specific domain. Your overrides
            take priority over built-in scores.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Domain *
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g. example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const cat = CATEGORIES.find(
                    (c) => c.value === e.target.value,
                  );
                  if (cat) setScore(cat.defaultScore);
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Credibility Score: {(score * 100).toFixed(0)}%
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={score}
                  onChange={(e) => setScore(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                  style={{ background: "transparent" }}
                />
                <span
                  className="text-sm font-bold w-10 text-right"
                  style={{ color: getScoreColor(score) }}
                >
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this override?"
              />
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
                <Globe className="w-3.5 h-3.5" />
              )}
              Save Override
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

      {/* User Overrides */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
        </div>
      ) : (
        <>
          <div className="card mb-6">
            <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-3">
              Your Overrides ({userScores.length})
            </h2>
            {userScores.length > 0 ? (
              <div className="space-y-2">
                {userScores.map((entry) => {
                  const badge = getScoreBadge(entry.credibilityScore);
                  const Icon = getScoreIcon(entry.credibilityScore);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-g-bg2 border border-line-2"
                    >
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{ color: badge.text }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink truncate">
                            {entry.domain}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{
                              background: badge.bg,
                              color: badge.text,
                              borderColor: badge.border,
                            }}
                          >
                            {badge.label} -{" "}
                            {(entry.credibilityScore * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-ink-45">
                            {entry.category}
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-ink-45 mt-0.5">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-red transition-colors shrink-0"
                        title="Remove override"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-45 py-4 text-center">
                No custom overrides. The built-in scoring rules will be used for
                all sources.
              </p>
            )}
          </div>

          {/* Known Domains (collapsible) */}
          <div className="card">
            <button
              onClick={() => setShowKnown(!showKnown)}
              className="flex items-center justify-between w-full"
            >
              <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider">
                Built-in Domain Scores ({knownDomainEntries.length})
              </h2>
              <span className="text-xs text-ink-45">
                {showKnown ? "Hide" : "Show"}
              </span>
            </button>
            {showKnown && (
              <div className="mt-4 space-y-1">
                {knownDomainEntries.map(([domainName, info]) => {
                  const badge = getScoreBadge(info.score);
                  return (
                    <div
                      key={domainName}
                      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-g-bg2"
                    >
                      <Globe className="w-3 h-3 text-ink-45 shrink-0" />
                      <span className="text-xs text-ink-65 flex-1 truncate">
                        {domainName}
                      </span>
                      <span className="text-[10px] text-ink-45 shrink-0">
                        {info.category}
                      </span>
                      <span
                        className="text-xs font-bold w-10 text-right shrink-0"
                        style={{ color: badge.text }}
                      >
                        {(info.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
