"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useProjects, useTemplates, useStartRun } from "@/lib/hooks";

export default function NewRunPage() {
  const router = useRouter();
  const params = useSearchParams();
  const projects = useProjects();
  const templates = useTemplates();
  const start = useStartRun();

  const [projectId, setProjectId] = useState(params.get("projectId") ?? "");
  const [templateId, setTemplateId] = useState("");
  const [topic, setTopic] = useState("");
  const [mainKeyword, setMainKeyword] = useState("");
  const [strategicValue, setStrategicValue] = useState("");
  const [uniqueInsight, setUniqueInsight] = useState("");
  const [additionalKeywords, setAdditionalKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");

  function addKeyword(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (additionalKeywords.includes(value)) return;
    if (additionalKeywords.length >= 20) return;
    setAdditionalKeywords([...additionalKeywords, value]);
    setKeywordDraft("");
  }

  function removeKeyword(value: string) {
    setAdditionalKeywords(additionalKeywords.filter((k) => k !== value));
  }

  function onKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordDraft);
    } else if (e.key === "Backspace" && keywordDraft === "" && additionalKeywords.length > 0) {
      e.preventDefault();
      setAdditionalKeywords(additionalKeywords.slice(0, -1));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pendingKeyword = keywordDraft.trim();
    const finalKeywords = pendingKeyword && !additionalKeywords.includes(pendingKeyword)
      ? [...additionalKeywords, pendingKeyword].slice(0, 20)
      : additionalKeywords;
    const run = await start.mutateAsync({
      projectId,
      templateId,
      input: {
        topic,
        mainKeyword: mainKeyword.trim(),
        strategicValue: strategicValue.trim() || undefined,
        uniqueInsight: uniqueInsight.trim() || undefined,
        additionalKeywords: finalKeywords.length > 0 ? finalKeywords : undefined,
      },
    });
    router.push(`/runs/${run.id}`);
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>
      <h1 className="text-2xl font-semibold">Nowy run</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Projekt</label>
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— wybierz —</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Szablon</label>
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— wybierz —</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} v{t.version}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Temat</label>
          <input
            required
            minLength={3}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="np. Jak małe firmy mogą wykorzystać AI"
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Główne słowo kluczowe</label>
          <input
            required
            minLength={2}
            value={mainKeyword}
            onChange={(e) => setMainKeyword(e.target.value)}
            placeholder="np. ai dla małych firm"
            className="w-full rounded border px-3 py-2"
          />
          <p className="text-xs text-muted-foreground">Wymagane dla szablonów z research SERP.</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Wartość strategiczna</label>
          <textarea
            value={strategicValue}
            onChange={(e) => setStrategicValue(e.target.value)}
            placeholder="Po co publikujemy ten artykuł? Jaki cel biznesowy / decyzję u czytelnika ma wspierać?"
            rows={3}
            className="w-full rounded border px-3 py-2"
          />
          <p className="text-xs text-muted-foreground">
            Opcjonalne. Trafia do disambiguate, briefa (i w kolejnych etapach do optimize/humanize).
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Unikalny insight</label>
          <textarea
            value={uniqueInsight}
            onChange={(e) => setUniqueInsight(e.target.value)}
            placeholder="Oryginalna teza lub kąt, którego artykuł ma bronić — przewaga nad mainstreamowym SERP-em."
            rows={3}
            className="w-full rounded border px-3 py-2"
          />
          <p className="text-xs text-muted-foreground">
            Opcjonalne. Trafia do disambiguate i briefa jako teza do obrony.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Dodatkowe słowa kluczowe</label>
          <div className="flex flex-wrap gap-2 rounded border px-2 py-2">
            {additionalKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Usuń ${kw}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={onKeywordKeyDown}
              onBlur={() => addKeyword(keywordDraft)}
              placeholder={additionalKeywords.length === 0 ? "np. ai dla mśp, automatyzacja sprzedaży…" : ""}
              className="flex-1 min-w-[12rem] bg-transparent text-sm outline-none"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enter lub przecinek dodaje frazę. Max 20. Backspace na pustym polu usuwa ostatnią.
          </p>
        </div>

        <button
          type="submit"
          disabled={!projectId || !templateId || topic.length < 3 || mainKeyword.trim().length < 2 || start.isPending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {start.isPending ? "Startuję…" : "Start"}
        </button>
        {start.error && <p className="text-red-500">Błąd: {String(start.error)}</p>}
      </form>
    </div>
  );
}
