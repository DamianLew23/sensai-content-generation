import { domainOf, EmptyOutput, Metric } from "./shared";

type SerpItem = {
  title: string;
  url: string;
  description: string;
  position: number;
  fusedScore?: number;
  sourceQueries?: string[];
};

type SerpValue = { items: SerpItem[]; queries?: string[] };

function isSerp(v: unknown): v is SerpValue {
  if (!v || typeof v !== "object") return false;
  return Array.isArray((v as { items?: unknown }).items);
}

export function SerpOutput({ value }: { value: unknown }) {
  if (!isSerp(value)) return <EmptyOutput />;
  const { items, queries } = value;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Brak wyników SERP.</p>;

  const fusedAvg =
    items.reduce((acc, it) => acc + (it.fusedScore ?? 0), 0) / items.length;
  const isMultiQuery = (queries?.length ?? 0) > 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Wyników" value={items.length} />
        {queries && <Metric label="Zapytań" value={queries.length} />}
        {isMultiQuery && (
          <Metric label="Śr. RRF score" value={fusedAvg.toFixed(4)} />
        )}
      </div>

      {queries && queries.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Pobrane zapytania
          </div>
          <ul className="flex flex-wrap gap-1">
            {queries.map((q) => (
              <li
                key={q}
                className="rounded bg-background px-2 py-0.5 font-mono text-xs"
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-2">
        {items.map((item) => (
          <li key={`${item.position}-${item.url}`} className="rounded-lg border bg-card p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                #{item.position}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                  title={item.url}
                >
                  {item.title || item.url}
                </a>
                <div className="text-xs text-muted-foreground">{domainOf(item.url)}</div>
                {item.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                )}
                {item.sourceQueries && item.sourceQueries.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Z zapytań:
                    </span>
                    {item.sourceQueries.map((q) => (
                      <span
                        key={q}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {q}
                      </span>
                    ))}
                    {typeof item.fusedScore === "number" && (
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        score {item.fusedScore.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
