"use client";
import { useState } from "react";
import { domainOf, EmptyOutput, formatBytes, Metric } from "./shared";
import { MarkdownBody } from "./deep-research";

type ScrapePage = {
  url: string;
  title: string;
  markdown: string;
  rawLength: number;
  truncated: boolean;
  source: "crawl4ai" | "firecrawl";
  fetchedAt: string;
};

type ScrapeFailure = {
  url: string;
  reason: string;
  httpStatus?: number;
};

type ScrapeResult = { pages: ScrapePage[]; failures: ScrapeFailure[] };

function isScrape(v: unknown): v is ScrapeResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.pages) && Array.isArray(o.failures);
}

export function ScrapeOutput({ value }: { value: unknown }) {
  if (!isScrape(value)) return <EmptyOutput />;
  const { pages, failures } = value;
  const totalChars = pages.reduce((sum, p) => sum + (p.markdown?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Stron" value={pages.length} />
        <Metric label="Błędów" value={failures.length} />
        <Metric label="Łącznie" value={formatBytes(totalChars)} />
      </div>

      {pages.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Strony ({pages.length})</h3>
          <ul className="space-y-2">
            {pages.map((p) => (
              <ScrapePageItem key={p.url} page={p} />
            ))}
          </ul>
        </section>
      )}

      {failures.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-red-700">Błędy ({failures.length})</h3>
          <ul className="space-y-1">
            {failures.map((f, i) => (
              <li
                key={`${i}-${f.url}`}
                className="rounded border border-red-100 bg-red-50 px-3 py-2 text-xs"
              >
                <div className="truncate font-mono text-red-700" title={f.url}>
                  {f.url}
                </div>
                <div className="text-red-900">
                  {f.reason}
                  {f.httpStatus ? ` (HTTP ${f.httpStatus})` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScrapePageItem({ page }: { page: ScrapePage }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="mt-1 shrink-0 font-mono text-[10px] text-muted-foreground">
          {open ? "▼" : "▶"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={page.title}>
            {page.title || domainOf(page.url)}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={page.url}
            >
              {domainOf(page.url)}
            </a>
            <span>{formatBytes(page.markdown.length)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {page.source}
            </span>
            {page.truncated && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                obcięte
              </span>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t bg-background p-4">
          <MarkdownBody text={page.markdown} />
        </div>
      )}
    </li>
  );
}
