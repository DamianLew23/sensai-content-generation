"use client";
import type { Step } from "@/lib/api";
import { cn } from "@/lib/utils";

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "running":
      return "…";
    case "failed":
      return "✗";
    case "skipped":
      return "↷";
    default:
      return "○";
  }
}

export function RunTimeline({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: Step[];
  selectedStepId?: string;
  onSelectStep?: (id: string) => void;
}) {
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onSelectStep?.(s.id)}
            className={cn(
              "w-full rounded border px-3 py-2 text-left text-sm transition-colors",
              selectedStepId === s.id ? "bg-muted" : "hover:bg-muted/50",
              s.status === "failed" && "border-red-500/40",
              s.status === "completed" && "border-green-500/30",
            )}
          >
            <span className="font-mono text-xs text-muted-foreground">
              {s.stepOrder}.
            </span>{" "}
            <span className="font-mono">{statusIcon(s.status)}</span>{" "}
            <span className="font-medium">{s.stepKey}</span>{" "}
            <span className="text-muted-foreground">({s.type})</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
