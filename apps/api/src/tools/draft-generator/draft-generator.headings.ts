import type { PassageFormat } from "./draft-generator.types";
import type { PassageTrigger } from "@sensai/shared";

interface TriggerSpec {
  patternsPl: RegExp[];
  patternsEn: RegExp[];
  format: string;
  rules: string;
}

// Patterns mirror docs/edu/lekcja-3-2/T3F2-generation_draft_educational.py:HEADING_TRIGGERS.
// Order matters: more-specific triggers (definition, instruction, ...) come BEFORE
// the catch-all "question" trigger so "Co to jest X" matches definition not question.
const TRIGGERS: Record<PassageTrigger, TriggerSpec> = {
  definition: {
    patternsPl: [/^co to jest/i, /^czym jest/i, /^co to znaczy/i, /i jego rola/i],
    patternsEn: [/^what is/i, /^what are/i, /^define/i],
    format:
      "Definicja: Zdanie definiujące (1-2 zd.) → Rozwinięcie z atrybutami (3-5 zd.) → Micro-summary (1 zd.)",
    rules:
      "Encja nazwana w 1. zdaniu. Relacja do kategorii nadrzędnej. Min. 1 atrybut wyróżniający.",
  },
  instruction: {
    patternsPl: [/^jak\s/i, /jak\s.*\?$/i, /w jaki sposób/i],
    patternsEn: [/^how to/i, /^how do/i, /^how can/i],
    format:
      "Instrukcja: Kontekst + cel (1 zd.) → Kroki/metody (3-7 punktów lub akapitów) → Rezultat (1 zd.)",
    rules:
      "Encja + cel w 1. zdaniu. Każdy krok = 1 konkretna akcja. Czasowniki aktywne.",
  },
  cause: {
    patternsPl: [/^dlaczego/i, /przyczyny/i, /skutki/i, /powody/i],
    patternsEn: [/^why/i, /causes/i, /effects/i, /reasons/i],
    format:
      "Przyczyna: Twierdzenie (1 zd.) → Wyjaśnienie przyczynowe (3-5 zd.) → Dowód/statystyka → Wniosek",
    rules:
      "Relacja przyczynowo-skutkowa w 1. zdaniu. Konkretny fakt liczbowy obowiązkowy.",
  },
  comparison: {
    patternsPl: [/\bvs\b/i, /\bczy\b.*\?/i, /porównanie/i, /co pomaga.*co szkodzi/i, /\bco\b.*\ba co\b/i],
    patternsEn: [/\bvs\b/i, /comparison/i, /which is better/i],
    format:
      "Porównanie: Ramka porównania (1 zd.) → Tabela/lista różnic → Analiza kluczowej różnicy → Werdykt",
    rules:
      "Obie strony porównania nazwane w 1. zdaniu. Min. 3 wymiary porównania. Jasny werdykt.",
  },
  diagnosis: {
    patternsPl: [/jak rozpoznać/i, /objawy/i, /badania/i, /monitorować/i, /^kiedy/i],
    patternsEn: [/how to recognize/i, /symptoms/i, /when to/i, /diagnosis/i],
    format:
      "Diagnostyka: Ogólna zasada (1 zd.) → Warunki/objawy (lista) → Metody weryfikacji → Kiedy do lekarza",
    rules: "Konkretne warunki i wartości referencyjne. Lista objawów z opisami.",
  },
  list: {
    patternsPl: [/najlepsze/i, /najczęstsze/i, /rodzaje/i, /typy/i, /metody/i, /sposoby/i, /techniki/i],
    patternsEn: [/^best/i, /^top/i, /types of/i, /kinds of/i, /methods/i],
    format:
      "Lista: Kontekst wyboru (1-2 zd.) → Lista z encjami i atrybutami → Kryterium podziału/wyboru → Rekomendacja",
    rules: "Min. 3 nazwane elementy. Każdy z opisem i atrybutem wyróżniającym.",
  },
  question: {
    patternsPl: [/\?$/i, /^jaka\s/i, /^jaki\s/i, /^jakie\s/i, /^ile\s/i, /^co\s/i],
    patternsEn: [/\?$/i, /^what\s/i, /^which\s/i, /^how much/i],
    format:
      "Direct Answer: Odpowiedź w 1. zdaniu → Rozwinięcie z kontekstem (2-3 zd.) → Dodatkowy kąt/niuans",
    rules:
      "PIERWSZYM zdaniem jest bezpośrednia odpowiedź. Potem rozwinięcie. NIGDY nie buduj napięcia.",
  },
};

const INTENT_TO_TRIGGER: Record<string, PassageTrigger> = {
  Definicyjna: "definition",
  Instrukcyjna: "instruction",
  Problemowa: "cause",
  Diagnostyczna: "diagnosis",
  Porównawcza: "comparison",
  Decyzyjna: "list",
};

const TRIGGER_ORDER: PassageTrigger[] = [
  "definition",
  "diagnosis", // before "instruction" so "Jak rozpoznać X" wins over "^jak\s"
  "instruction",
  "cause",
  "comparison",
  "list",
  "question", // catch-all last
];

export function detectPassageFormat(
  header: string | null | undefined,
  sourceIntent: string | undefined,
  lang: string,
): PassageFormat {
  const headerLower = (header ?? "").toLowerCase().trim();
  const langKey = lang === "en" ? "patternsEn" : "patternsPl";

  if (headerLower) {
    for (const trigger of TRIGGER_ORDER) {
      const spec = TRIGGERS[trigger];
      const patterns = spec[langKey];
      if (patterns.some((re) => re.test(headerLower))) {
        return {
          trigger,
          format: spec.format,
          rules: spec.rules,
          matchedBy: "header_pattern",
        };
      }
    }
  }

  if (sourceIntent && INTENT_TO_TRIGGER[sourceIntent]) {
    const trigger = INTENT_TO_TRIGGER[sourceIntent];
    const spec = TRIGGERS[trigger];
    return {
      trigger,
      format: spec.format,
      rules: spec.rules,
      matchedBy: "source_intent",
    };
  }

  const spec = TRIGGERS.instruction;
  return {
    trigger: "instruction",
    format: spec.format,
    rules: spec.rules,
    matchedBy: "default",
  };
}
