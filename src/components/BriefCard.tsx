"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { User, Building2, ExternalLink } from "lucide-react";

interface Brief {
  id: string;
  type: string;
  mode: string;
  status: string;
  name: string;
  company: string | null;
  summary: string | null;
  talkingPoints: string[];
  riskSignals: string[];
  crmSynced: boolean;
  createdAt: string;
  _count?: { sources: number };
}

export default function BriefCard({ brief }: { brief: Brief }) {
  const statusClass = `badge badge-${brief.status.toLowerCase()}`;
  const modeClass = `badge badge-${brief.mode.toLowerCase()}`;

  return (
    <Link href={`/briefs/${brief.id}`} className="card block group">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {brief.type === "PERSON" ? (
            <User className="w-4 h-4 text-accent" />
          ) : (
            <Building2 className="w-4 h-4 text-accent" />
          )}
          <h3 className="font-semibold text-white group-hover:text-accent transition-colors">
            {brief.name}
          </h3>
          {brief.company && (
            <span className="text-sm text-ink-45">@ {brief.company}</span>
          )}
        </div>
        <ExternalLink className="w-4 h-4 text-ink-45 group-hover:text-ink-65 transition-colors" />
      </div>

      {brief.summary && (
        <p className="text-sm text-ink-65 mb-3 line-clamp-2">
          {brief.summary}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={statusClass}>{brief.status}</span>
        <span className={modeClass}>{brief.mode}</span>
        {brief.crmSynced && (
          <span className="badge bg-teal-soft text-teal border border-teal/30">
            CRM
          </span>
        )}
        {brief.riskSignals.length > 0 && (
          <span className="badge bg-amber-soft text-amber border border-amber/30">
            {brief.riskSignals.length} flag
            {brief.riskSignals.length > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-xs text-ink-45 ml-auto">
          {formatDistanceToNow(new Date(brief.createdAt), { addSuffix: true })}
        </span>
      </div>
    </Link>
  );
}
