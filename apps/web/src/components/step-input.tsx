"use client";
import { useState } from "react";

interface LlmPromptInput {
  kind: "llm.prompt";
  promptVersion?: string;
  system?: string;
  user?: string;
  userBlocks?: Array<{ label?: string; body: string }>;
  userNote?: string;
  antiTerms?: string[];
}

function isLlmPromptInput(v: unknown): v is LlmPromptInput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.kind === "llm.prompt";
}

export function StepInput({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const [rawJson, setRawJson] = useState(false);

  if (value == null) return null;

  const isPrompt = isLlmPromptInput(value);
  const summary = isPrompt
    ? [
        value.promptVersion && `prompt ${value.promptVersion}`,
        typeof value.system === "string" && `system ${value.system.length} zn.`,
        typeof value.user === "string" && `user ${value.user.length} zn.`,
        Array.isArray(value.userBlocks) && value.userBlocks.length > 0 &&
          `${value.userBlocks.length} bloków`,
        Array.isArray(value.antiTerms) && value.antiTerms.length > 0 &&
          `${value.antiTerms.length} antiTerms`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "payload";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border bg-card"
    >
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
        <span className="font-medium">Wejście do LLM</span>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </summary>
      <div className="space-y-3 border-t p-3">
        {isPrompt && !rawJson ? (
          <>
            {value.system && (
              <Section title="System prompt" body={value.system} />
            )}
            {value.user && (
              <Section title="User prompt" body={value.user} />
            )}
            {value.userNote && (
              <p className="rounded bg-muted/30 p-2 text-xs italic text-muted-foreground">
                {value.userNote}
              </p>
            )}
            {Array.isArray(value.userBlocks) && value.userBlocks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  User prompts ({value.userBlocks.length})
                </h4>
                {value.userBlocks.map((b, i) => (
                  <details
                    key={i}
                    className="rounded border bg-muted/10"
                    open={i === 0}
                  >
                    <summary className="cursor-pointer px-2 py-1 text-xs">
                      {b.label ?? `Blok ${i + 1}`}{" "}
                      <span className="text-muted-foreground">
                        ({b.body.length} zn.)
                      </span>
                    </summary>
                    <div className="border-t p-2">
                      <Section title="" body={b.body} hideHeader />
                    </div>
                  </details>
                ))}
              </div>
            )}
            {Array.isArray(value.antiTerms) && value.antiTerms.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  antiTerms (guard)
                </h4>
                <div className="flex flex-wrap gap-1">
                  {value.antiTerms.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-xs">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
        {isPrompt && (
          <div className="flex justify-end">
            <div className="flex overflow-hidden rounded border text-xs">
              <button
                type="button"
                onClick={() => setRawJson(false)}
                className={`px-2 py-1 ${
                  !rawJson ? "bg-muted font-medium" : "text-muted-foreground"
                }`}
              >
                Widok
              </button>
              <button
                type="button"
                onClick={() => setRawJson(true)}
                className={`border-l px-2 py-1 ${
                  rawJson ? "bg-muted font-medium" : "text-muted-foreground"
                }`}
              >
                Raw JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function Section({
  title,
  body,
  hideHeader,
}: {
  title: string;
  body: string;
  hideHeader?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="space-y-1">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}{" "}
            <span className="text-muted-foreground/70">({body.length} zn.)</span>
          </h4>
          <button
            type="button"
            onClick={copy}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? "skopiowano" : "kopiuj"}
          </button>
        </div>
      )}
      {hideHeader && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copy}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? "skopiowano" : "kopiuj"}
          </button>
        </div>
      )}
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-xs">
        {body}
      </pre>
    </div>
  );
}
