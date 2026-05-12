import { z } from "zod";
import type { ProjectRow } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput, ResearchBriefing } from "@sensai/shared";
import type { ScrapePage } from "@sensai/shared";
import type { SerpItem } from "../tools/dataforseo/serp.types";

export const BriefOutputSchema = z.object({
  headline: z.string(),
  angle: z.string().describe("Unikalny kąt ujęcia tematu"),
  pillars: z.array(z.string()).min(3).max(6).describe("Główne filary treści (3-6 punktów)"),
  audiencePainPoints: z.array(z.string()).min(2).max(5),
  successCriteria: z.string().describe("Jak wyglądałby idealny artykuł?"),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

function formatSerpContext(items: SerpItem[]): string {
  const lines = items.map((it, idx) =>
    `${idx + 1}. ${it.title}\n   ${it.url}\n   ${it.description}`,
  );
  return [
    "Konkurencja na to słowo kluczowe (top 10 wyników Google):",
    ...lines,
    "",
    "Przygotowując brief, weź pod uwagę jakie kąty są już mocno pokryte i zaproponuj angle który się wyróżnia.",
  ].join("\n");
}

function formatScrapeContext(pages: ScrapePage[]): string {
  const sections = pages.map((p) => [
    `### ${p.title || p.url}`,
    `URL: ${p.url}${p.truncated ? ` (skrócone do ${p.markdown.length} znaków z ${p.rawLength})` : ""}`,
    "",
    p.markdown,
  ].join("\n"));
  return [
    "## Treść stron konkurencji (wybranych przez operatora):",
    "",
    ...sections,
    "",
    "Wykorzystaj tę treść — znajdź luki jakościowe, wspólne tezy do powtórzenia, pomysły na unikalny angle.",
  ].join("\n");
}

function formatDeepResearch(r: ResearchBriefing): string {
  const sourceLines = r.sources.map((s, idx) =>
    `[${idx + 1}] ${s.title ? `${s.title} — ` : ""}${s.url}`,
  );
  return [
    "## Deep research briefing (z you.com):",
    "",
    r.content,
    "",
    "### Źródła",
    ...sourceLines,
    "",
    "Ten briefing zawiera syntezę wiedzy o temacie z wielu źródeł. Wykorzystaj fakty, dane i perspektywy ekspertów przy kształtowaniu kąta i filarów treści.",
  ].join("\n");
}

export const briefPrompt = {
  system(project: ProjectRow, antiAngles: string[] = []) {
    const cfg = project.config as ProjectConfig;
    const lines: Array<string | false> = [
      `Jesteś starszym redaktorem i strategiem contentu marki "${project.name}".`,
      cfg.toneOfVoice && `Tone of voice: ${cfg.toneOfVoice}`,
      cfg.targetAudience && `Grupa docelowa: ${cfg.targetAudience}`,
      cfg.guidelines && `Wytyczne brandowe: ${cfg.guidelines}`,
      `Twoim zadaniem jest przygotowanie krótkiego briefu artykułu na podstawie tematu od użytkownika.`,
      `Zwróć odpowiedź wyłącznie jako obiekt JSON zgodny ze schematem.`,
    ];
    if (antiAngles.length > 0) {
      lines.push(
        [
          "## KRYTYCZNE — UNIKAJ tych interpretacji tematu (są z innej niszy niż projekt):",
          ...antiAngles.map((a) => `- ${a}`),
          "",
          "Jeśli zaproponowany kąt sugeruje którąkolwiek z powyższych interpretacji, ODRZUĆ go i wybierz inny.",
        ].join("\n"),
      );
    }
    return lines.filter(Boolean).join("\n\n");
  },
  user(
    input: RunInput,
    serpContext?: SerpItem[],
    scrapePages?: ScrapePage[],
    deepResearch?: ResearchBriefing,
  ) {
    const lines: Array<string | false | undefined> = [
      `Temat artykułu: ${input.topic}`,
      input.mainKeyword && `Główne słowo kluczowe: ${input.mainKeyword}`,
      input.intent && `Intent użytkownika: ${input.intent}`,
      input.contentType && `Typ treści: ${input.contentType}`,
    ];
    if (input.strategicValue) {
      lines.push(
        "",
        "## Wartość strategiczna artykułu",
        input.strategicValue,
        "Brief musi wspierać tę wartość — successCriteria i angle mają realizować ten cel biznesowy.",
      );
    }
    if (input.uniqueInsight) {
      lines.push(
        "",
        "## Unikalny insight / teza do obrony",
        input.uniqueInsight,
        "To jest oryginalny kąt, którego artykuł musi bronić. Twój `angle` powinien być spójny z tą tezą (lub jej silnym rozwinięciem) — NIE wybieraj kąta, który ją osłabia ani nie sprowadza do mainstreamu.",
      );
    }
    if (input.additionalKeywords && input.additionalKeywords.length > 0) {
      lines.push(
        "",
        "## Dodatkowe słowa kluczowe (LSI / wariacje)",
        ...input.additionalKeywords.map((k) => `- ${k}`),
        "Uwzględnij je przy doborze filarów (pillars) i pain pointów — pokrycie tych fraz jest pożądane.",
      );
    }
    if (deepResearch && deepResearch.content.length > 0) {
      lines.push("", formatDeepResearch(deepResearch));
    }
    if (serpContext && serpContext.length > 0) {
      lines.push("", formatSerpContext(serpContext));
    }
    if (scrapePages && scrapePages.length > 0) {
      lines.push("", formatScrapeContext(scrapePages));
    }
    lines.push("", "Przygotuj brief.");
    return lines.filter((l): l is string => typeof l === "string").join("\n");
  },
  schema: BriefOutputSchema,
};
