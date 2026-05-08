"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type {
  ProjectConfig,
  ResearchEffort,
  UpdateProjectDto,
} from "@sensai/shared";
import { useProject, useUpdateProject } from "@/lib/hooks";

const RESEARCH_EFFORTS: ResearchEffort[] = ["lite", "standard", "deep", "exhaustive"];
const MODEL_KEYS = ["research", "brief", "draft", "edit", "seo"] as const;
type ModelKey = (typeof MODEL_KEYS)[number];

function csv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const project = useProject(id);
  const update = useUpdateProject(id);

  const [name, setName] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [productPitch, setProductPitch] = useState("");
  const [domain, setDomain] = useState("");
  const [keyTerms, setKeyTerms] = useState("");
  const [antiTerms, setAntiTerms] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [researchEffort, setResearchEffort] = useState<"" | ResearchEffort>("");
  const [models, setModels] = useState<Record<ModelKey, string>>({
    research: "",
    brief: "",
    draft: "",
    edit: "",
    seo: "",
  });
  const [overrides, setOverrides] = useState<Array<{ key: string; value: string }>>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!project.data || hydrated) return;
    const cfg = (project.data.config ?? {}) as Partial<ProjectConfig>;
    setName(project.data.name);
    setToneOfVoice(cfg.toneOfVoice ?? "");
    setTargetAudience(cfg.targetAudience ?? "");
    setGuidelines(cfg.guidelines ?? "");
    setProductPitch(cfg.productPitch ?? "");
    setDomain(cfg.domain ?? "");
    setKeyTerms(csv(cfg.keyTerms));
    setAntiTerms(csv(cfg.antiTerms));
    setCompetitors(csv(cfg.competitors));
    setResearchEffort(cfg.researchEffort ?? "");
    const m = cfg.defaultModels ?? {};
    setModels({
      research: m.research ?? "",
      brief: m.brief ?? "",
      draft: m.draft ?? "",
      edit: m.edit ?? "",
      seo: m.seo ?? "",
    });
    setOverrides(
      Object.entries(cfg.promptOverrides ?? {}).map(([k, v]) => ({
        key: k,
        value: v,
      })),
    );
    setHydrated(true);
  }, [project.data, hydrated]);

  function setModel(k: ModelKey, v: string) {
    setModels((prev) => ({ ...prev, [k]: v }));
  }
  function addOverride() {
    setOverrides((prev) => [...prev, { key: "", value: "" }]);
  }
  function removeOverride(idx: number) {
    setOverrides((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateOverride(idx: number, patch: Partial<{ key: string; value: string }>) {
    setOverrides((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  const canSubmit = hydrated && name.trim().length >= 2 && !update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const defaultModels: Record<string, string> = {};
    for (const k of MODEL_KEYS) {
      const v = models[k].trim();
      if (v) defaultModels[k] = v;
    }
    const promptOverrides: Record<string, string> = {};
    for (const o of overrides) {
      const k = o.key.trim();
      if (!k) continue;
      promptOverrides[k] = o.value;
    }

    const dto: UpdateProjectDto = {
      name: name.trim(),
      config: {
        toneOfVoice: toneOfVoice.trim(),
        targetAudience: targetAudience.trim(),
        guidelines: guidelines.trim(),
        defaultModels,
        ...(researchEffort ? { researchEffort } : {}),
        promptOverrides,
        productPitch: productPitch.trim(),
        domain: domain.trim(),
        keyTerms: parseCsv(keyTerms),
        antiTerms: parseCsv(antiTerms),
        competitors: parseCsv(competitors),
      },
    };

    await update.mutateAsync(dto);
    router.push(`/projects/${id}`);
  }

  if (project.isLoading) return <p>Ładowanie…</p>;
  if (project.error) {
    return (
      <div className="space-y-3">
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Lista projektów
        </Link>
        <p className="text-red-500">Błąd: {String(project.error)}</p>
      </div>
    );
  }
  if (!project.data) return null;

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Wróć do projektu
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Edycja projektu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Slug{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {project.data.slug}
          </code>{" "}
          jest niezmienny.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Podstawowe</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">Nazwa</label>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Profil treści</h2>

          <div className="space-y-1">
            <label className="text-sm font-medium">Tone of voice</label>
            <textarea
              value={toneOfVoice}
              onChange={(e) => setToneOfVoice(e.target.value)}
              rows={2}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Grupa docelowa</label>
            <textarea
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              rows={2}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Wytyczne edytorskie</label>
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              rows={4}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Product pitch</label>
            <textarea
              value={productPitch}
              onChange={(e) => setProductPitch(e.target.value)}
              rows={3}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Domain</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="np. fintech, e-commerce, B2B SaaS"
              className="w-full rounded border px-3 py-2 font-mono text-sm"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Kontekst tematyczny</h2>
          <p className="text-xs text-muted-foreground">
            Wartości oddzielone przecinkiem.
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Key terms</label>
            <input
              value={keyTerms}
              onChange={(e) => setKeyTerms(e.target.value)}
              placeholder="np. SEO, content marketing, AI"
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Anti-terms</label>
            <input
              value={antiTerms}
              onChange={(e) => setAntiTerms(e.target.value)}
              placeholder="np. crypto, gambling"
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Konkurencja</label>
            <input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="np. example.com, competitor.io"
              className="w-full rounded border px-3 py-2 font-mono text-sm"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Domyślne modele</h2>
          <p className="text-xs text-muted-foreground">
            Pozostaw puste, by użyć domyślnych z szablonu.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODEL_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <label className="text-sm font-medium capitalize">{k}</label>
                <input
                  value={models[k]}
                  onChange={(e) => setModel(k, e.target.value)}
                  placeholder={k === "brief" ? "openai/gpt-5-mini" : "—"}
                  className="w-full rounded border px-3 py-2 font-mono text-sm"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Research effort</h2>
          <select
            value={researchEffort}
            onChange={(e) => setResearchEffort(e.target.value as "" | ResearchEffort)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— domyślny z szablonu —</option>
            {RESEARCH_EFFORTS.map((eff) => (
              <option key={eff} value={eff}>
                {eff}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Prompt overrides</h2>
            <button
              type="button"
              onClick={addOverride}
              className="rounded border px-3 py-1 text-sm hover:bg-muted/50"
            >
              + Dodaj
            </button>
          </div>
          {overrides.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak override'ów.</p>
          )}
          {overrides.map((o, idx) => (
            <div key={idx} className="space-y-2 rounded border p-3">
              <div className="flex items-center gap-2">
                <input
                  value={o.key}
                  onChange={(e) => updateOverride(idx, { key: e.target.value })}
                  placeholder="prompt.key"
                  className="flex-1 rounded border px-3 py-2 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeOverride(idx)}
                  className="rounded border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Usuń
                </button>
              </div>
              <textarea
                value={o.value}
                onChange={(e) => updateOverride(idx, { value: e.target.value })}
                rows={3}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          ))}
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {update.isPending ? "Zapisuję…" : "Zapisz zmiany"}
          </button>
          <Link
            href={`/projects/${id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            Anuluj
          </Link>
        </div>
        {update.error && (
          <p className="text-red-500">Błąd: {String(update.error)}</p>
        )}
      </form>
    </div>
  );
}
