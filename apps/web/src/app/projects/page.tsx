"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ProjectConfig } from "@sensai/shared";
import { useProjects, useRuns } from "@/lib/hooks";
import { formatDateTime } from "@/lib/run-display";

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useProjects();
  const runs = useRuns();

  const runCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of runs.data ?? []) {
      map.set(r.projectId, (map.get(r.projectId) ?? 0) + 1);
    }
    return map;
  }, [runs.data]);

  const sorted = useMemo(() => {
    return [...(projects.data ?? [])].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [projects.data]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Wróć
        </Link>
      </div>

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projekty</h1>
        <Link
          href="/projects/new"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          + Nowy projekt
        </Link>
      </header>

      {projects.isLoading && <p>Ładowanie…</p>}
      {projects.error && (
        <p className="text-red-500">Błąd: {String(projects.error)}</p>
      )}
      {projects.data && projects.data.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-3">Brak projektów.</p>
          <Link
            href="/projects/new"
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Utwórz pierwszy projekt
          </Link>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((p) => {
            const config = (p.config ?? {}) as Partial<ProjectConfig>;
            const runCount = runCountByProject.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/projects/${p.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/projects/${p.id}`);
                  }}
                  className="block cursor-pointer rounded border px-4 py-3 hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                          {p.slug}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {config.domain && <span>{config.domain}</span>}
                        {config.researchEffort && (
                          <span>research: {config.researchEffort}</span>
                        )}
                        <span>
                          {runCount} {runCount === 1 ? "run" : "runów"}
                        </span>
                        <span>{formatDateTime(p.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/runs/new?projectId=${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        + Run
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
