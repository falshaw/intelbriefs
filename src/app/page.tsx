"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Search, Eye } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { describeChangedFields } from "@/lib/changed-fields";
import { formatDistanceToNow } from "date-fns";

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

interface WatchItem {
  id: string;
  name: string;
  company: string | null;
  frequency: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  runs: { changedFields: string[]; brief: { id: string } | null }[];
}

interface Domain {
  domain: string;
  timesUsed: number;
}

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  PENDING: { cls: "p-flag", label: "Pending" },
  RESEARCHING: { cls: "p-pend", label: "Researching" },
  SYNTHESIZING: { cls: "p-pend", label: "Writing" },
  COMPLETE: { cls: "p-ok", label: "Complete" },
  FAILED: { cls: "p-risk", label: "Failed" },
};

const ACTIVE = new Set(["PENDING", "RESEARCHING", "SYNTHESIZING"]);

const ICON_GRADIENTS = [
  "linear-gradient(140deg,#2563eb,#60a5fa)",
  "linear-gradient(140deg,#0d9488,#5eead4)",
  "linear-gradient(140deg,#7c3aed,#c4b5fd)",
  "linear-gradient(140deg,#d97706,#fcd34d)",
];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** ISO week number, for the "briefs per week" chart. */
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

function StatusRing({ complete, active, total }: { complete: number; active: number; total: number }) {
  const C = 2 * Math.PI * 58;
  const c = total ? (complete / total) * C : 0;
  const a = total ? (active / total) * C : 0;
  const pct = total ? Math.round((complete / total) * 100) : 0;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0" role="img" aria-label={`${complete} of ${total} briefs complete`}>
      <circle cx="75" cy="75" r="58" fill="none" stroke="var(--track)" strokeWidth="16" />
      {c > 0 && (
        <circle cx="75" cy="75" r="58" fill="none" stroke="#14b8a6" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${c} ${C - c}`} transform="rotate(-90 75 75)" />
      )}
      {a > 0 && (
        <circle cx="75" cy="75" r="58" fill="none" stroke="#2563eb" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${a} ${C - a}`} strokeDashoffset={-c} transform="rotate(-90 75 75)" />
      )}
      <text x="75" y="76" textAnchor="middle" fontWeight="700" fontSize="28" fill="var(--ink)">{pct}%</text>
      <text x="75" y="96" textAnchor="middle" fontSize="11" fill="var(--ink-45)">complete</text>
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [total, setTotal] = useState(0);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  // Formatted in the browser only, so server and client render the same text.
  const [dateLine, setDateLine] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [bRes, wRes, sRes] = await Promise.all([
        fetch("/api/briefs?limit=50"),
        fetch("/api/watchlist"),
        fetch("/api/sources/stats"),
      ]);
      if (bRes.ok) {
        const data = await bRes.json();
        setBriefs(data.data || []);
        setTotal(data.pagination?.total || 0);
      }
      if (wRes.ok) setWatch((await wRes.json()).data || []);
      if (sRes.ok) setDomains((await sRes.json()).data?.topDomains || []);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    setDateLine(
      new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }),
    );
  }, [fetchAll]);

  const handleSubmit = async (input: string, mode: "QUICK" | "DEEP") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, mode }),
      });
      if (res.ok) {
        const brief = await res.json();
        router.push(`/briefs/${brief.id}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not start the brief.");
      }
    } finally {
      setLoading(false);
    }
  };

  const complete = briefs.filter((b) => b.status === "COMPLETE").length;
  const active = briefs.filter((b) => ACTIVE.has(b.status)).length;
  const failed = briefs.filter((b) => b.status === "FAILED").length;
  const deep = briefs.filter((b) => b.mode === "DEEP").length;
  const watching = watch.filter((w) => w.isActive).length;

  // Briefs per ISO week, last 6 weeks (from the latest 50 briefs).
  const now = new Date();
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * (5 - i));
    return isoWeek(d);
  });
  const perWeek = weeks.map((w) => ({
    w,
    n: briefs.filter((b) => {
      const d = new Date(b.createdAt);
      return isoWeek(d) === w && now.getTime() - d.getTime() < 43 * 86400000;
    }).length,
  }));
  const maxWeek = Math.max(...perWeek.map((x) => x.n), 1);

  const topDomains = domains.slice(0, 6);
  const maxDomain = Math.max(...topDomains.map((d) => d.timesUsed), 1);

  const changed = watch.find((w) => w.runs[0]?.changedFields?.length);


  return (
    <>
      <div className="mb-5">
        <div className="eyebrow">{dateLine ? `${dateLine} · ` : ""}local model</div>
        <h1 className="!text-[28px]">IntelBriefs</h1>
      </div>

      <SearchBar onSubmit={handleSubmit} loading={loading} />
      {error && (
        <div className="alert alert-error mt-3" role="alert">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_.75fr_1.1fr]">
        <div className="tile md:col-span-2 xl:col-span-1">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Briefs per week</h2>
            <span className="text-xs text-ink-65">last 6 weeks</span>
          </div>
          <div className="vbars">
            {perWeek.map(({ w, n }, i) => {
              const pct = Math.round((n / maxWeek) * 100);
              return (
                <div key={w}>
                  <div className="col">
                    <b style={{ height: `${n ? Math.max(pct, 4) : 0}%`, background: i === 5 ? "linear-gradient(180deg,#5eead4,#0d9488)" : undefined }} />
                    {pct > 85 ? (
                      <span style={{ top: 8, color: "#fff" }}>{n}</span>
                    ) : (
                      <span style={{ bottom: `calc(${pct}% + 6px)` }}>{n}</span>
                    )}
                  </div>
                  <small>w{w}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3">
          {[
            { icon: FileText, tone: "text-accent", n: total, label: "Briefs total" },
            { icon: Search, tone: "text-teal", n: deep, label: "Deep briefs" },
            { icon: Eye, tone: "text-amber", n: watching, label: "On the watchlist" },
          ].map((s) => (
            <div key={s.label} className="tile flex items-center gap-3">
              <span className={`stat-i ${s.tone}`}>
                <s.icon aria-hidden />
              </span>
              <div>
                <b className="block text-xl font-bold leading-tight tracking-tight">{fetching ? "–" : s.n}</b>
                <small className="text-xs text-ink-65">{s.label}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Status</h2>
            <span className="text-xs text-ink-65">latest {briefs.length}</span>
          </div>
          <div className="flex flex-col items-center gap-[18px] sm:flex-row">
            <StatusRing complete={complete} active={active} total={briefs.length} />
            <div className="grid w-full flex-1 gap-3 text-xs text-ink-65">
              {[
                ["#14b8a6", "Complete", complete],
                ["#2563eb", "In progress", active],
                ["var(--red)", "Failed", failed],
              ].map(([c, label, n]) => (
                <span key={label as string}>
                  <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full" style={{ background: c as string }} />
                  {label}
                  <b className="block text-[17px] text-ink">{n}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Recent briefs</h2>
            <Link href="/history" className="text-xs font-semibold text-accent">History</Link>
          </div>
          {fetching && (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}
            </div>
          )}
          {!fetching && briefs.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-65">
              No briefs yet. Type a name above to research your first person or company.
            </p>
          )}
          {briefs.slice(0, 6).map((b, i) => {
            const st = STATUS_PILL[b.status] ?? STATUS_PILL.PENDING;
            const detail = [
              b.type === "PERSON" ? "Person" : "Company",
              b.company,
              b.mode === "DEEP" ? "Deep" : "Quick",
              b.riskSignals.length ? `${b.riskSignals.length} risk signal${b.riskSignals.length > 1 ? "s" : ""}` : null,
              b.talkingPoints.length ? `${b.talkingPoints.length} talking points` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={b.id}
                href={`/briefs/${b.id}`}
                className="flex items-center gap-3.5 border-t border-line-2 py-3 first:border-t-0 first:pt-0.5"
              >
                <span className="app-ic" style={{ background: ICON_GRADIENTS[i % ICON_GRADIENTS.length] }} aria-hidden>
                  {initials(b.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold">{b.name}</b>
                  <small className="block truncate text-xs text-ink-65">{detail}</small>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-ink-65">
                  <span className="hidden sm:inline">
                    {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
                  </span>
                  <span className={`pill ${st.cls}`}>{st.label}</span>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Top sources</h2>
            <Link href="/sources" className="text-xs font-semibold text-accent">Sources</Link>
          </div>
          {topDomains.length === 0 && <p className="text-sm text-ink-65">No sources yet.</p>}
          {topDomains.map((d, i) => (
            <div key={d.domain} className="flex items-center gap-2 border-t border-line-2 py-2.5 text-[13px] first:border-t-0 first:pt-0">
              <span className="w-28 shrink-0 truncate" title={d.domain}>{d.domain}</span>
              <i className="hbar mx-1.5">
                <b style={{ width: `${(d.timesUsed / maxDomain) * 100}%`, background: i < 2 ? "var(--accent)" : "var(--teal)" }} />
              </i>
              <b className="tabular-nums">{d.timesUsed}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="tile mt-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="!text-base">Watchlist</h2>
          <Link href="/watchlist" className="text-xs font-semibold text-accent">Manage</Link>
        </div>
        {watch.length === 0 ? (
          <p className="text-sm text-ink-65">
            Nothing watched yet. Add a person or company and it re-runs on a schedule.
          </p>
        ) : (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr_auto]">
            {watch.slice(0, 5).map((w) => {
              const n = w.runs[0]?.changedFields?.length ?? 0;
              return (
                <div key={w.id} className="contents">
                  <span className={`pill ${!w.isActive ? "p-off" : n ? "p-flag" : "p-ok"}`}>
                    {!w.isActive ? "Paused" : n ? `${n} changed` : "No change"}
                  </span>
                  <span className="min-w-0 truncate">
                    <b className="font-semibold">{w.name}</b> · {w.frequency.toLowerCase()}
                  </span>
                  <span className="hidden font-mono text-xs text-ink-65 sm:inline">
                    next {new Date(w.nextRunAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {changed?.runs[0]?.brief && (
        <div className="cta mt-4">
          <div className="relative z-[1]">
            <h3>{changed.name} changed</h3>
            <p>
              The last {changed.frequency.toLowerCase()} run found changes in{" "}
              {describeChangedFields(changed.runs[0].changedFields)}.
            </p>
          </div>
          <Link className="btn" href={`/briefs/${changed.runs[0].brief.id}`}>
            Open brief
          </Link>
        </div>
      )}
    </>
  );
}
