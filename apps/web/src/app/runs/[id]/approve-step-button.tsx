"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  runId: string;
  stepId: string;
  stepKey: string;
  stepType: string;
}

const STEP_LABELS: Record<string, string> = {
  "tool.topic.disambiguate": "Disambiguacja tematu",
  "tool.youcom.research": "Deep Research (you.com)",
  "tool.serp.fetch": "Pobranie SERP",
};

const ERROR_MESSAGES: Record<string, string> = {
  run_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_out_of_order: "Nieaktualny krok — odśwież stronę.",
};

export function ApproveStepButton({ runId, stepId, stepKey, stepType }: Props) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = STEP_LABELS[stepType] ?? stepKey;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.runs.resume(runId, stepId, {});
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
    <section className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4">
      <div>
        <h2 className="text-lg font-medium">Zatwierdź krok: {label}</h2>
        <p className="text-sm text-muted-foreground">
          Run czeka na zatwierdzenie tego kroku. Sprawdź wyjście poprzedniego kroku w osi czasu po lewej, a następnie kliknij poniżej, aby kontynuować.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Wysyłam…" : "Zatwierdź i kontynuuj"}
      </button>
    </section>
  );
}
