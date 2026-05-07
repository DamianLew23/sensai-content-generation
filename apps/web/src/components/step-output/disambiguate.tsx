"use client";
import type { DisambiguateOutput as DisambiguateOutputType } from "@sensai/shared";
import { EmptyOutput, Metric } from "./shared";

function isDisambiguateOutput(v: unknown): v is DisambiguateOutputType {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.refinedTopic === "string" &&
    typeof o.mainKeyword === "string" &&
    typeof o.intent === "string" &&
    typeof o.contentType === "string" &&
    typeof o.researchQuestion === "string" &&
    Array.isArray(o.serpQueries) &&
    Array.isArray(o.antiAngles) &&
    typeof o.rationale === "string"
  );
}

const INTENT_BADGE: Record<string, string> = {
  informational: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  navigational: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  transactional: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  commercial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export function DisambiguateOutput({ value }: { value: unknown }) {
  if (!isDisambiguateOutput(value)) return <EmptyOutput />;
  const {
    refinedTopic,
    mainKeyword,
    intent,
    contentType,
    researchQuestion,
    serpQueries,
    antiAngles,
    rationale,
  } = value;

  const intentBadge = INTENT_BADGE[intent] ?? "bg-muted text-foreground";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="SERP queries" value={serpQueries.length} />
        <Metric label="Anti-angles" value={antiAngles.length} />
        <Metric label="Content type" value={contentType} />
        <Metric label="Main keyword" value={mainKeyword} />
      </div>

      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Refined topic
        </h3>
        <p className="text-sm font-medium">{refinedTopic}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Intencja:</span>
          <span className={`rounded px-1.5 py-0.5 font-medium ${intentBadge}`}>{intent}</span>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Research question (you.com)
        </h3>
        <p className="text-sm">{researchQuestion}</p>
      </section>

      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SERP queries ({serpQueries.length})
        </h3>
        {serpQueries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak.</p>
        ) : (
          <ul className="space-y-1">
            {serpQueries.map((q, i) => (
              <li key={`${i}-${q.slice(0, 48)}`} className="rounded-md border bg-muted/20 p-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">#{i + 1}</span>{" "}
                <span>{q}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Anti-angles (downstream guards) ({antiAngles.length})
        </h3>
        {antiAngles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {antiAngles.map((a, i) => (
              <li key={`${i}-${a.slice(0, 48)}`}>{a}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-muted/20 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rationale
        </h3>
        <p className="text-xs italic text-muted-foreground">{rationale}</p>
      </section>
    </div>
  );
}
