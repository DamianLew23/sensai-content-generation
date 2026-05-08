"use client";
import Link from "next/link";
import { use, useMemo } from "react";
import type { ProjectConfig } from "@sensai/shared";
import { useDeleteRun, useProject, useRuns, useTemplates } from "@/lib/hooks";
import {
  formatDateTime,
  formatDuration,
  getRunKeyword,
  getRunTitle,
  getStepProgress,
} from "@/lib/run-display";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

const MODEL_LABELS: Record<string, string> = {
  research: "Research",
  brief: "Brief",
  draft: "Draft",
  edit: "Edit",
  seo: "SEO",
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const project = useProject(id);
  const runs = useRuns();
  const templates = useTemplates();
  const deleteRun = useDeleteRun();

  const templatesById = useMemo(
    () => new Map((templates.data ?? []).map((t) => [t.id, t])),
    [templates.data],
  );

  const projectRuns = useMemo(() => {
    return (runs.data ?? [])
      .filter((r) => r.projectId === id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [runs.data, id]);

  if (project.isLoading) {
    return <p>Ładowanie…</p>;
  }
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

  const p = project.data;
  const config = (p.config ?? {}) as Partial<ProjectConfig>;
  const models = config.defaultModels ?? {};
  const modelEntries = Object.entries(models).filter(([, v]) => Boolean(v));
  const overrides = config.promptOverrides ?? {};
  const overrideEntries = Object.entries(overrides);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Lista projektów
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {p.slug}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {config.domain && <span>{config.domain}</span>}
            <span>Utworzony: {formatDateTime(p.createdAt)}</span>
            <span className="font-mono opacity-60">{p.id.slice(0, 8)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/projects/${p.id}/edit`}
            className="rounded border px-4 py-2 text-sm hover:bg-muted/50"
          >
            Edytuj
          </Link>
          <Link
            href={`/runs/new?projectId=${p.id}`}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            + Nowy run
          </Link>
        </div>
      </header>

      <section className="space-y-4 rounded border p-4">
        <h2 className="text-lg font-medium">Profil treści</h2>
        <Field label="Tone of voice" value={config.toneOfVoice} />
        <Field label="Grupa docelowa" value={config.targetAudience} />
        <Field label="Wytyczne edytorskie" value={config.guidelines} />
        <Field label="Product pitch" value={config.productPitch} />
        <Field label="Domain" value={config.domain} mono />
      </section>

      <section className="space-y-4 rounded border p-4">
        <h2 className="text-lg font-medium">Kontekst tematyczny</h2>
        <TagList label="Key terms" values={config.keyTerms} />
        <TagList label="Anti-terms" values={config.antiTerms} />
        <TagList label="Konkurencja" values={config.competitors} />
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Modele i research</h2>
        <div className="text-sm">
          <span className="font-medium">Research effort: </span>
          <span className="text-muted-foreground">
            {config.researchEffort ?? "— domyślny z szablonu —"}
          </span>
        </div>
        {modelEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Wszystkie modele dziedziczone z szablonu.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {modelEntries.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase text-muted-foreground">
                  {MODEL_LABELS[k] ?? k}
                </dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {overrideEntries.length > 0 && (
        <section className="space-y-3 rounded border p-4">
          <h2 className="text-lg font-medium">
            Prompt overrides ({overrideEntries.length})
          </h2>
          <ul className="space-y-3">
            {overrideEntries.map(([k, v]) => (
              <li key={k} className="space-y-1">
                <div className="font-mono text-xs">{k}</div>
                <pre className="whitespace-pre-wrap rounded bg-muted px-3 py-2 text-xs">
                  {v}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Runy ({projectRuns.length})
          </h2>
        </div>
        {runs.isLoading && <p>Ładowanie runów…</p>}
        {!runs.isLoading && projectRuns.length === 0 && (
          <p className="text-muted-foreground">
            Brak runów dla tego projektu.{" "}
            <Link
              href={`/runs/new?projectId=${p.id}`}
              className="underline"
            >
              Uruchom pierwszy.
            </Link>
          </p>
        )}
        {projectRuns.length > 0 && (
          <ul className="space-y-2">
            {projectRuns.map((r) => {
              const template = templatesById.get(r.templateId);
              const progress = getStepProgress(r, template);
              const keyword = getRunKeyword(r);
              const statusClass =
                STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground";
              return (
                <li key={r.id}>
                  <Link
                    href={`/runs/${r.id}`}
                    className="block rounded border px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{getRunTitle(r)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {template && (
                            <span>
                              {template.name} v{template.version}
                            </span>
                          )}
                          {keyword && !getRunTitle(r).includes(keyword) && (
                            <span className="font-mono">{keyword}</span>
                          )}
                          <span className="font-mono text-[10px] opacity-60">
                            {r.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {r.status}
                        </span>
                        {progress && (
                          <span className="text-xs text-muted-foreground">
                            krok {progress.current}/{progress.total}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (deleteRun.isPending) return;
                            const title = getRunTitle(r);
                            if (
                              !window.confirm(
                                `Usunąć run „${title}"? Tej operacji nie można cofnąć.`,
                              )
                            )
                              return;
                            deleteRun.mutate(r.id, {
                              onError: (err) =>
                                window.alert(`Nie udało się usunąć: ${String(err)}`),
                            });
                          }}
                          disabled={deleteRun.isPending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Usuń
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDateTime(r.createdAt)}</span>
                      <span>·</span>
                      <span>{formatDuration(r.createdAt, r.finishedAt)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      {value ? (
        <p
          className={`whitespace-pre-wrap text-sm ${mono ? "font-mono" : ""}`}
        >
          {value}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">— nie ustawiono —</p>
      )}
    </div>
  );
}

function TagList({
  label,
  values,
}: {
  label: string;
  values: string[] | undefined;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      {values && values.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
            >
              {v}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">— brak —</p>
      )}
    </div>
  );
}
