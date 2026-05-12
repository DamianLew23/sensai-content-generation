const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_EXACT = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "yclid"]);

/**
 * Canonicalises a URL for dedup purposes. Lowercases host, drops fragment,
 * removes common tracking params, sorts remaining params, and strips a
 * trailing slash from non-root paths. Scheme is preserved (http != https).
 *
 * If parsing fails, returns the input unchanged so we never throw inside
 * the SERP merge.
 */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input;
  }

  u.hash = "";
  u.host = u.host.toLowerCase();

  const keep: [string, string][] = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (TRACKING_PARAM_EXACT.has(key)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => key.startsWith(p))) continue;
    keep.push([key, value]);
  }
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);

  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;

  return u.toString();
}
