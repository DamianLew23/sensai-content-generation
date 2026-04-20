"use client";
import Link from "next/link";
import { useRuns } from "@/lib/hooks";

export default function HomePage() {
  const { data, isLoading, error } = useRuns();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sens.ai Content Generation</h1>
        <Link
          href="/runs/new"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          + Nowy run
        </Link>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Ostatnie runy</h2>
        {isLoading && <p>Ładowanie…</p>}
        {error && <p className="text-red-500">Błąd: {String(error)}</p>}
        {data && data.length === 0 && (
          <p className="text-muted-foreground">Brak runów. Uruchom pierwszy.</p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="block rounded border px-3 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                    <span className="text-sm">{r.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
