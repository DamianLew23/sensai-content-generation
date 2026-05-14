"use client";
import type { ArticleHumanizeResult } from "@sensai/shared";
import { DownloadMarkdownButton } from "./download-markdown-button";

function isHumanizeResult(v: unknown): v is ArticleHumanizeResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    !!o.stats &&
    !!o.protection
  );
}

export function ArticleHumanizeOutput({ value }: { value: unknown }) {
  if (!isHumanizeResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <ArticleHumanizeRenderer output={value} />;
}

function ArticleHumanizeRenderer({ output }: { output: ArticleHumanizeResult }) {
  const { meta, htmlContent, stats, protection, warnings } = output;
  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    strong{color:#0f172a}
    blockquote{border-left:3px solid #cbd5e1;margin:1em 0;padding:.5em 1em;color:#475569;background:#f8fafc}
    i,em{color:#334155}
  </style></head><body>${htmlContent}</body></html>`;

  const ratioPct = `${((stats.ratio - 1) * 100).toFixed(1)}%`;
  const r = stats.readability;
  const s = stats.sentence;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model} · promptVersion: {meta.promptVersion}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.inputLength} → {stats.outputLength} chars (ratio {stats.ratio.toFixed(3)} · Δ{ratioPct}) · źródła: {stats.sourcesBefore} → {stats.sourcesAfter} ·
          {" "}spans missing: {protection.spansMissing} · ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          ASL: {r.avgSentenceLength} · long&gt;cap: {r.longSentencesGtCap} · strong: {r.strongSpans} · bold share: {r.boldShare.toFixed(4)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          rytm: CV {s.cvOutput.toFixed(3)} · zakres {s.minLength}–{s.maxLength} · avg {s.avgLength} · variance {s.varianceInput.toFixed(2)} → {s.varianceOutput.toFixed(2)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          retry: used={String(stats.retryUsed)} · accepted={String(stats.retryAccepted)} · em-dashes replaced: {stats.emDashesReplaced}
        </div>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Artykuł zhumanizowany (20 reguł anty-AI)</div>
          <DownloadMarkdownButton htmlContent={htmlContent} filenameBase={meta.keyword} />
        </div>
        <iframe
          title="Humanize preview"
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
