"use client";
import { Download } from "lucide-react";
import { htmlToMarkdown } from "@/lib/html-to-markdown";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "artykul"
  );
}

/** Converts the rendered article HTML to Markdown and triggers a .md download. */
export function DownloadMarkdownButton({
  htmlContent,
  filenameBase,
}: {
  htmlContent: string;
  filenameBase: string;
}) {
  function download() {
    const markdown = htmlToMarkdown(htmlContent);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(filenameBase)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
    >
      <Download className="h-4 w-4" />
      Pobierz Markdown
    </button>
  );
}
