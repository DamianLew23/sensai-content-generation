"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";

interface SerpItem {
  title: string;
  url: string;
  description: string;
  position: number;
}

interface Props {
  runId: string;
  stepId: string;
  serpItems: SerpItem[];
}

const MAX_URLS = 10;
const DEFAULT_CHECKED = 3;

const ERROR_MESSAGES: Record<string, string> = {
  urls_not_in_serp: "Wybrane URL-e muszą być z listy wyników SERP.",
  run_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_out_of_order: "Nieaktualny krok — odśwież stronę.",
};

export function ApproveScrapeForm({ runId, stepId, serpItems }: Props) {
  const qc = useQueryClient();
  const initial = useMemo(
    () => new Set(serpItems.slice(0, DEFAULT_CHECKED).map((i) => i.url)),
    [serpItems],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (next.size < MAX_URLS) next.add(url);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.runs.resume(runId, stepId, { input: { urls: Array.from(selected) } });
      await qc.invalidateQueries({ queryKey: ["run", runId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const match = msg.match(/API \d+: (.+)$/s);
      let code: string | undefined;
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          code = parsed?.code ?? parsed?.message?.code;
        } catch { /* body wasn't JSON */ }
      }
      setError(ERROR_MESSAGES[code ?? ""] ?? (msg || "Network error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 rounded border border-amber-200 bg-amber-50 p-4">
      <div>
        <h2 className="text-lg font-medium">Wybierz strony do scrapowania</h2>
        <p className="text-sm text-muted-foreground">
          Wybrano <strong>{selected.size}</strong> z {MAX_URLS}. Zaznacz strony konkurencji których
          treść trafi do promptu briefu.
        </p>
      </div>
      <ul className="space-y-2">
        {serpItems.map((item) => {
          const checked = selected.has(item.url);
          const disabled = !checked && selected.size >= MAX_URLS;
          return (
            <li key={item.url} className={disabled ? "opacity-50" : ""}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(item.url)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">#{item.position} {item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.url}</span>
                  <span className="block text-xs text-muted-foreground">{item.description.slice(0, 200)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || selected.size === 0}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Wysyłam…" : `Scrapuj wybrane (${selected.size})`}
      </button>
    </section>
  );
}
