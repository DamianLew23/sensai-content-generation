"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Step } from "@/lib/api";
import { buildBlockDiff, type DiffResult } from "./build-block-diff";

// Step types that produce an article HTML payload at output.htmlContent.
// Order here defines the canonical pipeline order shown in the dropdowns.
const STAGE_TYPES = [
  { type: "tool.draft.generate", label: "Draft (draftGen)" },
  { type: "tool.data.enrich", label: "Enrich" },
  { type: "tool.article.optimize", label: "Optimize" },
  { type: "tool.article.intermediate", label: "Intermediate" },
  { type: "tool.article.humanize", label: "Humanize" },
] as const;

interface AvailableStage {
  stepId: string;
  type: string;
  label: string;
  stepKey: string;
  htmlContent: string;
}

export function DiffViewer({ steps }: { steps: Step[] }) {
  const stages = useMemo<AvailableStage[]>(() => {
    const out: AvailableStage[] = [];
    for (const s of steps) {
      const meta = STAGE_TYPES.find((m) => m.type === s.type);
      if (!meta) continue;
      const html = extractHtml(s.output);
      if (!html) continue;
      out.push({
        stepId: s.id,
        type: s.type,
        label: meta.label,
        stepKey: s.stepKey,
        htmlContent: html,
      });
    }
    return out.sort((a, b) => stageIndex(a.type) - stageIndex(b.type));
  }, [steps]);

  // Default: first and last available stage (likely draft → humanize).
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  useEffect(() => {
    if (stages.length === 0) return;
    setLeftId((cur) => (cur && stages.some((s) => s.stepId === cur) ? cur : stages[0]!.stepId));
    setRightId((cur) =>
      cur && stages.some((s) => s.stepId === cur)
        ? cur
        : stages[stages.length - 1]!.stepId,
    );
  }, [stages]);

  const left = stages.find((s) => s.stepId === leftId);
  const right = stages.find((s) => s.stepId === rightId);

  const diff = useMemo<DiffResult | null>(() => {
    if (!left || !right) return null;
    return buildBlockDiff(left.htmlContent, right.htmlContent);
  }, [left, right]);

  if (stages.length < 2) {
    return (
      <div className="rounded border bg-amber-50 p-4 text-sm text-amber-900">
        Za mało etapów z artykułem do porównania. Potrzebne co najmniej 2 z:
        draft / enrich / optimize / intermediate / humanize.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar
        stages={stages}
        leftId={leftId}
        rightId={rightId}
        onChange={(side, id) => (side === "left" ? setLeftId(id) : setRightId(id))}
        onSwap={() => {
          const a = leftId;
          setLeftId(rightId);
          setRightId(a);
        }}
      />

      {diff && left && right && (
        <>
          <StatsBar
            leftLabel={left.label}
            rightLabel={right.label}
            stats={diff.stats}
          />
          <DiffPanes rows={diff.rows} />
          <Legend />
        </>
      )}
    </div>
  );
}

function stageIndex(type: string): number {
  const idx = STAGE_TYPES.findIndex((m) => m.type === type);
  return idx < 0 ? 999 : idx;
}

function extractHtml(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const v = (output as Record<string, unknown>).htmlContent;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ── toolbar ────────────────────────────────────────────────────────────────

function Toolbar({
  stages,
  leftId,
  rightId,
  onChange,
  onSwap,
}: {
  stages: AvailableStage[];
  leftId: string;
  rightId: string;
  onChange: (side: "left" | "right", id: string) => void;
  onSwap: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <StageSelect
        label="Było (A)"
        value={leftId}
        stages={stages}
        onChange={(v) => onChange("left", v)}
      />
      <button
        type="button"
        onClick={onSwap}
        className="rounded border px-3 py-2 text-sm hover:bg-muted/50"
        title="Zamień strony"
      >
        ⇄
      </button>
      <StageSelect
        label="Jest (B)"
        value={rightId}
        stages={stages}
        onChange={(v) => onChange("right", v)}
      />
    </div>
  );
}

function StageSelect({
  label,
  value,
  stages,
  onChange,
}: {
  label: string;
  value: string;
  stages: AvailableStage[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border bg-background px-2 py-1.5 text-sm text-foreground"
      >
        {stages.map((s) => (
          <option key={s.stepId} value={s.stepId}>
            {s.label} — {s.stepKey}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── stats bar ───────────────────────────────────────────────────────────────

function StatsBar({
  leftLabel,
  rightLabel,
  stats,
}: {
  leftLabel: string;
  rightLabel: string;
  stats: DiffResult["stats"];
}) {
  const delta = stats.rightChars - stats.leftChars;
  const pct = stats.leftChars > 0 ? (delta / stats.leftChars) * 100 : 0;
  const sign = delta > 0 ? "+" : "";
  const pctSign = pct > 0 ? "+" : "";
  const fmt = (n: number) => n.toLocaleString("pl-PL");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
      <div>
        <span className="text-muted-foreground">{leftLabel}:</span>{" "}
        <span className="font-medium">{fmt(stats.leftChars)} zn.</span>
      </div>
      <div className="text-muted-foreground">→</div>
      <div>
        <span className="text-muted-foreground">{rightLabel}:</span>{" "}
        <span className="font-medium">{fmt(stats.rightChars)} zn.</span>
      </div>
      <div className={delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-emerald-700" : "text-red-700"}>
        ({sign}{fmt(delta)} zn., {pctSign}{pct.toFixed(1)}%)
      </div>
      <div className="text-muted-foreground">·</div>
      <div>
        zmienione bloki:{" "}
        <span className="font-medium">
          {stats.changedRows}/{stats.totalRows}
        </span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-4 rounded border bg-red-50" /> usunięte
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-4 rounded border bg-amber-50" /> zmienione (word-diff w środku)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-4 rounded border bg-green-50" /> dodane
      </span>
      <span className="inline-flex items-center gap-1">
        <code className="rounded bg-red-100 px-1 text-red-900">del</code>
        <code className="rounded bg-green-100 px-1 text-green-900">ins</code>
        zmienione słowa
      </span>
    </div>
  );
}

// ── side-by-side panes with synced scroll ───────────────────────────────────

function DiffPanes({ rows }: { rows: DiffResult["rows"] }) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l || !r) return;

    const sync = (src: HTMLDivElement, dst: HTMLDivElement) => () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      dst.scrollTop = src.scrollTop;
      // Reset on the next frame so the mirrored scroll event we just caused
      // doesn't re-trigger us.
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    };
    const onL = sync(l, r);
    const onR = sync(r, l);
    l.addEventListener("scroll", onL, { passive: true });
    r.addEventListener("scroll", onR, { passive: true });
    return () => {
      l.removeEventListener("scroll", onL);
      r.removeEventListener("scroll", onR);
    };
  }, []);

  return (
    <div className="flex rounded-lg border bg-white">
      <Pane ref={leftRef} rows={rows} side="left" />
      <div className="w-px shrink-0 bg-slate-200" />
      <Pane ref={rightRef} rows={rows} side="right" />
    </div>
  );
}

interface PaneProps {
  rows: DiffResult["rows"];
  side: "left" | "right";
}

const Pane = forwardRef<HTMLDivElement, PaneProps>(function Pane(
  { rows, side },
  ref,
) {
  return (
    <div
      ref={ref}
      className="diff-pane max-h-[75vh] flex-1 overflow-y-auto px-4 py-3"
    >
      {rows.map((row, i) => {
        const html = side === "left" ? row.leftHtml : row.rightHtml;
        const otherHtml = side === "left" ? row.rightHtml : row.leftHtml;
        // Row-level background color tells you the kind at a glance.
        const bg =
          row.kind === "equal"
            ? ""
            : row.kind === "modified"
              ? "bg-amber-50/60"
              : side === "left" && row.kind === "removed"
                ? "bg-red-50"
                : side === "right" && row.kind === "added"
                  ? "bg-green-50"
                  : "bg-slate-50/60"; // placeholder slot on the opposite side

        // Cheap min-height proxy so paired rows roughly align without us
        // measuring every block. Caps the worst-case drift at ~one line.
        const lenLeft = textLen(row.leftHtml);
        const lenRight = textLen(row.rightHtml);
        const longer = Math.max(lenLeft, lenRight);
        const minHeight = Math.max(28, Math.ceil(longer / 80) * 24);

        return (
          <div
            key={i}
            data-kind={row.kind}
            className={`diff-row ${bg}`}
            style={{ minHeight: `${minHeight}px` }}
          >
            {html ? (
              <div
                className="diff-html"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : otherHtml ? (
              <div className="diff-placeholder text-xs italic text-muted-foreground">
                {row.kind === "removed" ? "(dodano w B)" : "(usunięto z A)"}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

function textLen(html: string | null): number {
  if (!html) return 0;
  return html.replace(/<[^>]*>/g, "").length;
}
