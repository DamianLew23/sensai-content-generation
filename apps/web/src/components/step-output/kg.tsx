"use client";
import { useState } from "react";
import { EmptyOutput, Metric } from "./shared";

type KGShape = {
  meta: {
    mainKeyword: string;
    mainEntity: string;
    category: string;
    language: string;
    generatedAt: string;
    counts: {
      entities: number;
      relationships: number;
      facts: number;
      measurables: number;
      ideations: number;
    };
  };
  entities: Array<{ id: string; entity: string; domainType: string; evidence: string }>;
  relationships: Array<{
    source: string;
    target: string;
    sourceName: string;
    targetName: string;
    type: string;
    description: string;
  }>;
  facts: Array<{ id: string; text: string }>;
  measurables: Array<{ id: string; formatted: string }>;
  ideations: Array<{ id: string; title: string; description: string }>;
  warnings: Array<{ kind: string; message: string }>;
};

function isKG(v: unknown): v is KGShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.meta &&
    Array.isArray(o.entities) &&
    Array.isArray(o.relationships) &&
    Array.isArray(o.facts) &&
    Array.isArray(o.measurables) &&
    Array.isArray(o.ideations) &&
    Array.isArray(o.warnings)
  );
}

type Tab = "entities" | "relations" | "rest";

export function KGOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("entities");
  if (!isKG(value)) return <EmptyOutput />;
  const kg = value;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Metric label="Encje" value={kg.meta.counts.entities} />
        <Metric label="Relacje" value={kg.meta.counts.relationships} />
        <Metric label="Fakty" value={kg.meta.counts.facts} />
        <Metric label="Dane" value={kg.meta.counts.measurables} />
        <Metric label="Pomysły" value={kg.meta.counts.ideations} />
      </div>

      <div className="text-sm text-muted-foreground">
        <div>
          <span className="font-medium">Główna encja:</span> {kg.meta.mainEntity || "—"}
        </div>
        <div>
          <span className="font-medium">Język:</span> {kg.meta.language}
        </div>
      </div>

      {kg.warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <div className="font-medium">Ostrzeżenia ({kg.warnings.length}):</div>
          <ul className="ml-4 list-disc">
            {kg.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.kind}</span>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {(["entities", "relations", "rest"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-sm ${tab === t ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
          >
            {t === "entities" ? "Encje" : t === "relations" ? "Relacje" : "Pozostałe"}
          </button>
        ))}
      </div>

      {tab === "entities" && (
        <ul className="space-y-1 text-sm">
          {kg.entities.map((e) => (
            <li key={e.id} className="rounded border p-2">
              <div className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                <span className="font-medium">{e.entity}</span>
                <span className="rounded bg-muted px-1 text-xs">{e.domainType}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{e.evidence}</div>
            </li>
          ))}
        </ul>
      )}

      {tab === "relations" && (
        <ul className="space-y-1 text-sm">
          {kg.relationships.map((r, i) => (
            <li key={i} className="rounded border p-2">
              <div className="font-mono text-xs">
                {r.sourceName} —[{r.type}]→ {r.targetName}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
            </li>
          ))}
        </ul>
      )}

      {tab === "rest" && (
        <div className="space-y-3 text-sm">
          <section>
            <h4 className="mb-1 font-medium">Fakty ({kg.facts.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.facts.map((f) => (
                <li key={f.id}>
                  <span className="font-mono text-xs text-muted-foreground">{f.id}</span> {f.text}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Dane mierzalne ({kg.measurables.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.measurables.map((m) => (
                <li key={m.id}>
                  <span className="font-mono text-xs text-muted-foreground">{m.id}</span> {m.formatted}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Pomysły ({kg.ideations.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.ideations.map((i) => (
                <li key={i.id}>
                  <span className="font-mono text-xs text-muted-foreground">{i.id}</span>{" "}
                  <span className="font-medium">{i.title}</span> — {i.description}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
