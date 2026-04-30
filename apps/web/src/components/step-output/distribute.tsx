"use client";
import type {
  DistributionResult,
  SectionWithKG,
  FullSectionWithKG,
  ContextSectionWithKG,
  IntroSectionWithKG,
  CoverageBlock,
} from "@sensai/shared";

const intentColors: Record<string, string> = {
  Definicyjna: "bg-blue-100 text-blue-800",
  Problemowa: "bg-red-100 text-red-800",
  Instrukcyjna: "bg-green-100 text-green-800",
  Decyzyjna: "bg-purple-100 text-purple-800",
  Diagnostyczna: "bg-orange-100 text-orange-800",
  Porównawcza: "bg-gray-100 text-gray-800",
};

function coverageColor(percent: number): string {
  if (percent < 50 || percent > 95) return "bg-amber-400";
  if (percent >= 60 && percent <= 90) return "bg-green-500";
  return "bg-blue-400";
}

function isDistributionResult(v: unknown): v is DistributionResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.meta &&
    Array.isArray(o.sections) &&
    !!o.unused &&
    !!o.stats &&
    Array.isArray(o.warnings)
  );
}

export function DistributeOutput({ value }: { value: unknown }) {
  if (!isDistributionResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <DistributeRenderer output={value} />;
}

function DistributeRenderer({ output }: { output: DistributionResult }) {
  const { meta, sections, unused, stats, warnings } = output;
  const coverage = stats.coverage;

  const hasUnused =
    unused.entityIds.length > 0 ||
    unused.factIds.length > 0 ||
    unused.relationshipIds.length > 0 ||
    unused.ideationIds.length > 0 ||
    unused.measurableIds.length > 0;

  return (
    <div className="space-y-4">
      {/* Meta header */}
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language:{" "}
          {meta.language}
        </div>
        <div className="mt-1 text-lg font-semibold"># {meta.h1Title}</div>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span>primary intent:</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${intentColors[meta.primaryIntent] ?? ""}`}
          >
            {meta.primaryIntent}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          model: {meta.model}
        </div>
      </header>

      {/* Coverage stats */}
      <section className="rounded border bg-slate-50 p-3">
        <div className="mb-2 text-sm font-medium">Pokrycie KG</div>
        <OverallBar percent={coverage.overallPercent} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniBar label="Encje" block={coverage.entities} />
          <MiniBar label="Fakty" block={coverage.facts} />
          <MiniBar label="Relacje" block={coverage.relationships} />
          <MiniBar label="Pomysły" block={coverage.ideations} />
          <MiniBar label="Mierzalne" block={coverage.measurables} />
        </div>
      </section>

      {/* Section accordion */}
      <section>
        <div className="mb-1 text-sm font-medium">
          Sekcje ({sections.length})
        </div>
        <div className="space-y-1">
          {sections.map((s) => (
            <SectionAccordion key={s.order} s={s} />
          ))}
        </div>
      </section>

      {/* Unused panel */}
      {hasUnused && (
        <details className="rounded border bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Nieużyte elementy KG
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {unused.entityIds.length > 0 && (
              <div>
                <span className="font-medium">Encje ({unused.entityIds.length}):</span>{" "}
                <span className="font-mono text-muted-foreground">
                  {unused.entityIds.join(", ")}
                </span>
              </div>
            )}
            {unused.factIds.length > 0 && (
              <div>
                <span className="font-medium">Fakty ({unused.factIds.length}):</span>{" "}
                <span className="font-mono text-muted-foreground">
                  {unused.factIds.join(", ")}
                </span>
              </div>
            )}
            {unused.relationshipIds.length > 0 && (
              <div>
                <span className="font-medium">
                  Relacje ({unused.relationshipIds.length}):
                </span>{" "}
                <span className="font-mono text-muted-foreground">
                  {unused.relationshipIds.join(", ")}
                </span>
              </div>
            )}
            {unused.ideationIds.length > 0 && (
              <div>
                <span className="font-medium">
                  Pomysły ({unused.ideationIds.length}):
                </span>{" "}
                <span className="font-mono text-muted-foreground">
                  {unused.ideationIds.join(", ")}
                </span>
              </div>
            )}
            {unused.measurableIds.length > 0 && (
              <div>
                <span className="font-medium">
                  Mierzalne ({unused.measurableIds.length}):
                </span>{" "}
                <span className="font-mono text-muted-foreground">
                  {unused.measurableIds.join(", ")}
                </span>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Warnings panel */}
      {warnings.length > 0 && (
        <details className="rounded border border-amber-300 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            ⚠️ {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.kind}</span>: {w.message}
                {Object.keys(w.context).length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    ({JSON.stringify(w.context)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Raw JSON */}
      <details className="rounded border bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
        <pre className="mt-2 overflow-auto text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function OverallBar({ percent }: { percent: number }) {
  const color = coverageColor(percent);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">Łącznie</span>
        <span className="font-medium">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div
          className={`h-2.5 rounded-full ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MiniBar({ label, block }: { label: string; block: CoverageBlock }) {
  const color = coverageColor(block.percent);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {block.used}/{block.total}{" "}
          <span className="text-muted-foreground">({block.percent.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(block.percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function sectionCounters(s: SectionWithKG): string {
  const parts: string[] = [];
  if (s.entities.length) parts.push(`${s.entities.length} ent`);
  if (s.facts.length) parts.push(`${s.facts.length} facts`);
  if (s.relationships.length) parts.push(`${s.relationships.length} rel`);
  if (s.ideations.length) parts.push(`${s.ideations.length} ide`);
  if (s.measurables.length) parts.push(`${s.measurables.length} meas`);
  return parts.length ? `[${parts.join(" · ")}]` : "";
}

function SectionAccordion({ s }: { s: SectionWithKG }) {
  const counters = sectionCounters(s);

  if (s.type === "intro") {
    return <IntroSectionAccordion s={s} counters={counters} />;
  }
  if (s.sectionVariant === "full") {
    return <FullSectionAccordion s={s} counters={counters} />;
  }
  return <ContextSectionAccordion s={s} counters={counters} />;
}

function KGItems({ s }: { s: SectionWithKG }) {
  return (
    <div className="mt-2 space-y-2">
      {s.entities.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Encje</div>
          <div className="flex flex-wrap gap-1">
            {s.entities.map((e) => (
              <span
                key={e.id}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
                title={e.evidence}
              >
                {e.entity}{" "}
                <span className="text-muted-foreground">({e.domainType})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {s.facts.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Fakty</div>
          <ul className="space-y-0.5 text-xs">
            {s.facts.map((f) => (
              <li key={f.id} className="flex gap-1.5">
                <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-muted-foreground">
                  {f.category}
                </span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.relationships.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Relacje</div>
          <ul className="space-y-0.5 text-xs font-mono">
            {s.relationships.map((r) => (
              <li key={r.id}>
                {r.sourceName} →{" "}
                <span className="text-muted-foreground">({r.type})</span> →{" "}
                {r.targetName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.ideations.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Pomysły</div>
          <div className="flex flex-wrap gap-1">
            {s.ideations.map((i) => (
              <span
                key={i.id}
                className="rounded border px-1.5 py-0.5 text-xs"
                title={i.description}
              >
                <span className="rounded bg-muted px-1 py-0.5 text-muted-foreground">
                  {i.type}
                </span>{" "}
                {i.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {s.measurables.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Mierzalne</div>
          <ul className="space-y-0.5">
            {s.measurables.map((m) => (
              <li key={m.id} className="font-mono text-xs">
                {m.formatted}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IntroSectionAccordion({
  s,
  counters,
}: {
  s: IntroSectionWithKG;
  counters: string;
}) {
  return (
    <details className="rounded border p-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-mono text-muted-foreground">📖 {s.order}.</span>{" "}
        <em>Intro</em>{" "}
        {counters && (
          <span className="text-xs text-muted-foreground">{counters}</span>
        )}
      </summary>
      <div className="ml-4 mt-2">
        <KGItems s={s} />
      </div>
    </details>
  );
}

function FullSectionAccordion({
  s,
  counters,
}: {
  s: FullSectionWithKG;
  counters: string;
}) {
  return (
    <details className="rounded border p-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-mono text-muted-foreground">📌 {s.order}.</span>{" "}
        <span className="font-medium">{s.header}</span>{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">full</span>{" "}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${intentColors[s.sourceIntent] ?? ""}`}
        >
          {s.sourceIntent}
        </span>{" "}
        {counters && (
          <span className="text-xs text-muted-foreground">{counters}</span>
        )}
      </summary>
      <div className="ml-4 mt-2">
        {s.h3s.length > 0 && (
          <ul className="space-y-1">
            {s.h3s.map((h, i) => (
              <li key={i} className="text-xs">
                <span>{h.format === "question" ? "❓" : "📝"}</span> {h.header}
              </li>
            ))}
          </ul>
        )}
        <KGItems s={s} />
      </div>
    </details>
  );
}

function ContextSectionAccordion({
  s,
  counters,
}: {
  s: ContextSectionWithKG;
  counters: string;
}) {
  return (
    <details className="rounded border p-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-mono text-muted-foreground">📋 {s.order}.</span>{" "}
        <span className="font-medium">{s.header}</span>{" "}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">context</span>{" "}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${intentColors[s.sourceIntent] ?? ""}`}
        >
          {s.sourceIntent}
        </span>{" "}
        {counters && (
          <span className="text-xs text-muted-foreground">{counters}</span>
        )}
      </summary>
      <div className="ml-4 mt-2">
        <p className="text-xs italic text-muted-foreground">💬 {s.contextNote}</p>
        <KGItems s={s} />
      </div>
    </details>
  );
}
