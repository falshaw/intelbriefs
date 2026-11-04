/**
 * IntelBriefs - Brief Templates Page (IB-04)
 * Copyright (c) 2024-2026 Nick Falshaw
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  Star,
  ChevronDown,
  ChevronRight,
  Edit3,
  Copy,
  Users,
  TrendingUp,
  Building2,
  Briefcase,
  Settings,
  Play,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateSection {
  key: string;
  label: string;
  prompt: string;
  order: number;
}

interface BriefTemplate {
  id: string;
  name: string;
  type: string;
  description: string | null;
  sections: TemplateSection[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_TYPES = [
  { value: "PRE_MEETING", label: "Pre-Meeting", icon: Users },
  { value: "INVESTOR", label: "Investor", icon: TrendingUp },
  { value: "COMPETITOR", label: "Competitor", icon: Building2 },
  { value: "HIRING_MANAGER", label: "Hiring Manager", icon: Briefcase },
  { value: "CUSTOM", label: "Custom", icon: Settings },
];

const typeColors: Record<string, string> = {
  PRE_MEETING: "bg-accent-soft text-accent border-accent/30",
  INVESTOR: "bg-teal-soft text-teal border-teal/30",
  COMPETITOR: "bg-red-soft text-red border-red/30",
  HIRING_MANAGER: "bg-accent-soft text-accent border-accent/30",
  CUSTOM: "bg-g-bg2 text-ink-65 border-line",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<BriefTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generate form state
  const [generateId, setGenerateId] = useState<string | null>(null);
  const [genInput, setGenInput] = useState("");
  const [genCompany, setGenCompany] = useState("");
  const [genContext, setGenContext] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("CUSTOM");
  const [formDescription, setFormDescription] = useState("");
  const [formSections, setFormSections] = useState<TemplateSection[]>([
    { key: "section_1", label: "", prompt: "", order: 0 },
  ]);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      // Seed defaults on first load
      const res = await fetch("/api/templates?seed=true");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName("");
    setFormType("CUSTOM");
    setFormDescription("");
    setFormSections([{ key: "section_1", label: "", prompt: "", order: 0 }]);
    setFormIsDefault(false);
    setEditingId(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formName.trim() ||
      formSections.some((s) => !s.label.trim() || !s.prompt.trim())
    )
      return;
    setFormLoading(true);
    try {
      const payload = {
        name: formName.trim(),
        type: formType,
        description: formDescription.trim() || undefined,
        sections: formSections.map((s, i) => ({
          key: s.key || `section_${i}`,
          label: s.label.trim(),
          prompt: s.prompt.trim(),
          order: i,
        })),
        isDefault: formIsDefault,
      };

      const url = editingId ? `/api/templates/${editingId}` : "/api/templates";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        resetForm();
        setShowAdd(false);
        fetchTemplates();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (template: BriefTemplate) => {
    setFormName(template.name);
    setFormType(template.type);
    setFormDescription(template.description || "");
    setFormSections(
      (template.sections as TemplateSection[]).sort(
        (a, b) => a.order - b.order,
      ),
    );
    setFormIsDefault(template.isDefault);
    setEditingId(template.id);
    setShowAdd(true);
  };

  const handleDuplicate = (template: BriefTemplate) => {
    setFormName(`${template.name} (Copy)`);
    setFormType(template.type);
    setFormDescription(template.description || "");
    setFormSections(
      (template.sections as TemplateSection[]).sort(
        (a, b) => a.order - b.order,
      ),
    );
    setFormIsDefault(false);
    setEditingId(null);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  const handleGenerate = async (templateId: string) => {
    if (!genInput.trim()) return;
    setGenLoading(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: genInput.trim(),
          company: genCompany.trim() || undefined,
          context: genContext.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const briefId = data.data?.id;
        if (briefId) {
          window.location.href = `/briefs/${briefId}`;
        }
      }
    } finally {
      setGenLoading(false);
      setGenerateId(null);
      setGenInput("");
      setGenCompany("");
      setGenContext("");
    }
  };

  const addSection = () => {
    setFormSections([
      ...formSections,
      {
        key: `section_${formSections.length + 1}`,
        label: "",
        prompt: "",
        order: formSections.length,
      },
    ]);
  };

  const removeSection = (index: number) => {
    if (formSections.length <= 1) return;
    setFormSections(formSections.filter((_, i) => i !== index));
  };

  const updateSection = (
    index: number,
    field: keyof TemplateSection,
    value: string | number,
  ) => {
    const updated = [...formSections];
    (updated[index] as unknown as Record<string, string | number>)[field] =
      value;
    if (field === "label") {
      updated[index].key = (value as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    }
    setFormSections(updated);
  };

  const getTypeIcon = (type: string) => {
    const found = TEMPLATE_TYPES.find((t) => t.value === type);
    return found ? found.icon : FileText;
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Brief Templates</h1>
          <p className="text-ink-65 text-sm">
            Pre-configured templates for different briefing scenarios
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAdd(!showAdd);
          }}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink-65">
            {editingId ? "Edit Template" : "Create Template"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-45 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Security Interview Prep"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-45 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-45 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="What this template is for..."
            />
          </div>

          {/* Sections */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <label className="text-xs text-ink-45">
                Sections ({formSections.length})
              </label>
              <button
                type="button"
                onClick={addSection}
                className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Section
              </button>
            </div>
            <div className="space-y-3">
              {formSections.map((section, i) => (
                <div
                  key={i}
                  className="bg-g-bg2 rounded-lg p-3 border border-line-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <span className="text-[10px] text-ink-45 uppercase tracking-wider">
                      Section {i + 1}
                    </span>
                    {formSections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSection(i)}
                        className="text-ink-45 hover:text-red"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={section.label}
                    onChange={(e) => updateSection(i, "label", e.target.value)}
                    placeholder="Section label (e.g. Background)"
                    className="text-sm mb-2"
                  />
                  <textarea
                    value={section.prompt}
                    onChange={(e) => updateSection(i, "prompt", e.target.value)}
                    rows={2}
                    placeholder="AI prompt for this section..."
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-65 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Set as default for this type
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={formLoading}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              {formLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {editingId ? "Save Changes" : "Create Template"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                resetForm();
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Template Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ink-45 animate-spin" />
        </div>
      ) : templates.length > 0 ? (
        <div className="space-y-3">
          {templates.map((template) => {
            const TypeIcon = getTypeIcon(template.type);
            const isExpanded = expandedId === template.id;
            const sections = (template.sections as TemplateSection[]).sort(
              (a, b) => a.order - b.order,
            );

            return (
              <div key={template.id} className="card p-0 overflow-hidden">
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : template.id)
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
                          <TypeIcon className="w-4 h-4 text-ink-65" />
                          <span className="font-medium truncate">
                            {template.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              typeColors[template.type] || typeColors.CUSTOM
                            }`}
                          >
                            {template.type.replace("_", " ")}
                          </span>
                          {template.isDefault && (
                            <Star className="w-3.5 h-3.5 text-accent" />
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-ink-45 mt-1 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-ink-45">
                          <span>{sections.length} sections</span>
                          <span>&middot;</span>
                          <span>
                            Updated{" "}
                            {new Date(template.updatedAt).toLocaleDateString(
                              "en-GB",
                              {
                                day: "2-digit",
                                month: "short",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <button
                        onClick={() =>
                          setGenerateId(
                            generateId === template.id ? null : template.id,
                          )
                        }
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-teal transition-colors"
                        title="Generate brief from this template"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-accent transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(template)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-ink-65 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 rounded hover:bg-g-bg2 text-ink-45 hover:text-red transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Generate Form */}
                {generateId === template.id && (
                  <div className="border-t border-line-2 px-4 py-3 space-y-3">
                    <h4 className="text-xs font-medium text-teal">
                      Generate Brief from &ldquo;{template.name}&rdquo;
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-ink-45 mb-1">
                          Person / Company Name *
                        </label>
                        <input
                          type="text"
                          value={genInput}
                          onChange={(e) => setGenInput(e.target.value)}
                          placeholder="e.g. Jane Doe Contoso"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-ink-45 mb-1">
                          Company (optional)
                        </label>
                        <input
                          type="text"
                          value={genCompany}
                          onChange={(e) => setGenCompany(e.target.value)}
                          placeholder="e.g. Northwind Traders"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-45 mb-1">
                        Context (optional)
                      </label>
                      <input
                        type="text"
                        value={genContext}
                        onChange={(e) => setGenContext(e.target.value)}
                        placeholder="e.g. Meeting tomorrow, interview prep"
                        className="text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerate(template.id)}
                        disabled={genLoading || !genInput.trim()}
                        className="btn btn-primary text-xs flex items-center gap-1 disabled:opacity-40"
                      >
                        {genLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Generate Brief
                      </button>
                      <button
                        onClick={() => {
                          setGenerateId(null);
                          setGenInput("");
                          setGenCompany("");
                          setGenContext("");
                        }}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded Sections Preview */}
                {isExpanded && (
                  <div className="border-t border-line-2 px-4 py-3">
                    <h4 className="text-xs font-medium text-ink-65 mb-3">
                      Template Sections
                    </h4>
                    <div className="space-y-2">
                      {sections.map((section, i) => (
                        <div
                          key={section.key}
                          className="bg-g-bg2 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-ink-45 font-mono">
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium text-ink-65">
                              {section.label}
                            </span>
                            <span className="text-[10px] text-ink-45 font-mono">
                              {section.key}
                            </span>
                          </div>
                          <p className="text-xs text-ink-45 line-clamp-2">
                            {section.prompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <FileText className="w-8 h-8 text-ink-45 mx-auto mb-3" />
          <p className="text-ink-45 mb-1">No templates yet</p>
          <p className="text-ink-45 text-sm">
            Create templates for different briefing scenarios like pre-meeting,
            investor research, or competitor analysis.
          </p>
        </div>
      )}
    </div>
  );
}
