"use client";
import type { DataEnrichmentResult } from "@sensai/shared";

function isEnrichResult(v: unknown): v is DataEnrichmentResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    Array.isArray(o.claims) &&
    Array.isArray(o.verifications)
  );
}

export function DataEnrichOutput({ value }: { value: unknown }) {
  if (!isEnrichResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <DataEnrichRenderer output={value} />;
}

function DataEnrichRenderer({ output }: { output: DataEnrichmentResult }) {
  const { meta, htmlContent, claims, verifications, stats, warnings } = output;

  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    table{border-collapse:collapse;width:100%;margin:1em 0}
    th,td{border:1px solid #cbd5e1;padding:.5em .75em;text-align:left}
    th{background:#f1f5f9}
    ul{padding-left:1.25em}
  </style></head><body>${htmlContent}</body></html>`;

  const verMap = new Map(verifications.map((v) => [v.claimId, v]));

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · verify: {meta.verifyModel} · question: {meta.questionModel}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.totalClaimsFound} claims · {stats.sourcesAdded} potwierdzonych ·
          {" "}{stats.correctionsFlagged} korekt · {stats.unverified} bez źródła ·
          ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Wzbogacony HTML</div>
        <iframe
          title="Enriched preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold">Claims ({claims.length})</div>
        <div className="space-y-1">
          {claims.map((c) => {
            const v = verMap.get(c.id);
            const statusIcon =
              v?.status === "confirmed" ? "✓" :
              v?.status === "corrected" ? "⚠" : "❓";
            const statusClass =
              v?.status === "confirmed" ? "text-emerald-700" :
              v?.status === "corrected" ? "text-amber-700" : "text-slate-500";
            return (
              <div key={c.id} className="rounded border bg-white p-2 text-xs">
                <div className="font-mono">
                  <span className={statusClass}>{statusIcon}</span>
                  {" "}#{c.id} (score={c.score}, {c.claimTypes.join(", ")}) · {c.h2Context} · &lt;{c.tagName}&gt;
                </div>
                <div className="mt-1">{c.claimText}</div>
                {c.question && (
                  <div className="mt-1 text-muted-foreground">Q: {c.question}</div>
                )}
                {v && v.status !== "unverified" && (
                  <div className="mt-1 text-emerald-700">
                    {v.source}{v.sourceUrl ? ` — ${v.sourceUrl.replace(/^https?:\/\//, "")}` : ""}
                  </div>
                )}
                {v?.correctedValue && (
                  <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900">
                    Korekta: {v.correctedValue} {v.note ? `· ${v.note}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{w.kind}</span>: {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
