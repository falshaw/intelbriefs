"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";

interface Settings {
  id: string;
  tavilyApiKey: string | null;
  exaApiKey: string | null;
  crmUrl: string | null;
  crmAuthToken: string | null;
  backgroundProfile: string | null;
  defaultMode: string;
  autoEnrichEnabled: boolean;
  autoEnrichMode: string;
  localScanPaths: string[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [exaApiKey, setExaApiKey] = useState("");
  const [crmUrl, setCrmUrl] = useState("");
  const [backgroundProfile, setBackgroundProfile] = useState("");
  const [defaultMode, setDefaultMode] = useState("QUICK");
  const [autoEnrichEnabled, setAutoEnrichEnabled] = useState(false);
  const [autoEnrichMode, setAutoEnrichMode] = useState("QUICK");
  const [localScanPaths, setLocalScanPaths] = useState("");
  const [crmConnected, setCrmConnected] = useState<boolean | null>(null);
  const [testingEnrich, setTestingEnrich] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setCrmUrl(data.crmUrl || "");
        setBackgroundProfile(data.backgroundProfile || "");
        setDefaultMode(data.defaultMode || "QUICK");
        setAutoEnrichEnabled(data.autoEnrichEnabled ?? false);
        setAutoEnrichMode(data.autoEnrichMode || "QUICK");
        setLocalScanPaths((data.localScanPaths || []).join("\n"));
        setLoading(false);
        // Check CRM connection status
        fetch("/api/health")
          .then((r) => r.json())
          .then((h) => setCrmConnected(h.checks?.crm?.status === "ok"))
          .catch(() => setCrmConnected(false));
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const body: Record<string, unknown> = {
        backgroundProfile,
        defaultMode,
        autoEnrichEnabled,
        autoEnrichMode,
        localScanPaths: localScanPaths
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
      };

      if (crmUrl) body.crmUrl = crmUrl;
      if (tavilyApiKey) body.tavilyApiKey = tavilyApiKey;
      if (exaApiKey) body.exaApiKey = exaApiKey;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        setAutoEnrichEnabled(updated.autoEnrichEnabled ?? false);
        setAutoEnrichMode(updated.autoEnrichMode || "QUICK");
        setSaved(true);
        setTavilyApiKey("");
        setExaApiKey("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save settings");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-ink-65 text-sm">
          Configure IntelBrief research and integrations
        </p>
      </div>

      <div className="space-y-6">
        {/* API Keys */}
        <div className="card">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-4">
            Research API Keys
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-ink-65 mb-1.5 block">
                Tavily API Key
              </label>
              <input
                type="password"
                value={tavilyApiKey}
                onChange={(e) => setTavilyApiKey(e.target.value)}
                placeholder={
                  settings?.tavilyApiKey
                    ? "***configured*** (enter new to replace)"
                    : "Enter Tavily API key"
                }
              />
            </div>
            <div>
              <label className="text-sm text-ink-65 mb-1.5 block">
                Exa API Key
              </label>
              <input
                type="password"
                value={exaApiKey}
                onChange={(e) => setExaApiKey(e.target.value)}
                placeholder={
                  settings?.exaApiKey
                    ? "***configured*** (enter new to replace)"
                    : "Enter Exa API key"
                }
              />
            </div>
          </div>
        </div>

        {/* CRM */}
        <div className="card">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-4">
            CRM Integration
          </h2>
          <div>
            <label className="text-sm text-ink-65 mb-1.5 block">
              CRM API URL
            </label>
            <input
              type="text"
              value={crmUrl}
              onChange={(e) => setCrmUrl(e.target.value)}
              placeholder="http://localhost:3011"
            />
            <p className="text-xs text-ink-45 mt-1">
              CRM REST API endpoint
            </p>
          </div>
        </div>

        {/* Auto CRM Enrichment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-4">
            Auto CRM Enrichment
          </h2>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-sm text-ink-65 block">
                  Enable Auto-Enrichment
                </label>
                <p className="text-xs text-ink-45 mt-0.5">
                  When enabled, new CRM contacts are automatically researched
                  and enriched with intelligence data.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoEnrichEnabled}
                onClick={() => setAutoEnrichEnabled(!autoEnrichEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-canvas ${
                  autoEnrichEnabled ? "bg-accent" : "bg-g-bg"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoEnrichEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {autoEnrichEnabled && (
              <>
                <div>
                  <label className="text-sm text-ink-65 mb-1.5 block">
                    Enrichment Mode
                  </label>
                  <select
                    value={autoEnrichMode}
                    onChange={(e) => setAutoEnrichMode(e.target.value)}
                  >
                    <option value="QUICK">Quick (~5 min)</option>
                    <option value="DEEP">Deep (~10 min)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  {crmConnected === null ? (
                    <Loader2 className="w-4 h-4 text-ink-45 animate-spin" />
                  ) : crmConnected ? (
                    <Wifi className="w-4 h-4 text-teal" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red" />
                  )}
                  <span
                    className={
                      crmConnected ? "text-teal" : "text-red"
                    }
                  >
                    CRM {crmConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>

                <div>
                  <button
                    type="button"
                    disabled={testingEnrich}
                    onClick={async () => {
                      setTestingEnrich(true);
                      setTestResult(null);
                      try {
                        const res = await fetch("/api/briefs/enrich", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            contactId: "test-" + Date.now(),
                            firstName: "Test",
                            lastName: "Contact",
                            company: "Test Corp",
                            mode: autoEnrichMode,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok || res.status === 202) {
                          setTestResult(
                            `Brief ${data.briefId} created (${data.status})`,
                          );
                        } else {
                          setTestResult(data.error || "Test failed");
                        }
                      } catch {
                        setTestResult("Network error");
                      } finally {
                        setTestingEnrich(false);
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded border border-line hover:border-accent hover:bg-g-bg2 transition-colors disabled:opacity-50"
                  >
                    {testingEnrich ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Test Enrichment
                  </button>
                  {testResult && (
                    <p className="text-xs text-ink-45 mt-1.5">{testResult}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Background Profile */}
        <div className="card">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-4">
            Background Profile
          </h2>
          <div>
            <label className="text-sm text-ink-65 mb-1.5 block">
              Your professional background (used by AI for relevance mapping)
            </label>
            <textarea
              value={backgroundProfile}
              onChange={(e) => setBackgroundProfile(e.target.value)}
              rows={4}
              placeholder="e.g. Account manager at a 50-person software company, selling to mid-size manufacturers."
            />
          </div>
        </div>

        {/* Defaults */}
        <div className="card">
          <h2 className="text-sm font-semibold text-ink-65 uppercase tracking-wider mb-4">
            Defaults
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-ink-65 mb-1.5 block">
                Default Search Depth
              </label>
              <select
                value={defaultMode}
                onChange={(e) => setDefaultMode(e.target.value)}
              >
                <option value="QUICK">Quick (~5 min)</option>
                <option value="DEEP">Deep (~10 min)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-ink-65 mb-1.5 block">
                Local File Scan Paths (one per line)
              </label>
              <textarea
                value={localScanPaths}
                onChange={(e) => setLocalScanPaths(e.target.value)}
                rows={3}
                placeholder="docs/&#10;notes/"
              />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Settings
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-teal">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-sm text-red">
              <AlertCircle className="w-4 h-4" /> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
