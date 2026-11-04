"use client";

import {
  Globe,
  Database,
  FileText,
  Linkedin,
  ExternalLink,
} from "lucide-react";

interface Source {
  id: string;
  type: string;
  url: string | null;
  title: string;
  snippet: string | null;
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

export default function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-2">
      {sources.map((source) => {
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
  );
}
