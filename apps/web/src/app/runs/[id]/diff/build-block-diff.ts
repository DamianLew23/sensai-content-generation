// Hybrid block + word diff for article HTML.
//
// Pipeline:
//   1. Parse HTML on the client (DOMParser) into a flat list of "blocks"
//      (each <p>, <h1-h6>, <li>, <blockquote>).
//   2. Align blocks with a custom LCS pass keyed on normalized text equality.
//   3. For unaligned runs (a chunk of "removed" followed by "added"), greedily
//      pair them by Dice similarity ≥ SIMILARITY_THRESHOLD. Pairs get
//      word-level diff via jsdiff; leftovers stay as added-only / removed-only.
//   4. Emit a row list — each row pins one block to the left, right, or both.
//
// All HTML is generated as escaped fragments wrapped in the original tag, with
// <ins>/<del> spans inserted for word-level changes. The caller renders these
// via dangerouslySetInnerHTML inside a single scoped container.

import { diffWords } from "diff";

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);
const SIMILARITY_THRESHOLD = 0.55;

export interface Block {
  tag: string;          // lower-case tag name, e.g. "p"
  text: string;         // textContent, used for matching and word diff
  innerHTML: string;    // raw innerHTML, used when block is unchanged
  normalized: string;   // text normalized (collapsed whitespace, lowercased)
}

export type DiffRowKind =
  | "equal"      // text identical → render innerHTML on both sides
  | "modified"   // similar block pair → word-level diff on both sides
  | "removed"    // only on left
  | "added";     // only on right

export interface DiffRow {
  kind: DiffRowKind;
  /** HTML (a full tag like `<p>...</p>`) to render on the left, or null. */
  leftHtml: string | null;
  /** HTML to render on the right, or null. */
  rightHtml: string | null;
}

export interface DiffStats {
  /** Character count of the left source (htmlContent text only). */
  leftChars: number;
  rightChars: number;
  /** Total rows. */
  totalRows: number;
  /** Rows where left and right differ (modified + removed + added). */
  changedRows: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
}

// ── public entry point ───────────────────────────────────────────────────────

export function buildBlockDiff(leftHtml: string, rightHtml: string): DiffResult {
  const leftBlocks = parseBlocks(leftHtml);
  const rightBlocks = parseBlocks(rightHtml);

  const aligned = alignBlocks(leftBlocks, rightBlocks);
  const rows: DiffRow[] = [];

  // aligned is a sequence of operations: equal / del / ins
  // We pair adjacent del-then-ins (or ins-then-del) chunks by similarity.
  let i = 0;
  while (i < aligned.length) {
    const op = aligned[i]!;
    if (op.kind === "equal") {
      rows.push({
        kind: "equal",
        leftHtml: wrap(op.left!),
        rightHtml: wrap(op.right!),
      });
      i++;
      continue;
    }

    // Gather a contiguous run of non-equal ops to pair.
    const removed: Block[] = [];
    const added: Block[] = [];
    while (i < aligned.length && aligned[i]!.kind !== "equal") {
      const cur = aligned[i]!;
      if (cur.kind === "removed") removed.push(cur.left!);
      else added.push(cur.right!);
      i++;
    }
    pairRun(removed, added, rows);
  }

  const stats: DiffStats = {
    leftChars: leftBlocks.reduce((acc, b) => acc + b.text.length, 0),
    rightChars: rightBlocks.reduce((acc, b) => acc + b.text.length, 0),
    totalRows: rows.length,
    changedRows: rows.filter((r) => r.kind !== "equal").length,
  };

  return { rows, stats };
}

// ── parsing ──────────────────────────────────────────────────────────────────

function parseBlocks(html: string): Block[] {
  if (typeof window === "undefined") return []; // SSR safety; viewer is client-only.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Block[] = [];
  walk(doc.body, out);
  return out;
}

function walk(node: Element, out: Block[]) {
  for (const child of Array.from(node.children)) {
    if (BLOCK_TAGS.has(child.tagName)) {
      // <li> may live inside <ul>/<ol>; we treat each <li> as its own block.
      const text = child.textContent ?? "";
      if (text.trim().length === 0 && child.tagName !== "PRE") continue;
      // We render unchanged blocks via dangerouslySetInnerHTML; the LLM
      // pipeline is trusted but defense-in-depth is cheap. Strip event-handler
      // attributes and javascript: URLs before capture. Existing iframe-based
      // renderers don't need this; the diff view does because it's rendered
      // in the parent document.
      sanitizeInPlace(child);
      out.push({
        tag: child.tagName.toLowerCase(),
        text,
        innerHTML: child.innerHTML,
        normalized: normalize(text),
      });
    } else {
      // Descend into wrappers (ul, ol, div, section, ...).
      walk(child, out);
    }
  }
}

