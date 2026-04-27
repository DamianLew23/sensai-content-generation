"use client";
import { useState } from "react";
import { domainOf, EmptyOutput, Metric } from "./shared";

type FactCategory = "definition" | "causal" | "general";
type Priority = "high" | "medium" | "low";
type IdeationType = "checklist" | "mini_course" | "info_box" | "habit";

type Fact = {
  id: string;
  text: string;
  category: FactCategory;
  priority: Priority;
  confidence: number;
  sourceUrls: string[];
};

type DataPoint = {
  id: string;
  definition: string;
  value: string;
  unit: string | null;
  sourceUrls: string[];
};

type Ideation = {
  id: string;
  type: IdeationType;
  title: string;
  description: string;
  audience: string;
  channels: string[];
  keywords: string[];
  priority: Priority;
};

type ExtractionResultShape = {
  metadata: {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
  };
  facts: Fact[];
  data: DataPoint[];
  ideations: Ideation[];
};

function isExtraction(v: unknown): v is ExtractionResultShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.metadata &&
    Array.isArray(o.facts) &&
    Array.isArray(o.data) &&
    Array.isArray(o.ideations)
  );
}

const CATEGORY_PL: Record<FactCategory, string> = {
  definition: "definicja",
  causal: "przyczynowo-skutkowy",
  general: "ogólny",
};

const IDEATION_PL: Record<IdeationType, string> = {
  checklist: "checklista",
  mini_course: "mini-kurs",
  info_box: "ramka info",
  habit: "nawyk",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-muted text-muted-foreground",
};

type Tab = "facts" | "data" | "ideations";

export function ExtractionOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("facts");

  if (!isExtraction(value)) return <EmptyOutput />;
  const { metadata, facts, data, ideations } = value;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Fakty" value={facts.length} />
        <Metric label="Dane" value={data.length} />
        <Metric label="Pomysły" value={ideations.length} />
        <Metric label="Źródła" value={metadata.sourceUrlCount} />
      </div>

      <div role="tablist" className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <TabBtn active={tab === "facts"} onClick={() => setTab("facts")}>
          Fakty ({facts.length})
        </TabBtn>
        <TabBtn active={tab === "data"} onClick={() => setTab("data")}>
          Dane ({data.length})
        </TabBtn>
        <TabBtn active={tab === "ideations"} onClick={() => setTab("ideations")}>
          Pomysły ({ideations.length})
        </TabBtn>
      </div>

      {tab === "facts" && (
        <ul className="space-y-2">
          {facts.map((f) => (
            <li key={f.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{f.id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {CATEGORY_PL[f.category]}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_BADGE[f.priority]}`}>
                  {f.priority}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  confidence: {f.confidence.toFixed(2)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{f.text}</p>
              {f.sourceUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                  {f.sourceUrls.map((u) => (
                    <a
                      key={u}
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border bg-muted/30 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {domainOf(u)}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "data" && (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-[10px] text-muted-foreground">{d.id}</span>
                <span className="flex-1">{d.definition}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold">{d.value}</span>
                {d.unit && <span className="text-sm text-muted-foreground">{d.unit}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "ideations" && (
        <ul className="space-y-2">
          {ideations.map((i) => (
            <li key={i.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{i.id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {IDEATION_PL[i.type]}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_BADGE[i.priority]}`}>
                  {i.priority}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{i.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>
              {(i.audience || i.channels.length > 0 || i.keywords.length > 0) && (
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                  {i.audience && (
                    <div>
                      <span className="font-medium">Odbiorca:</span> {i.audience}
                    </div>
                  )}
                  {i.channels.length > 0 && (
                    <div>
                      <span className="font-medium">Kanały:</span> {i.channels.join(", ")}
                    </div>
                  )}
                  {i.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {i.keywords.map((k) => (
                        <span key={k} className="rounded bg-muted px-1.5 py-0.5">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
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
