"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useProjects, useRuns, useTemplates } from "@/lib/hooks";
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

export default function HomePage() {
  const runs = useRuns();
  const projects = useProjects();
  const templates = useTemplates();

  const projectsById = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p])),
    [projects.data],
  );
  const templatesById = useMemo(
    () => new Map((templates.data ?? []).map((t) => [t.id, t])),
    [templates.data],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sens.ai Content Generation</h1>
        <Link
          href="/runs/new"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          + Nowy run
        </Link>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Ostatnie runy</h2>
        {runs.isLoading && <p>Ładowanie…</p>}
        {runs.error && <p className="text-red-500">Błąd: {String(runs.error)}</p>}
        {runs.data && runs.data.length === 0 && (
          <p className="text-muted-foreground">Brak runów. Uruchom pierwszy.</p>
        )}
        {runs.data && runs.data.length > 0 && (
          <ul className="space-y-2">
            {runs.data.map((r) => {
              const project = projectsById.get(r.projectId);
              const template = templatesById.get(r.templateId);
              const progress = getStepProgress(r, template);
              const keyword = getRunKeyword(r);
              const statusClass = STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground";
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
                          {project && <span>{project.name}</span>}
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
