import { domainOf, EmptyOutput, Metric } from "./shared";

type SerpItem = { title: string; url: string; description: string; position: number };

function isSerp(v: unknown): v is { items: SerpItem[] } {
  if (!v || typeof v !== "object") return false;
  return Array.isArray((v as { items?: unknown }).items);
}

export function SerpOutput({ value }: { value: unknown }) {
  if (!isSerp(value)) return <EmptyOutput />;
  const items = value.items;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Brak wyników SERP.</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Wyników" value={items.length} />
      </div>
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
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
