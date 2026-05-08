import type { ProjectConfig, RunInput } from "@sensai/shared";
import { DisambiguateOutput } from "@sensai/shared";

function bullet(items: string[]): string {
  return items.map((s) => `- ${s}`).join("\n");
}

export const topicDisambiguatePrompt = {
  system(projectName: string, cfg: ProjectConfig): string {
    const lines: string[] = [
      `Jesteś analitykiem contentu marki "${projectName}". Twoją rolą jest doprecyzowanie tematu artykułu w kontekście tego projektu, ZANIM odpalimy drogi research, tak aby research nie poszedł w niewłaściwą niszę.`,
    ];

    const ctxLines: string[] = [];
    if (cfg.productPitch) ctxLines.push(`Co robi projekt: ${cfg.productPitch}`);
    if (cfg.domain) ctxLines.push(`Domena / nisza: ${cfg.domain}`);
    if (cfg.targetAudience) ctxLines.push(`Grupa docelowa: ${cfg.targetAudience}`);
    if (cfg.toneOfVoice) ctxLines.push(`Tone of voice: ${cfg.toneOfVoice}`);
    if (cfg.guidelines) ctxLines.push(`Wytyczne brandowe: ${cfg.guidelines}`);
    if (cfg.competitors.length > 0) ctxLines.push(`Konkurencja: ${cfg.competitors.join(", ")}`);
    if (ctxLines.length > 0) {
      lines.push("", "## Kontekst projektu", ...ctxLines);
    }

    if (cfg.keyTerms.length > 0) {
      lines.push(
        "",
        `## Terminy, które MUSZĄ być uwzględnione w doprecyzowanym temacie / zapytaniach researchowych: ${cfg.keyTerms.join(", ")}`,
        bullet(cfg.keyTerms),
      );
    }

    if (cfg.antiTerms.length > 0) {
      lines.push(
        "",
        `## Interpretacje, w które NIE WOLNO iść (to inna nisza niż projekt): ${cfg.antiTerms.join(", ")}`,
        bullet(cfg.antiTerms),
        "",
        "Każdy taki anti-term MUSI pojawić się w polu antiAngles outputu, żeby downstream wiedział czego unikać.",
      );
    }

    lines.push(
      "",
      "## Zadanie",
      "Doprecyzuj temat tak, aby pasował do niszy projektu. Wygeneruj:",
      "- refinedTopic: doprecyzowane sformułowanie tematu (1 zdanie),",
      "- mainKeyword: główne słowo kluczowe dla SERP (1-5 słów),",
      "- intent: informational | navigational | transactional | commercial,",
      "- contentType: np. \"how-to guide\", \"listicle\", \"comparison\",",
      "- researchQuestion: pełnozdaniowe pytanie badawcze do you.com,",
      "- serpQueries: 2-4 warianty zapytań do Google/PAA,",
      "- antiAngles: lista interpretacji do wykluczenia (zaczynając od antiTerms wyżej, plus własne uzupełnienia),",
      "- rationale: 1-2 zdania uzasadnienia wyborów.",
      "",
      "Zwróć WYŁĄCZNIE obiekt JSON zgodny ze schematem.",
    );

    return lines.join("\n");
  },

  user(input: RunInput): string {
    const lines: string[] = [`Surowy temat artykułu: ${input.topic}`];
    if (input.mainKeyword) lines.push(`Sugerowane mainKeyword od operatora: ${input.mainKeyword}`);
    if (input.intent) lines.push(`Sugerowany intent: ${input.intent}`);
    if (input.contentType) lines.push(`Sugerowany contentType: ${input.contentType}`);
    return lines.join("\n");
  },

  schema: DisambiguateOutput,
};
