export function JsonFallback({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
