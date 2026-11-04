"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  User,
  Building2,
  ExternalLink,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  MessageSquare,
  Target,
  Globe,
  Database,
  FileText,
  Linkedin,
  Loader2,
  Trash2,
} from "lucide-react";

interface Source {
  id: string;
  type: string;
  url: string | null;
  title: string;
  snippet: string | null;
}

interface Brief {
  id: string;
  type: string;
  mode: string;
  status: string;
  name: string;
  company: string | null;
  linkedinUrl: string | null;
  summary: string | null;
  talkingPoints: string[];
  riskSignals: string[];
  strategy: string | null;
  crmContactId: string | null;
  crmSynced: boolean;
  createdAt: string;
  updatedAt: string;
  sources: Source[];
  webFindings: unknown;
  crmFindings: unknown;
  localFindings: unknown;
}

const sourceIcon = (type: string) => {
  switch (type) {
    case "WEB":
      return Globe;
    case "CRM":
      return Database;
    case "LOCAL_FILE":
      return FileText;
    case "LINKEDIN":
      return Linkedin;
    default:
      return Globe;
  }
};

export default function BriefView({ brief: initialBrief }: { brief: Brief }) {
  const [brief, setBrief] = useState(initialBrief);
  const [sourcesOpen, setSources] = useState(false);
  const [rawOpen, setRaw] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // CRM is optional: show the sync button only when a CRM answers (same check as Settings).
  const [crmAvailable, setCrmAvailable] = useState(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setCrmAvailable(h.checks?.crm?.status === "ok"))
      .catch(() => setCrmAvailable(false));
  }, []);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  const isInProgress = useCallback((status: string) => {
    return (
      status === "PENDING" ||
      status === "RESEARCHING" ||
      status === "SYNTHESIZING"
    );
  }, []);

  // Auto-poll for brief completion when status is in progress.
  // Uses exponential backoff: 1s, 2s, 3s, ... up to 5s intervals, max 60 polls.
  useEffect(() => {
    if (!isInProgress(brief.status)) {
      pollCountRef.current = 0;
      return;
    }

    const poll = async () => {
      if (pollCountRef.current >= 60) return;

      try {
        const res = await fetch(`/api/briefs/${brief.id}`);
        if (res.ok) {
          const updated = await res.json();
          setBrief(updated);
          if (isInProgress(updated.status)) {
            pollCountRef.current++;
            const delay = Math.min(1000 + pollCountRef.current * 1000, 5000);
            pollRef.current = setTimeout(poll, delay);
          }
        }
      } catch {
        // Network error — retry after 5s
        pollRef.current = setTimeout(poll, 5000);
      }
    };

    // Start first poll after 1 second
    pollRef.current = setTimeout(poll, 1000);

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [brief.id, brief.status, isInProgress]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/briefs/${brief.id}/refresh`, { method: "POST" });
      // Poll for updated brief
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`/api/briefs/${brief.id}`);
        if (res.ok) {
          const updated = await res.json();
          setBrief(updated);
          if (updated.status === "COMPLETE" || updated.status === "FAILED")
            break;
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleCrmSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/crm-sync`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setBrief((b) => ({
            ...b,
            crmSynced: true,
            crmContactId: result.contactId,
          }));
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete brief for "${brief.name}"?`)) return;
    await fetch(`/api/briefs/${brief.id}`, { method: "DELETE" });
    window.location.href = "/";
  };

  const isLoading =
    brief.status === "PENDING" ||
    brief.status === "RESEARCHING" ||
    brief.status === "SYNTHESIZING";

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {brief.type === "PERSON" ? (
              <User className="w-6 h-6 text-accent" />
            ) : (
              <Building2 className="w-6 h-6 text-accent" />
            )}
            <h1 className="text-2xl font-bold">{brief.name}</h1>
            {brief.company && (
              <span className="text-lg text-ink-45">@ {brief.company}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge badge-${brief.status.toLowerCase()}`}>
              {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              {brief.status}
            </span>
            <span className={`badge badge-${brief.mode.toLowerCase()}`}>
              {brief.mode}
            </span>
            {brief.crmSynced && (
              <span className="badge bg-teal-soft text-teal border border-teal/30">
                CRM Synced
              </span>
            )}
            <span className="text-xs text-ink-45">
              {formatDistanceToNow(new Date(brief.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {brief.linkedinUrl && (
            <a
              href={brief.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Linkedin className="w-4 h-4" /> LinkedIn
            </a>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </button>
          {crmAvailable && (
            <button
              onClick={handleCrmSync}
              disabled={syncing || brief.status !== "COMPLETE"}
              className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40"
            >
              <Upload className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />{" "}
              CRM
            </button>
          )}
          <button
            onClick={handleDelete}
            className="btn btn-danger flex items-center gap-1.5 text-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="card mb-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <div>
            <p className="text-sm font-medium">
              {brief.status === "PENDING" && "Preparing research..."}
              {brief.status === "RESEARCHING" &&
                "Collecting data from the web and local sources..."}
              {brief.status === "SYNTHESIZING" && "AI analyzing findings..."}
            </p>
            <p className="text-xs text-ink-45">
              {brief.mode === "QUICK"
                ? "Estimated ~5 minutes on a local model"
                : "Estimated ~10 minutes on a local model"}
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      {brief.summary && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-3">
            Summary
          </h2>
          <p className="text-ink leading-relaxed">{brief.summary}</p>
        </div>
      )}

      {/* Talking Points */}
      {brief.talkingPoints.length > 0 && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Talking Points
          </h2>
          <ul className="space-y-2">
            {brief.talkingPoints.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-ink-65"
              >
                <Target className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk Signals */}
      {brief.riskSignals.length > 0 && (
        <div className="card mb-4 border-amber/30">
          <h2 className="text-sm font-semibold text-amber uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Risk Signals
          </h2>
          <ul className="space-y-2">
            {brief.riskSignals.map((signal, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-amber"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {signal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategy */}
      {brief.strategy && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-3">
            Strategy
          </h2>
          <p className="text-ink leading-relaxed">{brief.strategy}</p>
        </div>
      )}

      {/* Sources (collapsible) */}
      {brief.sources.length > 0 && (
        <div className="card mb-4">
          <button
            onClick={() => setSources(!sourcesOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-ink-65 uppercase tracking-wider w-full text-left"
          >
            {sourcesOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Sources ({brief.sources.length})
          </button>
          {sourcesOpen && (
            <div className="mt-3 space-y-2">
              {brief.sources.map((source) => {
                const Icon = sourceIcon(source.type);
                return (
                  <div
                    key={source.id}
                    className="flex items-start gap-3 p-2 rounded-lg bg-g-bg2"
                  >
                    <Icon className="w-4 h-4 text-ink-45 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-65 truncate">
                          {source.title}
                        </span>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent/80"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {source.snippet && (
                        <p className="text-xs text-ink-45 mt-1 line-clamp-2">
                          {source.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Raw Data (collapsible) */}
      <div className="card">
        <button
          onClick={() => setRaw(!rawOpen)}
          className="flex items-center gap-2 text-sm font-semibold text-ink-65 uppercase tracking-wider w-full text-left"
        >
          {rawOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Raw Data
        </button>
        {rawOpen && (
          <pre className="mt-3 text-xs text-[#d6deec] overflow-auto max-h-96 p-3 bg-dark rounded-lg">
            {JSON.stringify(
              {
                webFindings: brief.webFindings,
                crmFindings: brief.crmFindings,
                localFindings: brief.localFindings,
              },
              null,
              2,
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
