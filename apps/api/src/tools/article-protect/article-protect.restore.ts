import { load } from "cheerio";

export interface RestoreResult {
  html: string;
  missingSrc: string[];
  missingSpans: string[];
}

export function restoreHybrid(
  html: string,
  srcMap: Record<string, string>,
  spanMap: Record<string, string>,
): RestoreResult {
  const missingSrc: string[] = [];
  let text = html;

  // STEP 1 — Restore SRC placeholders. Track misses.
  for (const [marker, original] of Object.entries(srcMap)) {
    if (text.includes(marker)) {
      text = text.split(marker).join(original);
    } else {
      missingSrc.push(marker);
    }
  }

  // STEP 2 — Walk DOM, find token spans, record which IDs survived, then
  // unwrap each span (replace with its inner text).
  const $ = load(text, null, false);
  const foundIds = new Set<string>();
  $("span[data-token-id]").each((_, el) => {
    const id = $(el).attr("data-token-id");
    if (id) foundIds.add(id);
    $(el).replaceWith($(el).contents());
  });
  const missingSpans = Object.keys(spanMap).filter((id) => !foundIds.has(id));

  return {
    html: $.html(),
    missingSrc,
    missingSpans,
  };
}
