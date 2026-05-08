"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreateProject } from "@/lib/hooks";
import type { CreateProjectDto, ResearchEffort } from "@sensai/shared";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESEARCH_EFFORTS: ResearchEffort[] = ["lite", "standard", "deep", "exhaustive"];
const MODEL_KEYS = ["research", "brief", "draft", "edit", "seo"] as const;
type ModelKey = (typeof MODEL_KEYS)[number];

export default function NewProjectPage() {
  const router = useRouter();
  const create = useCreateProject();

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [researchEffort, setResearchEffort] = useState<"" | ResearchEffort>("");
  const [models, setModels] = useState<Record<ModelKey, string>>({
    research: "",
    brief: "",
    draft: "",
    edit: "",
    seo: "",
  });
  const [overrides, setOverrides] = useState<Array<{ key: string; value: string }>>([]);

  const slugValid = SLUG_RE.test(slug);
  const canSubmit = slugValid && name.trim().length >= 2 && !create.isPending;

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

    const dto: CreateProjectDto = {
      slug: slug.trim(),
      name: name.trim(),
      config: {
        toneOfVoice: toneOfVoice.trim(),
        targetAudience: targetAudience.trim(),
        guidelines: guidelines.trim(),
        defaultModels,
        ...(researchEffort ? { researchEffort } : {}),
        promptOverrides,
        productPitch: "",
        domain: "",
        keyTerms: [],
        antiTerms: [],
        competitors: [],
      },
    };

    const project = await create.mutateAsync(dto);
    router.push(`/runs/new?projectId=${project.id}`);
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>
      <h1 className="text-2xl font-semibold">Nowy projekt</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Podstawowe</h2>

          <div className="space-y-1">
            <label className="text-sm font-medium">Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="np. demo, blog-seo, klient-x"
              className="w-full rounded border px-3 py-2 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Kebab-case (a-z, 0-9, '-'). Unikalny identyfikator projektu.
            </p>
            {slug && !slugValid && (
              <p className="text-xs text-red-500">Niepoprawny format slug.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Nazwa</label>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Demo Project"
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
              placeholder="np. profesjonalny, konkretny, bez żargonu"
              rows={2}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Grupa docelowa</label>
            <textarea
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="np. małe i średnie polskie firmy prowadzące działalność online"
              rows={2}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Wytyczne edytorskie</label>
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="np. cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków."
              rows={4}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Domyślne modele</h2>
          <p className="text-xs text-muted-foreground">
            Identyfikatory modeli (np. <code className="font-mono">openai/gpt-5-mini</code>).
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
          <div className="space-y-1">
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
          </div>
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
          <p className="text-xs text-muted-foreground">
            Klucz = identyfikator promptu (np. <code className="font-mono">brief.system</code>),
            wartość = treść override.
          </p>
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
                placeholder="Treść override..."
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
            {create.isPending ? "Tworzę…" : "Utwórz projekt"}
          </button>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Anuluj
          </Link>
        </div>
        {create.error && <p className="text-red-500">Błąd: {String(create.error)}</p>}
      </form>
    </div>
  );
}
