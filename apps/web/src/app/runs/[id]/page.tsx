"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useCancelRun, useProjects, useRun, useTemplates } from "@/lib/hooks";
import { RunTimeline } from "@/components/run-timeline";
import { hasRichRenderer, StepOutput } from "@/components/step-output";
import {
  formatDateTime,
  formatDuration,
  getRunKeyword,
  getRunTitle,
  getRunTopic,
  getStepProgress,
} from "@/lib/run-display";
import { ApproveScrapeForm } from "./approve-scrape-form";
import { RerunStepPanel } from "./rerun-step-panel";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const run = useRun(params?.id);
  const projects = useProjects();
  const templates = useTemplates();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();
  const [rawJson, setRawJson] = useState(false);
  const cancelRun = useCancelRun();

  const isCancellable =
    run.data?.status === "pending" ||
    run.data?.status === "running" ||
    run.data?.status === "awaiting_approval";

  const handleCancel = () => {
    if (!run.data) return;
    if (!confirm("Zatrzymać tego runa? Aktualnie wykonywany krok dokończy się, ale kolejne nie wystartują.")) return;
    cancelRun.mutate(run.data.id);
  };

  const project = useMemo(
    () => projects.data?.find((p) => p.id === run.data?.projectId),
    [projects.data, run.data?.projectId],
  );
  const template = useMemo(
    () => templates.data?.find((t) => t.id === run.data?.templateId),
    [templates.data, run.data?.templateId],
  );

  const selectedStep = run.data?.steps.find((s) => s.id === selectedStepId) ?? run.data?.steps[0];

  const currentStep = run.data?.steps.find((s) => s.stepOrder === run.data?.currentStepOrder);
  const isAwaitingScrape =
    run.data?.status === "awaiting_approval" && currentStep?.type === "tool.scrape";

  const prevOutput = isAwaitingScrape
    ? run.data?.steps.find((s) => s.stepOrder === currentStep!.stepOrder - 1)?.output
    : null;

  const serpItems: Array<{ title: string; url: string; description: string; position: number }> =
    prevOutput && typeof prevOutput === "object" && Array.isArray((prevOutput as any).items)
      ? (prevOutput as any).items
      : [];

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>

      {run.isLoading && <p>Ładowanie…</p>}
      {run.error && <p className="text-red-500">Błąd: {String(run.error)}</p>}

      {run.data && (
        <>
          <header className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold">{getRunTitle(run.data)}</h1>
                {(() => {
                  const topic = getRunTopic(run.data);
                  const keyword = getRunKeyword(run.data);
                  const title = getRunTitle(run.data);
                  const parts: string[] = [];
                  if (topic && !title.includes(topic)) parts.push(`topic: ${topic}`);
                  if (keyword && !title.includes(keyword)) parts.push(`keyword: ${keyword}`);
                  return parts.length > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{parts.join(" · ")}</p>
                  ) : null;
                })()}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    STATUS_STYLES[run.data.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {run.data.status}
                </span>
                {isCancellable && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelRun.isPending}
                    className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {cancelRun.isPending ? "Zatrzymywanie…" : "Zatrzymaj"}
                  </button>
                )}
              </div>
            </div>
            {cancelRun.error && (
              <p className="text-xs text-red-600">Błąd zatrzymania: {String(cancelRun.error)}</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
              {project && (
                <div>
                  <dt className="text-xs text-muted-foreground">Projekt</dt>
                  <dd>{project.name}</dd>
                </div>
              )}
              {template && (
                <div>
                  <dt className="text-xs text-muted-foreground">Template</dt>
                  <dd>
                    {template.name} <span className="text-muted-foreground">v{template.version}</span>
                  </dd>
                </div>
              )}
              {(() => {
                const progress = getStepProgress(run.data, template);
                return progress ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Postęp</dt>
                    <dd>
                      krok {progress.current}/{progress.total}
                    </dd>
                  </div>
                ) : null;
              })()}
              <div>
                <dt className="text-xs text-muted-foreground">Czas trwania</dt>
                <dd>{formatDuration(run.data.createdAt, run.data.finishedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Utworzony</dt>
                <dd>{formatDateTime(run.data.createdAt)}</dd>
              </div>
              {run.data.finishedAt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Zakończony</dt>
                  <dd>{formatDateTime(run.data.finishedAt)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{run.data.id.slice(0, 8)}</dd>
              </div>
            </dl>
          </header>

          {isAwaitingScrape && currentStep && serpItems.length > 0 && (
            <ApproveScrapeForm
              runId={run.data.id}
              stepId={currentStep.id}
              serpItems={serpItems}
            />
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
            <aside>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Kroki</h2>
              <RunTimeline
                steps={run.data.steps}
                selectedStepId={selectedStep?.id}
                onSelectStep={setSelectedStepId}
              />
            </aside>

            <section className="min-w-0">
              {selectedStep ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">
                    {selectedStep.stepKey}{" "}
                    <span className="text-sm text-muted-foreground">({selectedStep.type})</span>
                  </h2>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground">Output</h3>
                      {hasRichRenderer(selectedStep.type) && selectedStep.output != null && (
                        <div className="flex overflow-hidden rounded border text-xs">
                          <button
                            type="button"
                            onClick={() => setRawJson(false)}
                            className={`px-2 py-1 ${
                              !rawJson ? "bg-muted font-medium" : "text-muted-foreground"
                            }`}
                          >
                            Widok
                          </button>
                          <button
                            type="button"
                            onClick={() => setRawJson(true)}
                            className={`border-l px-2 py-1 ${
                              rawJson ? "bg-muted font-medium" : "text-muted-foreground"
                            }`}
                          >
                            Raw JSON
                          </button>
                        </div>
                      )}
                    </div>
                    <StepOutput
                      type={selectedStep.type}
                      value={selectedStep.output}
                      raw={rawJson}
                    />
                  </div>
                  {run.data && (
                    <RerunStepPanel
                      runId={run.data.id}
                      stepId={selectedStep.id}
                      stepKey={selectedStep.stepKey}
                      stepStatus={selectedStep.status}
                    />
                  )}
                  {!!selectedStep.error && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-red-600">Błąd</h3>
                      <pre className="overflow-x-auto rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                        {JSON.stringify(selectedStep.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Wybierz krok po lewej.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
