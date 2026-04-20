"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjects, useTemplates, useStartRun } from "@/lib/hooks";

export default function NewRunPage() {
  const router = useRouter();
  const projects = useProjects();
  const templates = useTemplates();
  const start = useStartRun();

  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [topic, setTopic] = useState("");
  const [mainKeyword, setMainKeyword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const run = await start.mutateAsync({
      projectId,
      templateId,
      input: {
        topic,
        mainKeyword: mainKeyword.trim(),
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
