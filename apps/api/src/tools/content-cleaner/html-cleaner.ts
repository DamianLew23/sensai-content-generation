export function cleanHtml(text: string): string {
  if (!text || !text.trim()) return "";

  let t = text;

  // <br> variants → newline
  t = t.replace(/<br\s*\/?>/gi, "\n");

  // Unwrap <a> tags: keep only their text content
  t = t.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  // Strip any remaining HTML tags
  t = t.replace(/<\/?[a-z][^>]*>/gi, "");

  // Strip bare URLs (http/https and www.)
  t = t.replace(/https?:\/\/\S+/g, "");
  t = t.replace(/www\.\S+/g, "");

  // Collapse tabs to single space but keep newlines
  t = t.replace(/\t/g, " ");

  // Trim trailing spaces before newline and leading spaces after
  t = t.replace(/ +\n/g, "\n");
  t = t.replace(/\n +/g, "\n");

  // Collapse 3+ newlines → 2
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

export function removeDuplicateLines(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped === "") {
      out.push(line);
      continue;
    }
    if (!seen.has(stripped)) {
      seen.add(stripped);
      out.push(line);
    }
  }

  return out.join("\n");
}
