"use client";
import { useState } from "react";
import { domainOf, EmptyOutput, formatBytes, Metric } from "./shared";
import { MarkdownBody } from "./deep-research";

type CleanedPage = {
  url: string;
  title: string;
  fetchedAt: string;
  markdown: string;
  paragraphs: string[];
  originalChars: number;
  cleanedChars: number;
  removedParagraphs: number;
};

type DroppedPage = {
  url: string;
  reason:
    | "similar_to_kept"
    | "char_limit_reached"
    | "all_paragraphs_filtered"
    | "empty_after_cleanup";
  similarToUrl?: string;
  similarity?: number;
};

type CleaningStats = {
  inputPages: number;
  keptPages: number;
  inputChars: number;
  outputChars: number;
  reductionPct: number;
  blacklistedRemoved: number;
  keywordFilteredRemoved: number;
  crossPageDupesRemoved: number;
};

type CleanedResult = {
  pages: CleanedPage[];
  droppedPages: DroppedPage[];
  stats: CleaningStats;
};

function isCleaned(v: unknown): v is CleanedResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.pages) && Array.isArray(o.droppedPages) && !!o.stats;
}

const DROP_REASON_PL: Record<DroppedPage["reason"], string> = {
  similar_to_kept: "zbyt podobna",
  char_limit_reached: "limit znaków",
  all_paragraphs_filtered: "brak treści po filtrach",
  empty_after_cleanup: "pusta po czyszczeniu",
};

export function CleanedOutput({ value }: { value: unknown }) {
  if (!isCleaned(value)) return <EmptyOutput />;
  const { pages, droppedPages, stats } = value;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Zostawione" value={`${stats.keptPages}/${stats.inputPages}`} />
        <Metric label="Redukcja" value={`${stats.reductionPct.toFixed(1)}%`} />
        <Metric label="Wejście" value={formatBytes(stats.inputChars)} />
        <Metric label="Wyjście" value={formatBytes(stats.outputChars)} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border bg-card px-3 py-2">
          <div className="text-muted-foreground">Blacklista</div>
          <div className="font-medium">{stats.blacklistedRemoved}</div>
        </div>
        <div className="rounded border bg-card px-3 py-2">
          <div className="text-muted-foreground">Filtr słów kluczowych</div>
          <div className="font-medium">{stats.keywordFilteredRemoved}</div>
        </div>
        <div className="rounded border bg-card px-3 py-2">
          <div className="text-muted-foreground">Duplikaty cross-page</div>
          <div className="font-medium">{stats.crossPageDupesRemoved}</div>
        </div>
      </div>

      {pages.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Zachowane strony ({pages.length})</h3>
          <ul className="space-y-2">
            {pages.map((p) => (
              <CleanedPageItem key={p.url} page={p} />
            ))}
          </ul>
        </section>
      )}

      {droppedPages.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Odrzucone ({droppedPages.length})
          </h3>
          <ul className="space-y-1">
            {droppedPages.map((d, i) => (
              <li
                key={`${i}-${d.url}`}
                className="flex items-start gap-3 rounded border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {DROP_REASON_PL[d.reason]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={d.url}>
                    {domainOf(d.url)}
                  </div>
                  {d.similarToUrl && (
                    <div className="text-[11px] text-muted-foreground">
                      podobna do: {domainOf(d.similarToUrl)}
                      {d.similarity !== undefined && ` (${d.similarity.toFixed(2)})`}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type PageView = "markdown" | "paragraphs";

function CleanedPageItem({ page }: { page: CleanedPage }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PageView>("markdown");
  const reduction =
    page.originalChars > 0
      ? (((page.originalChars - page.cleanedChars) / page.originalChars) * 100).toFixed(1)
      : "0";

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
            <span>
              {formatBytes(page.cleanedChars)}{" "}
              <span className="text-muted-foreground">(−{reduction}%)</span>
            </span>
            <span>{page.paragraphs.length} akapitów</span>
            {page.removedParagraphs > 0 && (
              <span className="text-muted-foreground">−{page.removedParagraphs} usuniętych</span>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t bg-background p-4">
          <div
            role="tablist"
            aria-label="Widok treści"
            className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs"
          >
            <ViewTab active={view === "markdown"} onClick={() => setView("markdown")}>
              Markdown
            </ViewTab>
            <ViewTab active={view === "paragraphs"} onClick={() => setView("paragraphs")}>
              Paragrafy ({page.paragraphs.length})
            </ViewTab>
          </div>
          {view === "markdown" ? (
            <MarkdownBody text={page.markdown} />
          ) : (
            <ol className="space-y-2 text-sm leading-relaxed">
              {page.paragraphs.map((para, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {i + 1}.
                  </span>
                  <p className="flex-1">{para}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        active
          ? "rounded-sm bg-background px-2.5 py-1 font-medium shadow-sm"
          : "rounded-sm px-2.5 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
