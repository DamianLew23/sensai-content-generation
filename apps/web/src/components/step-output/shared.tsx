export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

export function formatBytes(chars: number): string {
  if (chars < 1000) return `${chars} zn.`;
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}k zn.`;
  return `${(chars / 1_000_000).toFixed(2)}M zn.`;
}

export function EmptyOutput() {
  return <p className="text-sm text-muted-foreground">Brak outputu.</p>;
}
