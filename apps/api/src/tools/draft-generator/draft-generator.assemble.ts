interface AssembleArgs {
  h1Title: string;
  htmlChunks: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function assembleDraft(args: AssembleArgs): string {
  const parts = [`<h1>${escapeHtml(args.h1Title)}</h1>`, ...args.htmlChunks];
  let html = parts.join("\n\n");
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/\n{3,}/g, "\n\n");
  return html.trim();
}
