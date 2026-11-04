/**
 * IntelBriefs - Competitive Intelligence Page (IB-02)
 * Copyright (c) 2024-2026 Nick Falshaw
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  Building2,
  Tag,
  ChevronDown,
  ChevronRight,
  Zap,
  ExternalLink,
  Pause,
  RotateCcw,
  Radar,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompetitorMention {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  sourceName: string | null;
  sentiment: string;
  importance: number;
  detectedAt: string;
}

interface Competitor {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  tags: string[];
  isActive: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  _count?: { mentions: number };
  mentions?: CompetitorMention[];
}

interface DigestData {
  summary: string;
  entries: {
    competitorId: string;
    competitorName: string;
    mentions: CompetitorMention[];
  }[];
  competitorsChecked: number;
  totalMentions: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Mention add form
  const [showMentionForm, setShowMentionForm] = useState<string | null>(null);
  const [mentionType, setMentionType] = useState("NEWS");
  const [mentionTitle, setMentionTitle] = useState("");
  const [mentionContent, setMentionContent] = useState("");
  const [mentionUrl, setMentionUrl] = useState("");
  const [mentionSentiment, setMentionSentiment] = useState("NEUTRAL");
  const [mentionImportance, setMentionImportance] = useState(3);
  const [mentionLoading, setMentionLoading] = useState(false);

  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/competitors");
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim() || undefined,
          industry: industry.trim() || undefined,
          description: description.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (res.ok) {
        setName("");
        setWebsite("");
        setIndustry("");
        setDescription("");
        setTags("");
        setShowAdd(false);
        fetchCompetitors();
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this competitor?")) return;
    await fetch(`/api/competitors/${id}`, { method: "DELETE" });
    fetchCompetitors();
  };

  const handleToggleActive = async (comp: Competitor) => {
    await fetch(`/api/competitors/${comp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !comp.isActive }),
    });
    fetchCompetitors();
  };

  const handleGenerateDigest = async () => {
    setDigestLoading(true);
    setDigest(null);
    try {
      const res = await fetch("/api/competitors/digest", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDigest(data.data);
        // Refresh to show new mentions
        fetchCompetitors();
      }
    } finally {
      setDigestLoading(false);
    }
  };

  const handleScanCompetitor = async (competitorId: string) => {
    setScanningId(competitorId);
    try {
      const res = await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorId }),
      });
      if (res.ok) {
        fetchCompetitors();
      }
    } finally {
      setScanningId(null);
    }
  };

  const handleAddMention = async (competitorId: string) => {
    if (!mentionTitle.trim() || !mentionContent.trim()) return;
    setMentionLoading(true);
    try {
      const res = await fetch(`/api/competitors/${competitorId}/mentions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mentionType,
          title: mentionTitle.trim(),
          content: mentionContent.trim(),
          sourceUrl: mentionUrl.trim() || undefined,
          sentiment: mentionSentiment,
          importance: mentionImportance,
        }),
      });
      if (res.ok) {
        setMentionTitle("");
        setMentionContent("");
        setMentionUrl("");
        setShowMentionForm(null);
        fetchCompetitors();
      }
    } finally {
      setMentionLoading(false);
    }
  };

  const sentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "POSITIVE":
        return <TrendingUp className="w-3 h-3 text-teal" />;
      case "NEGATIVE":
        return <TrendingDown className="w-3 h-3 text-red" />;
      default:
        return <Minus className="w-3 h-3 text-ink-45" />;
    }
  };

  const mentionTypeColor: Record<string, string> = {
    PRODUCT_LAUNCH: "bg-accent-soft text-accent border-accent/30",
    PRICING_CHANGE: "bg-amber-soft text-amber border-amber/30",
    PARTNERSHIP: "bg-teal-soft text-teal border-teal/30",
    HIRING: "bg-accent-soft text-accent border-accent/30",
    FUNDING: "bg-accent-soft text-accent border-accent/30",
    NEWS: "bg-g-bg2 text-ink-65 border-line",
    SOCIAL_MEDIA: "bg-accent-soft text-accent border-accent/30",
    OTHER: "bg-g-bg2 text-ink-45 border-line",
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Competitive Intelligence</h1>
          <p className="text-ink-65 text-sm">
            Track competitors, monitor mentions, and generate weekly digests
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateDigest}
            disabled={
              digestLoading ||
              competitors.filter((c) => c.isActive).length === 0
            }
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-40"
          >
            {digestLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Generate Digest
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Competitor
          </button>
        </div>
      </div>

      {/* Add Competitor Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CrowdStrike"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Website
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://crowdstrike.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Industry
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Cybersecurity"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. EDR, Cloud, Enterprise"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-45 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of the competitor..."
            />
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
                <Building2 className="w-3.5 h-3.5" />
              )}
              Add Competitor
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

      {/* Digest Result */}
      {digest && (
        <div className="card mb-6 border-accent">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider">
              Competitive Digest
            </h2>
            <span className="text-xs text-ink-45">
              {digest.competitorsChecked} checked, {digest.totalMentions}{" "}
              mentions found
            </span>
          </div>
          {digest.summary && (
            <p className="text-sm text-ink-65 leading-relaxed mb-4">
              {digest.summary}
            </p>
          )}
          {digest.entries.map((entry) => (
            <div key={entry.competitorId} className="mb-3">
              <h3 className="text-sm font-medium text-ink mb-2">
                {entry.competitorName}
              </h3>
              <div className="space-y-1.5">
                {entry.mentions.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs bg-g-bg2 rounded-lg p-2"
                  >
                    {sentimentIcon(m.sentiment)}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                        mentionTypeColor[m.type] || mentionTypeColor.OTHER
                      }`}
                    >
                      {m.type.replace("_", " ")}
                    </span>
                    <span className="text-ink-65">{m.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() => setDigest(null)}
            className="text-xs text-ink-45 hover:text-ink-65 mt-2"
          >
            Dismiss digest
          </button>
        </div>
      )}

      {/* Competitor Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
        </div>
      ) : competitors.length > 0 ? (
        <div className="space-y-3">
          {competitors.map((comp) => {
            const isExpanded = expandedId === comp.id;
            return (
              <div key={comp.id} className="card p-0 overflow-hidden">
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : comp.id)
                        }
                        className="mt-0.5 text-ink-45 hover:text-ink-65"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {comp.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              comp.isActive
                                ? "bg-teal-soft text-teal border border-teal/30"
                                : "bg-g-bg2 text-ink-45 border border-line"
                            }`}
                          >
                            {comp.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-45 flex-wrap">
                          {comp.industry && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {comp.industry}
                            </span>
                          )}
                          {comp.website && (
                            <a
                              href={comp.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:text-accent"
                            >
                              <Globe className="w-3 h-3" />
                              {new URL(comp.website).hostname}
                            </a>
                          )}
                          <span>
                            {comp._count?.mentions ?? 0} mention
                            {(comp._count?.mentions ?? 0) !== 1 ? "s" : ""}
                          </span>
                          {comp.lastCheckedAt && (
                            <span>
                              Last checked: {formatDate(comp.lastCheckedAt)}
                            </span>
                          )}
                        </div>
                        {comp.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <Tag className="w-3 h-3 text-ink-45" />
                            {comp.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-g-bg2 text-ink-45 border border-line"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {comp.description && (
                          <p className="text-sm text-ink-45 mt-2 line-clamp-1">
                            {comp.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <button
                        onClick={() =>
                          setShowMentionForm(
                            showMentionForm === comp.id ? null : comp.id,
                          )
                        }
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-accent transition-colors"
                        title="Add mention"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleScanCompetitor(comp.id)}
                        disabled={scanningId === comp.id || !comp.isActive}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-accent transition-colors disabled:opacity-30"
                        title="Scan for news"
                      >
                        {scanningId === comp.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Radar className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleActive(comp)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-ink-65 transition-colors"
                        title={comp.isActive ? "Pause" : "Resume"}
                      >
                        {comp.isActive ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(comp.id)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-red transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Manual Mention Form */}
                {showMentionForm === comp.id && (
                  <div className="border-t border-line-2 px-4 py-3 space-y-3">
                    <h4 className="text-xs font-medium text-ink-65">
                      Add Mention
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-ink-45 mb-1">
                          Type
                        </label>
                        <select
                          value={mentionType}
                          onChange={(e) => setMentionType(e.target.value)}
                          className="text-xs"
                        >
                          <option value="PRODUCT_LAUNCH">Product Launch</option>
                          <option value="PRICING_CHANGE">Pricing Change</option>
                          <option value="PARTNERSHIP">Partnership</option>
                          <option value="HIRING">Hiring</option>
                          <option value="FUNDING">Funding</option>
                          <option value="NEWS">News</option>
                          <option value="SOCIAL_MEDIA">Social Media</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-ink-45 mb-1">
                          Sentiment
                        </label>
                        <select
                          value={mentionSentiment}
                          onChange={(e) => setMentionSentiment(e.target.value)}
                          className="text-xs"
                        >
                          <option value="POSITIVE">Positive</option>
                          <option value="NEGATIVE">Negative</option>
                          <option value="NEUTRAL">Neutral</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-ink-45 mb-1">
                          Importance (1-5)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={mentionImportance}
                          onChange={(e) =>
                            setMentionImportance(parseInt(e.target.value) || 3)
                          }
                          className="text-xs"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={mentionTitle}
                      onChange={(e) => setMentionTitle(e.target.value)}
                      placeholder="Mention title..."
                      className="text-sm"
                    />
                    <textarea
                      value={mentionContent}
                      onChange={(e) => setMentionContent(e.target.value)}
                      rows={2}
                      placeholder="Description of the mention..."
                      className="text-sm"
                    />
                    <input
                      type="url"
                      value={mentionUrl}
                      onChange={(e) => setMentionUrl(e.target.value)}
                      placeholder="Source URL (optional)"
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddMention(comp.id)}
                        disabled={mentionLoading}
                        className="btn btn-primary text-xs flex items-center gap-1"
                      >
                        {mentionLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        Add
                      </button>
                      <button
                        onClick={() => setShowMentionForm(null)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Recent Mentions */}
                {isExpanded && comp.mentions && comp.mentions.length > 0 && (
                  <div className="border-t border-line-2 px-4 py-3">
                    <h4 className="text-xs font-medium text-ink-65 mb-3">
                      Recent Mentions
                    </h4>
                    <div className="space-y-2">
                      {comp.mentions.map((mention) => (
                        <div
                          key={mention.id}
                          className="bg-g-bg2 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {sentimentIcon(mention.sentiment)}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                mentionTypeColor[mention.type] ||
                                mentionTypeColor.OTHER
                              }`}
                            >
                              {mention.type.replace("_", " ")}
                            </span>
                            <span className="text-xs text-ink-65 font-medium">
                              {mention.title}
                            </span>
                            <span className="text-[10px] text-ink-45 ml-auto">
                              {formatDate(mention.detectedAt)}
                            </span>
                            {mention.sourceUrl && (
                              <a
                                href={mention.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:text-accent/80"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <p className="text-sm text-ink-65 line-clamp-2">
                            {mention.content}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-ink-45">
                              Importance: {mention.importance}/5
                            </span>
                            {mention.sourceName && (
                              <span className="text-[10px] text-ink-45">
                                via {mention.sourceName}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isExpanded &&
                  (!comp.mentions || comp.mentions.length === 0) && (
                    <div className="border-t border-line-2 px-4 py-3">
                      <p className="text-xs text-ink-45 py-2">
                        No mentions yet. Generate a digest or add manually.
                      </p>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Building2 className="w-8 h-8 text-ink-45 mx-auto mb-3" />
          <p className="text-ink-45 mb-1">No competitors tracked yet</p>
          <p className="text-ink-45 text-sm">
            Add competitors to monitor their product launches, pricing changes,
            and market moves.
          </p>
        </div>
      )}
    </div>
  );
}