/** Recursively strips on* attributes and javascript:/data: URLs in href/src. */
function sanitizeInPlace(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "href" || name === "src" || name === "xlink:href") {
      const v = attr.value.trim().toLowerCase();
      if (v.startsWith("javascript:") || v.startsWith("data:text/html")) {
        el.removeAttribute(attr.name);
      }
    }
  }
  for (const child of Array.from(el.children)) sanitizeInPlace(child);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// ── alignment ────────────────────────────────────────────────────────────────

interface AlignOp {
  kind: "equal" | "removed" | "added";
  left: Block | null;
  right: Block | null;
}

/**
 * LCS over normalized text. Returns operations in order; "removed" means
 * the block is on the left only, "added" is right-only, "equal" pairs them.
 */
function alignBlocks(left: Block[], right: Block[]): AlignOp[] {
  const n = left.length;
  const m = right.length;
  // dp[i][j] = LCS length of left[0..i) vs right[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (left[i - 1]!.normalized === right[j - 1]!.normalized) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (left[i - 1]!.normalized === right[j - 1]!.normalized) {
      ops.push({ kind: "equal", left: left[i - 1]!, right: right[j - 1]! });
      i--; j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      ops.push({ kind: "removed", left: left[i - 1]!, right: null });
      i--;
    } else {
      ops.push({ kind: "added", left: null, right: right[j - 1]! });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: "removed", left: left[i - 1]!, right: null }); i--; }
  while (j > 0) { ops.push({ kind: "added", left: null, right: right[j - 1]! }); j--; }
  ops.reverse();
  return ops;
}

// ── pairing + word-level diff inside a run ──────────────────────────────────

/**
 * Greedy similarity pairing inside a contiguous removed/added run.
 * For each removed block, find the best-matching added block (Dice ≥
 * SIMILARITY_THRESHOLD); if one exists, emit a "modified" row with word-diff,
 * otherwise emit a "removed" row. Leftover added blocks become "added" rows.
 */
function pairRun(removed: Block[], added: Block[], rows: DiffRow[]) {
  const addedTaken = new Set<number>();
  for (const r of removed) {
    let bestIdx = -1;
    let bestScore = SIMILARITY_THRESHOLD;
    for (let i = 0; i < added.length; i++) {
      if (addedTaken.has(i)) continue;
      const score = dice(r.normalized, added[i]!.normalized);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      addedTaken.add(bestIdx);
      const a = added[bestIdx]!;
      const { leftHtml, rightHtml } = wordDiff(r, a);
      rows.push({ kind: "modified", leftHtml, rightHtml });
    } else {
      rows.push({ kind: "removed", leftHtml: wrap(r), rightHtml: null });
    }
  }
  for (let i = 0; i < added.length; i++) {
    if (addedTaken.has(i)) continue;
    rows.push({ kind: "added", leftHtml: null, rightHtml: wrap(added[i]!) });
  }
}

/** Dice coefficient on character bigrams — cheap, decent for short text. */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) ?? 0) + 1);
    }
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [bg, ca] of A) {
    const cb = B.get(bg);
    if (cb) inter += Math.min(ca, cb);
  }
  return (2 * inter) / (totalA + totalB);
}

function wordDiff(left: Block, right: Block): { leftHtml: string; rightHtml: string } {
  // diffWords keeps whitespace tokens, which matters for citation markers etc.
  const parts = diffWords(left.text, right.text);
  let leftInner = "";
  let rightInner = "";
  for (const p of parts) {
    const escaped = escapeHtml(p.value);
    if (p.added) {
      rightInner += `<ins>${escaped}</ins>`;
    } else if (p.removed) {
      leftInner += `<del>${escaped}</del>`;
    } else {
      leftInner += escaped;
      rightInner += escaped;
    }
  }
  // Tag chosen from the *right* side for the right column and left for left —
  // tag shifts (e.g. <p> → <h3>) are rare in this pipeline but we preserve them.
  return {
    leftHtml: `<${left.tag}>${leftInner}</${left.tag}>`,
    rightHtml: `<${right.tag}>${rightInner}</${right.tag}>`,
  };
}

function wrap(b: Block): string {
  return `<${b.tag}>${b.innerHTML}</${b.tag}>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
