"use client";
import { useState } from "react";
import { EmptyOutput, Metric } from "./shared";

type IntentName =
  | "Definicyjna"
  | "Problemowa"
  | "Instrukcyjna"
  | "Decyzyjna"
  | "Diagnostyczna"
  | "Porównawcza";

type Classification = "MICRO" | "MACRO";

type Area = {
  id: string;
  topic: string;
  question: string;
  ymyl: boolean;
  classification: Classification;
  evergreenTopic: string;
  evergreenQuestion: string;
};

type Intent = { name: IntentName; areas: Area[] };

type Mapping = { areaId: string; question: string };

type FanOutShape = {
  metadata: {
    keyword: string;
    language: string;
    paaFetched: number;
    paaUsed: boolean;
    createdAt: string;
  };
  normalization: {
    mainEntity: string;
    category: string;
    ymylRisk: boolean;
  };
  intents: Intent[];
  dominantIntent: IntentName;
  paaMapping: Mapping[];
  unmatchedPaa: string[];
};

function isFanOut(v: unknown): v is FanOutShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.metadata &&
    !!o.normalization &&
    Array.isArray(o.intents) &&
    typeof o.dominantIntent === "string" &&
    Array.isArray(o.paaMapping) &&
    Array.isArray(o.unmatchedPaa)
  );
}

const INTENT_BADGE: Record<IntentName, string> = {
  Definicyjna: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  Problemowa: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  Instrukcyjna: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Decyzyjna: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Diagnostyczna: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  Porównawcza: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
};

type Tab = "intents" | "scope" | "paa";

export function QueryFanOutOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("intents");

  if (!isFanOut(value)) return <EmptyOutput />;
  const { metadata, normalization, intents, dominantIntent, paaMapping, unmatchedPaa } = value;

  const totalAreas = intents.reduce((acc, i) => acc + i.areas.length, 0);
  const microCount = intents
    .flatMap((i) => i.areas)
    .filter((a) => a.classification === "MICRO").length;
  const macroCount = totalAreas - microCount;

  const dominant = intents.find((i) => i.name === dominantIntent);
  const microAreasByIntent = intents
    .map((i) => ({
      name: i.name,
      areas: i.areas.filter((a) => a.classification === "MICRO"),
    }))
    .filter((i) => i.areas.length > 0);
  const macroAreas = intents.flatMap((i) =>
    i.areas
      .filter((a) => a.classification === "MACRO")
      .map((a) => ({ ...a, intentName: i.name })),
  );

  const paaByArea = new Map<string, string[]>();
  for (const m of paaMapping) {
    const arr = paaByArea.get(m.areaId) ?? [];
    arr.push(m.question);
    paaByArea.set(m.areaId, arr);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Intencje" value={intents.length} />
        <Metric label="Obszary" value={totalAreas} />
        <Metric label="MICRO / MACRO" value={`${microCount} / ${macroCount}`} />
        <Metric
          label="PAA"
          value={metadata.paaUsed ? `${paaMapping.length} / ${metadata.paaFetched}` : "—"}
        />
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Główna encja:</span>
          <span>{normalization.mainEntity}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {normalization.category}
          </span>
          {normalization.ymylRisk && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200">
              YMYL
            </span>
          )}
          <span className="ml-auto text-muted-foreground">
            Intencja dominująca:{" "}
            <span
              className={`ml-1 rounded px-1.5 py-0.5 font-medium ${INTENT_BADGE[dominantIntent]}`}
            >
              {dominantIntent}
            </span>
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">„{metadata.keyword}”</p>
      </div>

      <div role="tablist" className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <TabBtn active={tab === "intents"} onClick={() => setTab("intents")}>
          Intencje + obszary ({totalAreas})
        </TabBtn>
        <TabBtn active={tab === "scope"} onClick={() => setTab("scope")}>
          Mikro vs Makro ({microCount} / {macroCount})
        </TabBtn>
        <TabBtn active={tab === "paa"} onClick={() => setTab("paa")}>
          PAA ({metadata.paaUsed ? `${paaMapping.length}/${metadata.paaFetched}` : "—"})
        </TabBtn>
      </div>

      {tab === "intents" && (
        <ul className="space-y-3">
          {intents.map((intent) => (
            <li
              key={intent.name}
              className={`rounded-lg border bg-card p-3 ${
                intent.name === dominantIntent ? "ring-2 ring-emerald-300 dark:ring-emerald-700" : ""
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${INTENT_BADGE[intent.name]}`}
                >
                  {intent.name}
                </span>
                {intent.name === dominantIntent && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    GŁÓWNA
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {intent.areas.length} obszarów
                </span>
              </div>
              <ul className="space-y-2">
                {intent.areas.map((area) => (
                  <li key={area.id} className="rounded-md border bg-muted/20 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {area.id}
                      </span>
                      <span className="font-medium">{area.topic}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          area.classification === "MICRO"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        }`}
                      >
                        {area.classification}
                      </span>
                      {area.ymyl && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                          YMYL
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground">{area.question}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {tab === "scope" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Artykuł główny
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Intencja dominująca:{" "}
              <span className={`rounded px-1.5 py-0.5 font-medium ${INTENT_BADGE[dominantIntent]}`}>
                {dominantIntent}
              </span>
            </p>
            {microAreasByIntent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak obszarów MICRO.</p>
            ) : (
              <ul className="space-y-3">
                {microAreasByIntent.map((group) => (
                  <li key={group.name}>
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                      {group.name}
                    </div>
                    <ul className="space-y-1.5">
                      {group.areas.map((a) => (
                        <li key={a.id} className="rounded-md border bg-muted/20 p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {a.id}
                            </span>
                            <span className="font-medium">{a.topic}</span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">{a.question}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Backlog evergreen ({macroAreas.length})
            </h3>
            {macroAreas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak propozycji osobnych artykułów.</p>
            ) : (
              <ul className="space-y-1.5">
                {macroAreas.map((a) => (
                  <li key={a.id} className="rounded-md border bg-muted/20 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                      <span className="font-medium">{a.evergreenTopic || a.topic}</span>
                      <span
                        className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${INTENT_BADGE[a.intentName]}`}
                      >
                        {a.intentName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {a.evergreenQuestion || a.question}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "paa" && (
        <>
          {!metadata.paaUsed ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Pobieranie PAA było wyłączone (`QUERY_FANOUT_PAA_ENABLED=false`) lub Google nie zwrócił żadnych pytań.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border bg-card p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Przypisane PAA ({paaMapping.length})
                </h3>
                {paaMapping.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Żadne pytanie PAA nie pasowało do obszarów.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {Array.from(paaByArea.entries()).map(([areaId, qs]) => {
                      const area = intents
                        .flatMap((i) => i.areas)
                        .find((a) => a.id === areaId);
                      return (
                        <li key={areaId} className="rounded-md border bg-muted/20 p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {areaId}
                            </span>
                            <span className="font-medium">{area?.topic ?? areaId}</span>
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {qs.map((q) => (
                              <li key={`${areaId}-${q.slice(0, 48)}`} className="text-muted-foreground">
                                • {q}
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border bg-card p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Niepasujące PAA ({unmatchedPaa.length})
                </h3>
                {unmatchedPaa.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Wszystkie PAA zostały przypisane.</p>
                ) : (
                  <ul className="space-y-1">
                    {unmatchedPaa.map((q) => (
                      <li key={q.slice(0, 64)} className="text-xs text-muted-foreground">
                        • {q}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
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
