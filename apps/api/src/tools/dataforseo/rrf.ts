export const RRF_K_DEFAULT = 60;

export interface RankedQuery {
  query: string;
  /** URLs in ranked order (rank 1 = first). Use the canonical URL form so dedup works. */
  urls: string[];
}

export interface FusedItem {
  url: string;
  score: number;
  sourceQueries: string[];
  originalRanks: { query: string; rank: number }[];
}

/**
 * Reciprocal Rank Fusion. For each url, score = Σ 1/(k + rank_i)
 * across all queries where it appears. Documents not present in a
 * query contribute 0 to that sum (no penalty for absence).
 *
 * Output is sorted by score desc, with stable URL-asc tiebreak.
 *
 * Reference: Cormack, Clarke, Büttcher (SIGIR 2009).
 */
export function fuseRankings(
  rankings: RankedQuery[],
  opts: { k?: number } = {},
): FusedItem[] {
  const k = opts.k ?? RRF_K_DEFAULT;
  const acc = new Map<string, FusedItem>();

  for (const r of rankings) {
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.urls[i];
      const rank = i + 1;
      const contribution = 1 / (k + rank);
      const existing = acc.get(url);
      if (existing) {
        existing.score += contribution;
        existing.sourceQueries.push(r.query);
        existing.originalRanks.push({ query: r.query, rank });
      } else {
        acc.set(url, {
          url,
          score: contribution,
          sourceQueries: [r.query],
          originalRanks: [{ query: r.query, rank }],
        });
      }
    }
  }

  return Array.from(acc.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
}
