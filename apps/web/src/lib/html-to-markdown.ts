// Lightweight HTML → Markdown converter for the constrained tag set the
// article LLM handlers emit (h1-h6, p, strong/b, em/i, a, blockquote,
// ul/ol/li, br, hr, table). Runs client-side via DOMParser.

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const inner = childrenInline(el);

  switch (el.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return inner.trim() ? `**${inner.trim()}**` : "";
    case "em":
    case "i":
      return inner.trim() ? `*${inner.trim()}*` : "";
    case "code":
      return inner.trim() ? `\`${inner.trim()}\`` : "";
    case "a": {
      const href = el.getAttribute("href");
      return href ? `[${inner.trim()}](${href})` : inner;
    }
    case "br":
      return "  \n";
    default:
      return inner;
  }
}

function childrenInline(el: Element): string {
  let out = "";
  el.childNodes.forEach((c) => {
    out += inline(c);
  });
  return out;
}

function block(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? "").trim();
    return t ? t + "\n\n" : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      return `${"#".repeat(level)} ${childrenInline(el).trim()}\n\n`;
    }
    case "p":
      return `${childrenInline(el).trim()}\n\n`;
    case "blockquote": {
      const text = childrenBlock(el).trim();
      return text
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n") + "\n\n";
    }
    case "ul":
    case "ol": {
      const ordered = tag === "ol";
      let i = 0;
      let out = "";
      el.childNodes.forEach((c) => {
        if (
          c.nodeType === Node.ELEMENT_NODE &&
          (c as Element).tagName.toLowerCase() === "li"
        ) {
          i += 1;
          const marker = ordered ? `${i}. ` : "- ";
          out += `${marker}${childrenInline(c as Element).trim()}\n`;
        }
      });
      return out + "\n";
    }
    case "hr":
      return "---\n\n";
    case "br":
      return "";
    case "table":
      return tableToMarkdown(el) + "\n\n";
    case "div":
    case "section":
    case "article":
    case "main":
    case "body":
      return childrenBlock(el);
    default:
      // Unknown wrapper / inline-ish element: treat as a paragraph.
      return `${childrenInline(el).trim()}\n\n`;
  }
}

function childrenBlock(el: Element): string {
  let out = "";
  el.childNodes.forEach((c) => {
    out += block(c);
  });
  return out;
}

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const cells = rows.map((r) =>
    Array.from(r.querySelectorAll("th,td")).map((c) =>
      childrenInline(c).trim().replace(/\|/g, "\\|"),
    ),
  );
  const colCount = Math.max(...cells.map((r) => r.length));
  const pad = (r: string[]) => {
    const copy = [...r];
    while (copy.length < colCount) copy.push("");
    return copy;
  };
  const header = pad(cells[0]);
  const body = cells.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** Convert an HTML fragment string to Markdown. Browser-only (uses DOMParser). */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return childrenBlock(doc.body)
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
