import type { ExtractedClaim } from "@sensai/shared";

interface LangConfig {
  label: string;
  searchLang: string;
  searchInstruction: string;
  sourceRule: string;
}

const LANG: Record<string, LangConfig> = {
  pl: {
    label: "Źródło",
    searchLang: "polski",
    searchInstruction:
      "Szukaj WYŁĄCZNIE po polsku. Używaj polskich fraz w web search.",
    sourceRule:
      "Źródło MUSI być w języku polskim — strona, na którą linkujesz, musi zawierać treść po polsku. " +
      "Nie akceptuj stron anglojęzycznych, niemieckojęzycznych ani w żadnym innym języku. " +
      'Jeśli nie znajdziesz polskojęzycznego źródła → zwróć "unverified".',
  },
  en: {
    label: "Source",
    searchLang: "English",
    searchInstruction: "Search ONLY in English. Use English phrases in web search.",
    sourceRule:
      "Source MUST be in English — the page you link to must contain English-language content. " +
      "Do not accept non-English sources. " +
      'If no English-language source found → return "unverified".',
  },
  de: {
    label: "Quelle",
    searchLang: "Deutsch",
    searchInstruction:
      "Suche AUSSCHLIESSLICH auf Deutsch. Verwende deutsche Suchbegriffe.",
    sourceRule:
      "Die Quelle MUSS auf Deutsch sein — die verlinkte Seite muss deutschsprachigen Inhalt enthalten. " +
      "Keine englischsprachigen Quellen. " +
      'Wenn keine deutschsprachige Quelle gefunden → "unverified" zurückgeben.',
  },
};

export interface VerifyPromptArgs {
  keyword: string;
  language: string;
  claims: ExtractedClaim[];
  today: string; // ISO date
}

const SYSTEM =
  "You are a fact-checking assistant. You use web search to verify claims and respond with strict JSON only. " +
  "No markdown, no commentary outside the JSON object.";

export const dataEnrichVerifyPrompt = {
  system: SYSTEM,

  user(args: VerifyPromptArgs): string {
    const cfg = LANG[args.language] ?? LANG.en;

    const lines: string[] = [];
    lines.push(
      `For each claim from an article about "${args.keyword}" find a source that answers the question and confirm or correct the claim text.`,
    );
    lines.push("");
    lines.push("CLAIMS TO VERIFY:");
    for (const c of args.claims) {
      lines.push(`\nCLAIM #${c.id}:`);
      lines.push(`  Question (search this): ${c.question ?? c.claimText}`);
      lines.push(`  Article text: ${c.claimText}`);
      lines.push(`  Section: ${c.h2Context}`);
    }
    lines.push("");
    lines.push("CONTEXT:");
    lines.push(`- Today: ${args.today}`);
    lines.push("");
    lines.push("===============================================");
    lines.push("LANGUAGE CONSTRAINT (HARD):");
    lines.push("===============================================");
    lines.push(`Article language: ${cfg.searchLang}`);
    lines.push(cfg.searchInstruction);
    lines.push("");
    lines.push(cfg.sourceRule);
    lines.push("===============================================");
    lines.push("");
    lines.push("RULES:");
    lines.push("1. Use the QUESTION as your web search query.");
    lines.push(`2. Find a page in ${cfg.searchLang} that answers the question.`);
    lines.push("3. Compare the page's answer with the ARTICLE TEXT.");
    lines.push('4. If the article text is correct → "confirmed" + source.');
    lines.push('5. If the article text is wrong → "corrected" + corrected_value + source.');
    lines.push(`6. If no source in ${cfg.searchLang} → "unverified".`);
    lines.push("7. NEVER fabricate sources or numbers.");
    lines.push("");
    lines.push("OUTPUT (strict JSON):");
    lines.push("{");
    lines.push(`  "1": { "status": "confirmed", "source": "${cfg.label}: ...", "source_url": "https://...", "note": "" },`);
    lines.push(`  "2": { "status": "corrected", "source": "${cfg.label}: ...", "source_url": "https://...", "corrected_value": "...", "note": "what was wrong" },`);
    lines.push(`  "3": { "status": "unverified", "source": "", "source_url": "", "note": "no source in ${cfg.searchLang}" }`);
    lines.push("}");
    lines.push("");
    lines.push('Statuses: "confirmed" | "corrected" | "unverified"');
    return lines.join("\n");
  },
};
