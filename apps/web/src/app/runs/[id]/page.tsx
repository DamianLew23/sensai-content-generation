"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useRun } from "@/lib/hooks";
import { RunTimeline } from "@/components/run-timeline";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const run = useRun(params?.id);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();

  const selectedStep = run.data?.steps.find((s) => s.id === selectedStepId) ?? run.data?.steps[0];

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>

      {run.isLoading && <p>Ładowanie…</p>}
      {run.error && <p className="text-red-500">Błąd: {String(run.error)}</p>}

      {run.data && (
        <>
          <header>
            <h1 className="text-2xl font-semibold">Run {run.data.id.slice(0, 8)}</h1>
            <p className="text-sm text-muted-foreground">
              status: <span className="font-mono">{run.data.status}</span>
            </p>
          </header>

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
                    <h3 className="text-sm font-medium text-muted-foreground">Output</h3>
                    <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                      {selectedStep.output
                        ? JSON.stringify(selectedStep.output, null, 2)
                        : "—"}
                    </pre>
                  </div>
                  {!!selectedStep.error && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-red-600">Error</h3>
                      <pre className="overflow-x-auto rounded bg-red-50 p-3 text-xs">
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
