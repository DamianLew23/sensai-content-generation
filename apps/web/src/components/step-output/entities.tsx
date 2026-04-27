"use client";
import { useState } from "react";
import { EmptyOutput, Metric } from "./shared";

type EntityType = "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
type RelationType =
  | "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO"
  | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";

type Entity = {
  id: string;
  originalSurface: string;
  entity: string;
  domainType: EntityType;
  evidence: string;
};

type EntityRelation = {
  source: string;
  target: string;
  type: RelationType;
  description: string;
  evidence: string;
};

type RelationToMain = {
  entityId: string;
  score: number;
  rationale: string;
};

type ExtractionShape = {
  metadata: {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
  };
  contextAnalysis: {
    mainTopicInterpretation: string;
    domainSummary: string;
    notes: string;
  };
  entities: Entity[];
  relationships: EntityRelation[];
  relationToMain: RelationToMain[];
};

function isExtraction(v: unknown): v is ExtractionShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.metadata &&
    !!o.contextAnalysis &&
    Array.isArray(o.entities) &&
    Array.isArray(o.relationships) &&
    Array.isArray(o.relationToMain)
  );
}

const ENTITY_TYPE_PL: Record<EntityType, string> = {
  PERSON: "osoba",
  ORGANIZATION: "organizacja",
  LOCATION: "lokalizacja",
  PRODUCT: "produkt",
  CONCEPT: "koncept",
  EVENT: "wydarzenie",
};

const ENTITY_TYPE_BADGE: Record<EntityType, string> = {
  PERSON: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ORGANIZATION: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  LOCATION: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  PRODUCT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  CONCEPT: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  EVENT: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
};

type Tab = "entities" | "relations" | "relevance";

export function EntitiesOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("entities");

  if (!isExtraction(value)) return <EmptyOutput />;
  const { metadata, contextAnalysis, entities, relationships, relationToMain } = value;

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const orphanRelations = relationships.filter(
    (r) => !entityById.has(r.source) || !entityById.has(r.target),
  );
  const sortedRelevance = [...relationToMain].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Encje" value={entities.length} />
        <Metric label="Relacje" value={relationships.length} />
        <Metric label="Istotność" value={relationToMain.length} />
        <Metric label="Źródła" value={metadata.sourceUrlCount} />
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs">
        <div className="font-medium">Kontekst</div>
        <p className="mt-1 text-muted-foreground">{contextAnalysis.mainTopicInterpretation}</p>
        <p className="mt-1 text-muted-foreground">{contextAnalysis.domainSummary}</p>
        {contextAnalysis.notes && (
          <p className="mt-1 italic text-muted-foreground">{contextAnalysis.notes}</p>
        )}
      </div>

      <div role="tablist" className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <TabBtn active={tab === "entities"} onClick={() => setTab("entities")}>
          Encje ({entities.length})
        </TabBtn>
        <TabBtn active={tab === "relations"} onClick={() => setTab("relations")}>
          Relacje ({relationships.length})
        </TabBtn>
        <TabBtn active={tab === "relevance"} onClick={() => setTab("relevance")}>
          Istotność ({relationToMain.length})
        </TabBtn>
      </div>

      {tab === "entities" && (
        <ul className="space-y-2">
          {entities.map((e) => (
            <li key={e.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${ENTITY_TYPE_BADGE[e.domainType]}`}>
                  {ENTITY_TYPE_PL[e.domainType]}
                </span>
                {e.originalSurface !== e.entity && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    surface: {e.originalSurface}
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm font-medium">{e.entity}</div>
              <p className="mt-1 text-xs italic text-muted-foreground">„{e.evidence}”</p>
            </li>
          ))}
        </ul>
      )}

      {tab === "relations" && (
        <>
          {orphanRelations.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Uwaga: {orphanRelations.length} relacji odwołuje się do nieistniejących encji.
            </div>
          )}
          <ul className="space-y-2">
            {relationships.map((r, idx) => {
              const src = entityById.get(r.source);
              const tgt = entityById.get(r.target);
              return (
                <li key={`${r.source}-${r.type}-${r.target}-${idx}`} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{src?.entity ?? r.source}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {r.type}
                    </span>
                    <span className="font-medium">{tgt?.entity ?? r.target}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs italic text-muted-foreground">„{r.evidence}”</p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === "relevance" && (
        <ul className="space-y-2">
          {sortedRelevance.map((r) => {
            const ent = entityById.get(r.entityId);
            return (
              <li key={r.entityId} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[10px] text-muted-foreground">{r.entityId}</span>
                  <span className="font-medium">{ent?.entity ?? r.entityId}</span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {r.score}/100
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-sm bg-background px-2.5 py-1 font-medium shadow-sm"
          : "rounded-sm px-2.5 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
