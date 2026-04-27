"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  runId: string;
  stepId: string;
  stepKey: string;
  stepStatus: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  step_not_rerunnable: "Ten krok nie może być ponowiony w obecnym stanie. Odśwież stronę.",
  run_cancelled: "Run został anulowany — nie można ponowić kroku.",
  step_not_in_run: "Krok nie należy do tego runa.",
};

export function RerunStepPanel({ runId, stepId, stepKey, stepStatus }: Props) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "loading" | "confirm" | "submitting">("idle");
  const [downstream, setDownstream] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (stepStatus !== "completed" && stepStatus !== "failed") return null;

  async function openConfirm() {
    setPhase("loading");
    setError(null);
    try {
      const preview = await api.runs.rerunPreview(runId, stepId);
      setDownstream(preview.downstream);
      setPhase("confirm");
    } catch (e: any) {
      setError(formatError(e));
      setPhase("idle");
    }
  }

  async function confirmRerun() {
    setPhase("submitting");
    setError(null);
    try {
      await api.runs.rerun(runId, stepId);
      await qc.invalidateQueries({ queryKey: ["run", runId] });
      setPhase("idle");
      setDownstream(null);
    } catch (e: any) {
      setError(formatError(e));
      setPhase("confirm");
    }
  }

  function cancel() {
    setPhase("idle");
    setDownstream(null);
    setError(null);
  }

  if ((phase === "confirm" || phase === "submitting") && downstream !== null) {
    return (
      <section className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-medium">Ponowić krok „{stepKey}"?</h3>
        {downstream.length === 0 ? (
          <p className="text-sm">Żadne inne kroki nie zostaną zmienione.</p>
        ) : (
          <div className="text-sm">
            <p>Następujące kroki zostaną również zresetowane i ponowione (zależą od „{stepKey}"):</p>
            <ul className="mt-1 list-disc pl-5">
              {downstream.map((k) => (
                <li key={k}><code className="font-mono text-xs">{k}</code></li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Krok „{stepKey}" zostanie wykonany z pominięciem cache (force refresh).
        </p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmRerun}
            disabled={phase === "submitting"}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {phase === "submitting" ? "Uruchamiam…" : "Potwierdź ponowienie"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={phase === "submitting"}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Anuluj
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={openConfirm}
        disabled={phase === "loading"}
        className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {phase === "loading" ? "Ładuję…" : "Ponów krok"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

function formatError(e: any): string {
  const msg = String(e?.message ?? "");
  const match = msg.match(/API \d+: (.+)$/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const code = parsed?.code ?? parsed?.message?.code;
      if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    } catch {
      /* body wasn't JSON */
    }
  }
  return msg || "Network error";
}
