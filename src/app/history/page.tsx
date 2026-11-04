"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Trash2, RefreshCw, Loader2 } from "lucide-react";
import BriefCard from "@/components/BriefCard";

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

export default function HistoryPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      if (modeFilter) params.set("mode", modeFilter);

      const res = await fetch(`/api/briefs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBriefs(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, modeFilter]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} brief(s)?`)) return;
    await Promise.all(
      ids.map((id) => fetch(`/api/briefs/${id}`, { method: "DELETE" })),
    );
    setSelected(new Set());
    fetchBriefs();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Brief History</h1>
        <p className="text-ink-65 text-sm">All intelligence briefs</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-45" />
          <input
            type="text"
            placeholder="Search by name or company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All Types</option>
          <option value="PERSON">Person</option>
          <option value="COMPANY">Company</option>
        </select>
        <select
          value={modeFilter}
          onChange={(e) => {
            setModeFilter(e.target.value);
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All Modes</option>
          <option value="QUICK">Quick</option>
          <option value="DEEP">Deep</option>
        </select>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 card">
          <span className="text-sm text-ink-65">
            {selected.size} selected
          </span>
          <button
            onClick={() => handleDelete(Array.from(selected))}
            className="btn btn-danger flex items-center gap-1.5 text-sm py-1.5 px-3"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-ink-45 hover:text-ink-65"
          >
            Clear
          </button>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
        </div>
      ) : briefs.length > 0 ? (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <div key={brief.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(brief.id)}
                onChange={() => toggleSelect(brief.id)}
                className="mt-5 w-4 h-4 rounded border-line bg-g-bg2"
              />
              <div className="flex-1">
                <BriefCard brief={brief} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-ink-45">No briefs found</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-sm text-ink-45">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
