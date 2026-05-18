import type { LlmCall, Run, Template } from "./api";

type RunInputLike = { topic?: string; mainKeyword?: string };

function getInput(run: Run): RunInputLike {
  return (run.input ?? {}) as RunInputLike;
}

export function getRunTitle(run: Run): string {
  const { topic, mainKeyword } = getInput(run);
  if (topic && mainKeyword) return `${topic} · ${mainKeyword}`;
  if (topic) return topic;
  if (mainKeyword) return mainKeyword;
  return `Run ${run.id.slice(0, 8)}`;
}

export function getRunKeyword(run: Run): string | undefined {
  return getInput(run).mainKeyword;
}

export function getRunTopic(run: Run): string | undefined {
  return getInput(run).topic;
}

export function getStepProgress(
  run: Run,
  template: Template | undefined,
): { current: number; total: number } | undefined {
  const total = template?.stepsDef?.steps?.length;
  if (!total) return undefined;
  const current = Math.min(run.currentStepOrder ?? 0, total);
  return { current, total };
}

export function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const minRem = min % 60;
  return minRem ? `${hr}h ${minRem}m` : `${hr}h`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export interface LlmCallsSummary {
  count: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  models: string[];
  providers: string[];
}

export function summarizeLlmCalls(calls: LlmCall[] | undefined): LlmCallsSummary | null {
  if (!calls || calls.length === 0) return null;
  const models = new Set<string>();
  const providers = new Set<string>();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  for (const c of calls) {
    models.add(c.model);
    providers.add(c.provider);
    totalPromptTokens += c.promptTokens;
    totalCompletionTokens += c.completionTokens;
    totalLatencyMs += c.latencyMs;
    const cost = Number(c.costUsd);
    if (Number.isFinite(cost)) totalCostUsd += cost;
  }
  return {
    count: calls.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalCostUsd,
    totalLatencyMs,
    models: [...models],
    providers: [...providers],
  };
}

export function formatUsd(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "$0";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem ? `${min}m ${rem}s` : `${min}m`;
}
