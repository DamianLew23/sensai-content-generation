"use client";
import type { DraftGenerationResult } from "@sensai/shared";

function isDraftResult(v: unknown): v is DraftGenerationResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    Array.isArray(o.blocks) &&
    Array.isArray(o.imagePrompts)
  );
}

export function DraftOutput({ value }: { value: unknown }) {
  if (!isDraftResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <DraftRenderer output={value} />;
}

function DraftRenderer({ output }: { output: DraftGenerationResult }) {
  const { meta, htmlContent, blocks, imagePrompts, stats, warnings } = output;

  // Inline a tiny stylesheet so the iframe preview looks readable.
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

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model}
        </div>
        <div className="mt-1 text-lg font-semibold">{meta.h1Title}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.blockCount} bloków · {stats.totalChars} znaków · {stats.totalLatencyMs} ms ·
          ${stats.totalCostUsd} · {stats.imagePromptCount} infografik
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Podgląd HTML</div>
        <iframe
          title="Draft preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold">Bloki ({blocks.length})</div>
        <div className="space-y-1">
          {blocks.map((b) => (
            <div key={`${b.sectionOrder}-${b.responseId}`} className="rounded border bg-white p-2 text-xs">
              <div className="font-mono">
                #{b.sectionOrder} [{b.sectionType}{b.sectionVariant ? `/${b.sectionVariant}` : ""}|{b.passageTrigger}]{" "}
                {b.header ?? "Intro"}
              </div>
              <div className="text-muted-foreground">
                {b.charCount} chars · {b.promptTokens}+{b.completionTokens} tok · ${b.costUsd} · {b.latencyMs}ms · resp:{b.responseId.slice(0, 12)}…
              </div>
            </div>
          ))}
        </div>
      </section>

      {imagePrompts.length > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold">Prompty infografik ({imagePrompts.length})</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {imagePrompts.map((p, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-muted-foreground">[{p.ideationType}]</span> {p.sectionHeader}: {p.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{w.kind}</span>
                {w.blockOrder !== undefined ? ` (block ${w.blockOrder})` : ""}: {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
