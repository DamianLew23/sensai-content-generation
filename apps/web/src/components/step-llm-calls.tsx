"use client";
import type { LlmCall } from "@/lib/api";
import { formatLatency, formatUsd, summarizeLlmCalls } from "@/lib/run-display";

export function StepLlmCalls({ calls }: { calls: LlmCall[] | undefined }) {
  const summary = summarizeLlmCalls(calls);
  if (!summary || !calls) return null;

  const modelsLabel =
    summary.models.length === 1 ? summary.models[0] : `${summary.models.length} modeli`;
  const providersLabel =
    summary.providers.length === 1
      ? summary.providers[0]
      : `${summary.providers.length} providerów`;

  return (
    <details className="rounded-lg border bg-card" open>
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
        <span className="font-medium">Wywołania LLM ({summary.count})</span>
        <span className="font-mono text-xs text-muted-foreground">
          {modelsLabel} · {providersLabel} · {formatUsd(summary.totalCostUsd)} ·{" "}
          {formatLatency(summary.totalLatencyMs)} · {summary.totalPromptTokens}+
          {summary.totalCompletionTokens} tok
        </span>
      </summary>
      <div className="space-y-1 border-t p-3">
        <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">#</div>
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">
            Model
          </div>
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">
            Provider
          </div>
          <div className="text-right font-semibold uppercase tracking-wide text-muted-foreground">
            Tokeny
          </div>
          <div className="text-right font-semibold uppercase tracking-wide text-muted-foreground">
            Koszt
          </div>
          <div className="text-right font-semibold uppercase tracking-wide text-muted-foreground">
            Czas
          </div>
          {calls.map((c, i) => (
            <CallRow key={c.id} index={i + 1} call={c} />
          ))}
        </div>
      </div>
    </details>
  );
}

function CallRow({ index, call }: { index: number; call: LlmCall }) {
  return (
    <>
      <div className="font-mono text-muted-foreground">
        {index}
        {call.attempt > 1 ? `.${call.attempt}` : ""}
      </div>
      <div className="truncate font-mono">{call.model}</div>
      <div className="truncate font-mono text-muted-foreground">{call.provider}</div>
      <div className="text-right font-mono tabular-nums">
        {call.promptTokens}+{call.completionTokens}
      </div>
      <div className="text-right font-mono tabular-nums">{formatUsd(call.costUsd)}</div>
      <div className="text-right font-mono tabular-nums">{formatLatency(call.latencyMs)}</div>
    </>
  );
}
