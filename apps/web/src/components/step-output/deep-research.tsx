"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { domainOf, EmptyOutput, formatBytes, Metric } from "./shared";

type Source = { url: string; title?: string; snippets?: string[] };
type Briefing = { content: string; sources: Source[] };

function isBriefing(v: unknown): v is Briefing {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.content === "string" && Array.isArray(o.sources);
}

export function DeepResearchOutput({ value }: { value: unknown }) {
  if (!isBriefing(value)) return <EmptyOutput />;
  const { content, sources } = value;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Źródeł" value={sources.length} />
        <Metric label="Treść" value={formatBytes(content.length)} />
      </div>

      <article className="rounded-lg border bg-card p-5">
        <MarkdownBody text={content} />
      </article>

      {sources.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">Źródła ({sources.length})</h3>
          <ol className="space-y-2">
            {sources.map((s, i) => (
              <SourceItem key={`${i}-${s.url}`} index={i + 1} source={s} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function SourceItem({ index, source }: { index: number; source: Source }) {
  const [expanded, setExpanded] = useState(false);
  const snippets = source.snippets ?? [];
  const title = source.title?.trim() || domainOf(source.url);

  return (
    <li className="flex gap-3 text-sm">
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{index}.</span>
      <div className="min-w-0 flex-1">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium hover:underline"
          title={source.url}
        >
          {title}
        </a>
        <div className="text-xs text-muted-foreground">{domainOf(source.url)}</div>
        {snippets.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-muted-foreground hover:underline"
          >
            {expanded ? "Ukryj" : `Pokaż ${snippets.length} cytat${snippets.length === 1 ? "" : "y"}`}
          </button>
        )}
        {expanded && snippets.length > 0 && (
          <ul className="mt-2 space-y-1 border-l-2 border-muted pl-3 text-xs text-muted-foreground">
            {snippets.map((sn, i) => (
              <li key={i}>„{sn}"</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mt-4 text-xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 text-base font-semibold">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-2 text-sm font-semibold">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-muted pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b px-2 py-1">{children}</td>,
          hr: () => <hr className="my-4 border-muted" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
