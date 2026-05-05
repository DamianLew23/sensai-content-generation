"use client";
import type { ArticleOptimizeResult } from "@sensai/shared";

function isOptimizeResult(v: unknown): v is ArticleOptimizeResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    !!o.stats &&
    !!o.protection
  );
}

export function ArticleOptimizeOutput({ value }: { value: unknown }) {
  if (!isOptimizeResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <ArticleOptimizeRenderer output={value} />;
}

function ArticleOptimizeRenderer({ output }: { output: ArticleOptimizeResult }) {
  const { meta, htmlContent, stats, protection, warnings } = output;
  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    strong{color:#0f172a}
    blockquote{border-left:3px solid #cbd5e1;margin:1em 0;padding:.5em 1em;color:#475569;background:#f8fafc}
  </style></head><body>${htmlContent}</body></html>`;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model} · promptVersion: {meta.promptVersion}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.inputLength} → {stats.outputLength} chars · źródła: {stats.sourcesBefore} → {stats.sourcesAfter} ·
          {" "}anchors removed: {stats.anchorsRemoved} · spans missing: {protection.spansMissing} · ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Zoptymalizowany HTML</div>
        <iframe
          title="Optimize preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}><span className="font-mono text-xs">{w.kind}</span>: {w.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
