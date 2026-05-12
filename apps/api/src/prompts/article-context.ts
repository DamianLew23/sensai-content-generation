import { createHash } from "node:crypto";
import type { RunInput } from "@sensai/shared";

export type ArticleContextMode = "create" | "edit";

export interface ArticleContextFields {
  strategicValue?: string;
  uniqueInsight?: string;
  additionalKeywords?: string[];
}

export function pickArticleContext(
  input: RunInput | null | undefined,
): ArticleContextFields {
  if (!input) return {};
  return {
    strategicValue: input.strategicValue,
    uniqueInsight: input.uniqueInsight,
    additionalKeywords: input.additionalKeywords,
  };
}

export function hasArticleContext(fields: ArticleContextFields): boolean {
  return Boolean(
    (fields.strategicValue && fields.strategicValue.trim()) ||
      (fields.uniqueInsight && fields.uniqueInsight.trim()) ||
      (fields.additionalKeywords && fields.additionalKeywords.length > 0),
  );
}

export function articleContextBlock(
  fields: ArticleContextFields,
  mode: ArticleContextMode,
): string {
  if (!hasArticleContext(fields)) return "";

  const parts: string[] = ["## ARTICLE CONTEXT (operator-supplied)"];

  if (fields.strategicValue && fields.strategicValue.trim()) {
    const directive =
      mode === "create"
        ? "Structure, angle and tone MUST support this strategic goal."
        : "Preserve framing that supports this goal. Do NOT erase or dilute it during editing.";
    parts.push(
      `### Strategic value`,
      fields.strategicValue.trim(),
      `→ ${directive}`,
    );
  }

  if (fields.uniqueInsight && fields.uniqueInsight.trim()) {
    const directive =
      mode === "create"
        ? "This is the article's distinct thesis. Build choices around defending it. Do NOT default to mainstream SERP framing."
        : "PROTECT this thesis. Do NOT soften it, mainstream-ify it, or remove its load-bearing claims while editing.";
    parts.push(
      `### Unique insight / thesis to defend`,
      fields.uniqueInsight.trim(),
      `→ ${directive}`,
    );
  }

  if (fields.additionalKeywords && fields.additionalKeywords.length > 0) {
    const directive =
      mode === "create"
        ? "Cover these LSI / variant keywords across sections where they fit thematically."
        : "Preserve any occurrences of these keywords; do not strip them out during cleanup.";
    parts.push(
      `### Additional keywords (LSI / variants)`,
      ...fields.additionalKeywords.map((k) => `- ${k}`),
      `→ ${directive}`,
    );
  }

  return parts.join("\n\n");
}

export function articleContextHash(fields: ArticleContextFields): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sv: fields.strategicValue?.trim() ?? "",
        ui: fields.uniqueInsight?.trim() ?? "",
        ak: fields.additionalKeywords ?? [],
      }),
    )
    .digest("hex");
}
