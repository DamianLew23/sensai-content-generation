"use client";
import type {
  OutlineGenerationResult,
  FullSection,
  ContextSection,
} from "@sensai/shared";

interface Props {
  output: OutlineGenerationResult;
}

const intentColors: Record<string, string> = {
  Definicyjna: "bg-blue-100 text-blue-800",
  Problemowa: "bg-red-100 text-red-800",
  Instrukcyjna: "bg-green-100 text-green-800",
  Decyzyjna: "bg-purple-100 text-purple-800",
  Diagnostyczna: "bg-orange-100 text-orange-800",
  Porównawcza: "bg-gray-100 text-gray-800",
};

function isOutlineGenerationResult(v: unknown): v is OutlineGenerationResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.meta &&
    Array.isArray(o.outline) &&
    Array.isArray(o.warnings)
  );
}

export function OutlineGenOutput({ value }: { value: unknown }) {
  if (!isOutlineGenerationResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <OutlineGenRenderer output={value} />;
}

function OutlineGenRenderer({ output }: Props) {
  const { meta, outline, warnings } = output;
  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language:{" "}
          {meta.language}
        </div>
        <div className="mt-1 text-lg font-semibold">
          # {meta.h1Title}{" "}
          <span
            className="text-xs font-normal text-slate-500"
            title={`H1 source: ${meta.h1Source}`}
          >
            ({meta.h1Source === "user" ? "user-provided" : "LLM-generated"})
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span>primary intent:</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${intentColors[meta.primaryIntent] ?? ""}`}
          >
            {meta.primaryIntent}
          </span>
          <span className="text-muted-foreground">({meta.primaryIntentSource})</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {meta.fullSectionsCount} full · {meta.contextSectionsCount} context ·
          model: {meta.model}
        </div>
      </header>

      <section>
        <ol className="space-y-2">
          {outline.map((s) => {
            if (s.type === "intro") {
              return (
                <li key={s.order} className="text-sm">
                  <span className="font-mono text-muted-foreground">
                    📖 {s.order}.
                  </span>{" "}
                  <em>Intro</em>
                </li>
              );
            }
            if (s.sectionVariant === "full") {
              return <FullSectionRow key={s.order} s={s} />;
            }
            return <ContextSectionRow key={s.order} s={s} />;
          })}
        </ol>
      </section>

      {warnings.length > 0 && (
        <details className="rounded border border-amber-300 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            ⚠️ {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.kind}</span>: {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded border bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function FullSectionRow({ s }: { s: FullSection }) {
  return (
    <li className="text-sm">
      <div>
        <span className="font-mono text-muted-foreground">📌 {s.order}.</span>{" "}
        <span className="font-medium">{s.header}</span>{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">full</span>{" "}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${intentColors[s.sourceIntent] ?? ""}`}
        >
          {s.sourceIntent}
        </span>
      </div>
      {s.h3s.length > 0 && (
        <ul className="ml-6 mt-1 space-y-1">
          {s.h3s.map((h, i) => (
            <li key={i} className="text-xs">
              <span>{h.format === "question" ? "❓" : "📝"}</span> {h.header}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ContextSectionRow({ s }: { s: ContextSection }) {
  return (
    <li className="text-sm">
      <div>
        <span className="font-mono text-muted-foreground">📋 {s.order}.</span>{" "}
        <span className="font-medium">{s.header}</span>{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">context</span>{" "}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${intentColors[s.sourceIntent] ?? ""}`}
        >
          {s.sourceIntent}
        </span>
      </div>
      <details className="ml-6 mt-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          grouped areas ({s.groupedAreas.length})
        </summary>
        <ul className="ml-4 mt-1 list-disc">
          {s.groupedAreas.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
      <div className="ml-6 mt-1 text-xs italic text-muted-foreground">
        💬 {s.contextNote}
      </div>
    </li>
  );
}
