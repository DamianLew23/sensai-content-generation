"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRun } from "@/lib/hooks";
import { getRunTitle } from "@/lib/run-display";
import { DiffViewer } from "./diff-viewer";
import "./diff.css";

export default function RunDiffPage() {
  const params = useParams<{ id: string }>();
  const run = useRun(params?.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/runs/${params?.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Wróć do runa
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold">
            Diff artykułu{run.data ? ` — ${getRunTitle(run.data)}` : ""}
          </h1>
        </div>
      </div>

      {run.isLoading && <p>Ładowanie…</p>}
      {run.error && <p className="text-red-500">Błąd: {String(run.error)}</p>}
      {run.data && <DiffViewer steps={run.data.steps} />}
    </div>
  );
}
