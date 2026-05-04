#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
GENERATION DRAFT – Wersja edukacyjna (lekcja)
=====================================================
Generuje draft artykułu z danych dystrybucji
(output poprzedniego etapu pipeline).

WEJŚCIE:
  • output_distribution.json – sekcje z przypisanymi danymi KG

WYJŚCIE:
  • output_draft.html – wygenerowany artykuł HTML
  • output_image_prompts.json – prompty do generowania infografik (jeśli są)

ETAPY:
  Etap 1 – Wczytanie danych z dystrybucji
  Etap 2 – Deduplikacja faktów H3 vs H2
  Etap 3 – Analiza nagłówków → format pasażu (Heading Trigger)
  Etap 4 – Podział sekcji na bloki generowania
  Etap 5 – Generowanie bloków (LLM + response ID chaining)
  Etap 6 – Składanie i zapis finalnego artykułu
=====================================================
"""

import os
import json
import re
import time
from typing import List, Dict, Optional, Tuple

try:
    from openai import OpenAI
except ImportError:
    print("❌ Zainstaluj: pip install openai")
    raise SystemExit(1)

# ===== KONFIGURACJA =====
INPUT_FILE = "output_distribution.json"
OUTPUT_FILE = "output_draft.html"
OUTPUT_IMAGE_PROMPTS = "output_image_prompts.json"
MODEL_NAME = "gpt-5.2"
DEBUG_MODE = False

# Parametry reasoning — działają TYLKO z modelami reasoning (GPT-5, o-series).
# Przy GPT-4.1 / Claude ustaw USE_REASONING_PARAMS = False.
#
# reasoning.effort: jak mocno model "myśli" przed pisaniem
#   low = szybka odpowiedź, medium = balans (domyślne), high = maksymalne rozumowanie
#
# text.verbosity: jak rozwlekle pisze
#   low = zwięzły (dobre z NO FILLER), medium = standardowy, high = rozbudowany
#
# W kursie: tymi parametrami manipulujemy objętość i szczegółowość output'u.
USE_REASONING_PARAMS = True  # Zmień na True gdy używasz modelu reasoning
REASONING_EFFORT = "medium"   # low / medium / high
TEXT_VERBOSITY = "medium"        # low / medium / high

if not os.environ.get("OPENAI_API_KEY"):
    print("❌ Ustaw zmienną środowiskową OPENAI_API_KEY")
    raise SystemExit(1)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

print("=" * 60)
print("📝 GENERATION DRAFT – wersja edukacyjna")
print(f"   • Model: {MODEL_NAME}")
print(f"   • Reasoning: {'ON (effort={}, verbosity={})'.format(REASONING_EFFORT, TEXT_VERBOSITY) if USE_REASONING_PARAMS else 'OFF (standard params)'}")
print(f"   • Input: {INPUT_FILE}")
print(f"   • Output: {OUTPUT_FILE}")
print("=" * 60)


# =====================================================
# ETAP 1 – WCZYTANIE DANYCH Z DYSTRYBUCJI
# =====================================================

def load_distribution(filepath: str) -> Dict:
    """Wczytuje plik dystrybucji."""
    if not os.path.exists(filepath):
        print(f"   ❌ Brak pliku: {filepath}")
        return {}

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    project = data.get("project", {})
    sections = data.get("sections", [])
    stats = data.get("stats", {})

    print(f"\n📋 Projekt: {project.get('keyword', '?')}")
    print(f"   H1: {project.get('h1_title', '?')}")
    print(f"   Język: {project.get('lang', '?')}")
    print(f"   Intencja: {project.get('search_intent', '?')}")
    print(f"\n📊 Sekcje: {len(sections)}")
    print(f"   • Encje: {stats.get('entities_used', '?')}")
    print(f"   • Fakty: {stats.get('facts_used', '?')}")
    print(f"   • Pokrycie: {stats.get('coverage_percent', '?')}%")

    return data


# =====================================================
# ETAP 2 – DEDUPLIKACJA FAKTÓW H3 vs H2
# =====================================================
# Cel: Usunąć fakty z H3, które już istnieją w rodzicielskim H2.
# LLM powtarza informacje nawet z instrukcją "nie powtarzaj",
# jeśli ten sam fakt jest w danych wejściowych.
# Usunięcie PRZED wysyłką eliminuje problem u źródła.

def deduplicate_h3_facts(sections: List[Dict]) -> List[Dict]:
    """Usuwa fakty z H3 pokrywające się z rodzicielskim H2."""
    deduped = []
    current_h2_facts = set()
    current_h2_entities = set()
    removed_count = 0

    for section in sections:
        s = dict(section)

        if s["type"] in ("h2", "intro"):
            current_h2_facts = set()
            current_h2_entities = set()
            for f in s.get("facts", []):
                if isinstance(f, dict):
                    fact_text = f.get("text", "")[:80].lower().strip()
                    if fact_text:
                        current_h2_facts.add(fact_text)
            for e in s.get("entities", []):
                if isinstance(e, dict):
                    current_h2_entities.add(e.get("name", "").lower().strip())

        if s.get("h3s"):
            for h3 in s["h3s"]:
                if isinstance(h3, dict) and h3.get("facts"):
                    filtered = []
                    for f in h3.get("facts", []):
                        if isinstance(f, dict):
                            fact_text = f.get("text", "")[:80].lower().strip()
                            if fact_text and fact_text in current_h2_facts:
                                removed_count += 1
                                continue
                        filtered.append(f)
                    h3["facts"] = filtered

        deduped.append(s)

    if removed_count > 0:
        print(f"\n   🔄 Dedup: usunięto {removed_count} duplikatów faktów z H3")
    else:
        print(f"\n   ✅ Dedup: brak duplikatów do usunięcia")

    return deduped


# =====================================================
# ETAP 3 – ANALIZA NAGŁÓWKÓW → FORMAT PASAŻU
# =====================================================
# Cel: Na podstawie tekstu nagłówka i intencji sekcji
# wyznaczyć wymagany format pasażu (Heading Trigger → Passage Format).
#
# Źródło: Mikrosemantyczny framework SRO — nagłówek determinuje
# strukturę odpowiedzi. "Jak..." = instrukcja z krokami,
# "Co to jest..." = definicja, pytanie = direct answer.
#
# Format jest dołączany do promptu per sekcja, dzięki czemu
# model wie JAK napisać sekcję, a nie tylko CO w niej umieścić.

# Wzorce nagłówków → formaty pasażów
HEADING_TRIGGERS = {
    "definition": {
        "patterns_pl": [r"^co to jest", r"^czym jest", r"^co to znaczy", r"i jego rola"],
        "patterns_en": [r"^what is", r"^what are", r"^define"],
        "format": "Definicja: Zdanie definiujące (1-2 zd.) → Rozwinięcie z atrybutami (3-5 zd.) → Micro-summary (1 zd.)",
        "rules": "Encja nazwana w 1. zdaniu. Relacja do kategorii nadrzędnej. Min. 1 atrybut wyróżniający."
    },
    "instruction": {
        "patterns_pl": [r"^jak ", r"jak .*\?$", r"w jaki sposób"],
        "patterns_en": [r"^how to", r"^how do", r"^how can"],
        "format": "Instrukcja: Kontekst + cel (1 zd.) → Kroki/metody (3-7 punktów lub akapitów) → Rezultat (1 zd.)",
        "rules": "Encja + cel w 1. zdaniu. Każdy krok = 1 konkretna akcja. Czasowniki aktywne."
    },
    "cause": {
        "patterns_pl": [r"^dlaczego", r"przyczyny", r"skutki", r"powody"],
        "patterns_en": [r"^why", r"causes", r"effects", r"reasons"],
        "format": "Przyczyna: Twierdzenie (1 zd.) → Wyjaśnienie przyczynowe (3-5 zd.) → Dowód/statystyka → Wniosek",
        "rules": "Relacja przyczynowo-skutkowa w 1. zdaniu. Konkretny fakt liczbowy obowiązkowy."
    },
    "comparison": {
        "patterns_pl": [r"vs\b", r"czy\b.*\?", r"porównanie", r"co pomaga.*co szkodzi", r"co .*a co"],
        "patterns_en": [r"vs\b", r"comparison", r"which is better"],
        "format": "Porównanie: Ramka porównania (1 zd.) → Tabela/lista różnic → Analiza kluczowej różnicy → Werdykt",
        "rules": "Obie strony porównania nazwane w 1. zdaniu. Min. 3 wymiary porównania. Jasny werdykt."
    },
    "diagnosis": {
        "patterns_pl": [r"jak rozpoznać", r"objawy", r"badania", r"monitorować", r"kiedy"],
        "patterns_en": [r"how to recognize", r"symptoms", r"when to", r"diagnosis"],
        "format": "Diagnostyka: Ogólna zasada (1 zd.) → Warunki/objawy (lista) → Metody weryfikacji → Kiedy do lekarza",
        "rules": "Konkretne warunki i wartości referencyjne. Lista objawów z opisami."
    },
    "list": {
        "patterns_pl": [r"najlepsze", r"najczęstsze", r"rodzaje", r"typy", r"metody", r"sposoby", r"techniki"],
        "patterns_en": [r"best", r"top", r"types of", r"kinds of", r"methods"],
        "format": "Lista: Kontekst wyboru (1-2 zd.) → Lista z encjami i atrybutami → Kryterium podziału/wyboru → Rekomendacja",
        "rules": "Min. 3 nazwane elementy. Każdy z opisem i atrybutem wyróżniającym."
    },
    "question": {
        "patterns_pl": [r"\?$", r"^jaka ", r"^jaki ", r"^jakie ", r"^ile ", r"^co "],
        "patterns_en": [r"\?$", r"^what ", r"^which ", r"^how much"],
        "format": "Direct Answer: Odpowiedź w 1. zdaniu → Rozwinięcie z kontekstem (2-3 zd.) → Dodatkowy kąt/niuans",
        "rules": "PIERWSZYM zdaniem jest bezpośrednia odpowiedź na pytanie. Potem rozwinięcie. NIGDY nie buduj napięcia."
    }
}


def detect_passage_format(header: str, source_intent: str = None, lang: str = "pl") -> Dict:
    """
    Analizuje nagłówek i zwraca wymagany format pasażu.

    Logika:
    1. Sprawdź patterns per trigger type
    2. Jeśli pasuje → zwróć format + rules
    3. Jeśli nie pasuje → fallback na source_intent z dystrybucji
    4. Jeśli brak intent → domyślny format "instruction"
    """
    header_lower = header.lower().strip() if header else ""

    # Mapowanie intencji z dystrybucji na trigger types
    intent_to_trigger = {
        "Definicyjna": "definition",
        "Instrukcyjna": "instruction",
        "Problemowa": "cause",
        "Diagnostyczna": "diagnosis",
        "Porównawcza": "comparison",
        "Decyzyjna": "list",
    }

    # 1. Sprawdź pattern matching na nagłówku
    lang_key = f"patterns_{lang}" if lang in ("pl", "en") else "patterns_en"

    for trigger_name, trigger_data in HEADING_TRIGGERS.items():
        patterns = trigger_data.get(lang_key, trigger_data.get("patterns_en", []))
        for pattern in patterns:
            if re.search(pattern, header_lower):
                return {
                    "trigger": trigger_name,
                    "format": trigger_data["format"],
                    "rules": trigger_data["rules"],
                    "matched_by": "header_pattern"
                }

    # 2. Fallback na source_intent z dystrybucji
    if source_intent and source_intent in intent_to_trigger:
        trigger_name = intent_to_trigger[source_intent]
        trigger_data = HEADING_TRIGGERS[trigger_name]
        return {
            "trigger": trigger_name,
            "format": trigger_data["format"],
            "rules": trigger_data["rules"],
            "matched_by": "source_intent"
        }

    # 3. Domyślny: instruction
    default = HEADING_TRIGGERS["instruction"]
    return {
        "trigger": "instruction",
        "format": default["format"],
        "rules": default["rules"],
        "matched_by": "default"
    }


def analyze_all_sections(sections: List[Dict], lang: str = "pl") -> List[Dict]:
    """
    Dla każdej sekcji wyznacza passage_format na podstawie nagłówka.
    Dodaje pole _passage_format do sekcji.
    """
    for section in sections:
        header = section.get("header") or ""
        intent = section.get("source_intent")
        pf = detect_passage_format(header, intent, lang)
        section["_passage_format"] = pf

        # Również dla H3
        for h3 in section.get("h3s", []):
            if isinstance(h3, dict):
                h3_header = h3.get("header", "")
                h3_pf = detect_passage_format(h3_header, None, lang)
                h3["_passage_format"] = h3_pf

    # Wypisz wyniki analizy
    print(f"\n🎯 Heading Trigger Analysis:")
    for s in sections:
        pf = s.get("_passage_format", {})
        header = s.get("header") or "Intro"
        print(f"   [{pf.get('trigger', '?'):12}] {header[:50]}  (via {pf.get('matched_by', '?')})")
        for h3 in s.get("h3s", []):
            if isinstance(h3, dict):
                h3_pf = h3.get("_passage_format", {})
                print(f"     └─[{h3_pf.get('trigger', '?'):12}] {h3.get('header', '')[:50]}")

    return sections


# =====================================================
# ETAP 3b – PRZYGOTOWANIE IDEACJI
# =====================================================
# Cel: Rozdzielić ideacje na te do generowania inline (tabele, checklisty)
# i te wymagające osobnego narzędzia (infografiki, wykresy).
#
# Tabele i checklisty → instrukcja w prompcie, model generuje HTML
# Infografiki/wykresy → prompt do narzędzia graficznego (osobny output)

def prepare_ideations(sections: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Rozdziela ideacje na inline (tabele, checklisty) i external (infografiki).
    Zwraca: (sections z wzbogaconymi ideacjami, lista promptów do infografik)
    """
    image_prompts = []

    # Typy ideacji które model może wygenerować jako HTML
    INLINE_TYPES = {"tabela", "checklist", "lista", "porównanie", "schemat"}
    # Typy wymagające narzędzia graficznego
    EXTERNAL_TYPES = {"infografika", "wykres", "diagram", "grafika"}

    for section in sections:
        inline_ideations = []
        external_ideations = []

        for idea in section.get("ideations", []):
            if not isinstance(idea, dict):
                continue
            idea_type = (idea.get("type", "") or "").lower()
            desc = idea.get("description", "")

            if idea_type in INLINE_TYPES or any(kw in idea_type for kw in INLINE_TYPES):
                # Dodaj instrukcję formatowania
                if "tabela" in idea_type or "porównanie" in idea_type:
                    idea["_format_instruction"] = f"Generate as HTML <table> with headers: {desc}"
                elif "checklist" in idea_type or "lista" in idea_type:
                    idea["_format_instruction"] = f"Generate as HTML <ul> checklist: {desc}"
                elif "schemat" in idea_type:
                    idea["_format_instruction"] = f"Generate as structured HTML list/steps: {desc}"
                inline_ideations.append(idea)

            elif idea_type in EXTERNAL_TYPES or any(kw in idea_type for kw in EXTERNAL_TYPES):
                # Generuj prompt do narzędzia graficznego
                image_prompts.append({
                    "section_header": section.get("header", ""),
                    "ideation_type": idea_type,
                    "description": desc,
                    "prompt": f"Create an infographic: {desc}. "
                              f"Context: article about '{section.get('header', '')}'. "
                              f"Style: clean, professional, data-focused."
                })
                external_ideations.append(idea)
            else:
                inline_ideations.append(idea)

        section["_inline_ideations"] = inline_ideations
        section["_external_ideations"] = external_ideations

    inline_count = sum(len(s.get("_inline_ideations", [])) for s in sections)
    external_count = sum(len(s.get("_external_ideations", [])) for s in sections)
    print(f"\n📐 Ideacje: {inline_count} inline (tabele/checklisty), {external_count} external (infografiki)")

    return sections, image_prompts


# =====================================================
# ETAP 4 – PODZIAŁ SEKCJI NA BLOKI GENEROWANIA
# =====================================================

def create_generation_blocks(sections: List[Dict]) -> List[List[Dict]]:
    """Każda sekcja H2 (z H3) = osobny blok."""
    blocks = []
    for section in sections:
        blocks.append([section])

    print(f"\n📦 Podział na bloki: {len(blocks)} bloków")
    for i, block in enumerate(blocks, 1):
        s = block[0]
        header = s.get("header") or "Intro"
        h3_count = len(s.get("h3s", []))
        section_type = s.get("section_type", "full")
        trigger = s.get("_passage_format", {}).get("trigger", "?")
        print(f"   Blok {i}: [{section_type}|{trigger}] {header}" + (f" (+{h3_count} H3)" if h3_count else ""))

    return blocks


# =====================================================
# ETAP 5 – GENEROWANIE BLOKÓW (LLM + RESPONSE ID CHAINING)
# =====================================================

class DraftGenerator:
    """Zarządza generowaniem bloków z response ID chaining."""
    def __init__(self):
        self.blocks: List[str] = []
        self.response_ids: List[str] = []
        self.total_length = 0

    def get_last_response_id(self) -> Optional[str]:
        return self.response_ids[-1] if self.response_ids else None


def build_outline_context(all_sections: List[Dict], current_index: int) -> str:
    """Buduje pełny outline artykułu z zaznaczeniem bieżącej sekcji."""
    lines = ["FULL ARTICLE OUTLINE (for context — do NOT duplicate info from other sections):"]
    for i, section in enumerate(all_sections):
        header = section.get("header") or "Introduction"
        marker = "→ CURRENT SECTION (write this one)" if i == current_index else "(other section — do not repeat its content)"
        entity_names = [e.get("name", "") for e in section.get("entities", []) if isinstance(e, dict)]
        fact_count = len(section.get("facts", []))
        h3_headers = [h.get("header", "") for h in section.get("h3s", []) if isinstance(h, dict)]
        line = f"  [{section.get('type', '?')}] {header} {marker}"
        if entity_names:
            line += f"\n         entities: {', '.join(entity_names[:4])}"
        if fact_count:
            line += f"\n         facts: {fact_count}"
        if h3_headers:
            line += f"\n         H3: {'; '.join(h3_headers)}"
        lines.append(line)
    return "\n".join(lines)


def build_prompt(sections_batch: List[Dict], keyword: str, h1_title: str,
                 lang: str, block_number: int,
                 all_sections: List[Dict], current_section_index: int) -> str:
    """
    Buduje prompt do generowania bloku tekstu.

    Struktura:
    1. Passage Blueprint (5 elementów)
    2. Reguły jakościowe (BLUF, NO FILLER, NO DUPLICATE, H2/H3 HIERARCHY)
    3. Entity Clarity rules
    4. Instrukcje pisania + formatowania
    5. Sekcje do napisania (z passage_format per sekcja)
    6. Outline jako kontekst anty-duplikacji
    7. Pytania, na które trzeba odpowiedzieć
    """

    lang_names = {"pl": "Polish", "en": "English", "de": "German", "fr": "French"}
    language = lang_names.get(lang, "English")

    # --- Zbierz informacje o sekcjach ---
    sections_info = ""
    all_questions = []

    for i, section in enumerate(sections_batch, 1):
        header = section.get("header") or "Introduction"
        html_tag = "h2" if section["type"] == "h2" else "p"

        # Passage format z analizy nagłówka
        pf = section.get("_passage_format", {})
        passage_instruction = ""
        if pf:
            passage_instruction = f"\n   📋 PASSAGE FORMAT: {pf.get('format', '')}"
            passage_instruction += f"\n   📋 PASSAGE RULES: {pf.get('rules', '')}"

        # Section type: full vs context
        section_type = section.get("section_type", "full")
        context_note = section.get("context_note", "")
        type_instruction = ""
        if section_type == "context" and context_note:
            type_instruction = f"\n   ⚠️ CONTEXT SECTION (keep brief, 1-2 paragraphs): {context_note}"
        elif section_type == "context":
            type_instruction = f"\n   ⚠️ CONTEXT SECTION (keep brief, 1-2 paragraphs)"

        # Entities
        entities = section.get("entities", [])
        entity_parts = []
        covered_parts = []
        for e in entities[:6]:
            if isinstance(e, dict):
                name = e.get("name", "")
                desc = e.get("description", "")
                if e.get("_covered_in_h2"):
                    covered_parts.append(name)
                elif desc:
                    entity_parts.append(f"{name} ({desc[:60]})")
                else:
                    entity_parts.append(name)
        entities_str = "; ".join(entity_parts) if entity_parts else "None"
        covered_str = f"\n   ⚠️ Already defined in parent H2 (use name only, do NOT redefine): {', '.join(covered_parts)}" if covered_parts else ""

        # Facts
        facts = section.get("facts", [])
        fact_parts = [f.get("text", "")[:100] for f in facts[:6] if isinstance(f, dict) and f.get("text")]
        facts_str = "\n      • ".join(fact_parts) if fact_parts else "None"

        # Relationships
        relationships = section.get("relationships", [])
        rel_parts = []
        for r in relationships[:4]:
            if isinstance(r, dict):
                src, tgt = r.get("from", ""), r.get("to", "")
                if src and tgt:
                    rel_parts.append(f"{src} → {tgt} ({r.get('type', 'related')})")
        relationships_str = "; ".join(rel_parts) if rel_parts else "None"

        # Inline ideations (tabele, checklisty)
        inline_ideations = section.get("_inline_ideations", section.get("ideations", []))
        ideation_parts = []
        for idea in inline_ideations[:3]:
            if isinstance(idea, dict):
                fmt = idea.get("_format_instruction", "")
                desc = idea.get("description", "")[:60]
                if fmt:
                    ideation_parts.append(fmt)
                elif desc:
                    ideation_parts.append(desc)
        ideations_str = "\n      • ".join(ideation_parts) if ideation_parts else "None"

        # H3
        h3s = section.get("h3s", [])
        h3_info = ""
        for h3 in h3s:
            if isinstance(h3, dict):
                h3_header = h3.get("header", "")
                all_questions.append(h3_header)
                h3_pf = h3.get("_passage_format", {})
                h3_format_line = f" → FORMAT: {h3_pf.get('format', 'Direct Answer')}" if h3_pf else ""
                h3_info += f"\n   H3: <h3>{h3_header}</h3>{h3_format_line}"

        sections_info += f"""
SECTION {i}: <{html_tag}>{header}</{html_tag}>{h3_info}{passage_instruction}{type_instruction}
   Entities: {entities_str}{covered_str}
   Facts:
      • {facts_str}
   Relationships: {relationships_str}
   Ideations (generate as HTML):
      • {ideations_str}
---"""

    # --- Outline ---
    outline_context = build_outline_context(all_sections, current_section_index)

    # --- PASSAGE BLUEPRINT ---
    passage_blueprint = """### PASSAGE BLUEPRINT (5 elements — apply to EVERY H2 and H3)
Each passage MUST contain these 5 elements IN THIS ORDER:

1. CONTEXT SENTENCE (1-2 sentences)
   → Name the MAIN ENTITY in the first sentence
   → Establish: who/what/for whom/when
   → This sentence should work as a standalone answer

2. CORE EXPLANATION (3-5 sentences)
   → The main content — explanation, steps, analysis
   → Short sentences, active voice, clear transitions
   → One topic per paragraph, zero digressions

3. SUPPORTING EVIDENCE (1 element)
   → A specific statistic with number OR
   → A concrete fact from the provided data OR
   → A comparison with a named alternative

4. IDEATION CONTENT (if provided)
   → Generate tables as HTML <table>
   → Generate checklists as HTML <ul>
   → Follow the format instruction from Ideations field

5. MICRO-SUMMARY (1 sentence)
   → Restate the key point in simple language
   → Should work as a standalone answer to the heading question
   → ONLY for FULL sections (skip for CONTEXT sections)"""

    # --- REGUŁY JAKOŚCIOWE ---
    bluf_rule = """### BLUF — BOTTOM LINE UP FRONT
The CONTEXT SENTENCE (element 1 of blueprint) IS the BLUF.
It answers the heading's question IMMEDIATELY.
BAD: "There are many factors..." → GOOD: "7-9 hours of sleep lowers cortisol by 20-30%."
FORBIDDEN: Building up to a conclusion. State conclusion FIRST."""

    no_filler_rule = """### NO FILLER
TEST: Delete the sentence. Did the text lose information? NO → it's filler.
EVERY sentence must contain: specific fact, number, comparison, example, or actionable step.
FORBIDDEN: "It's worth noting...", "Let's take a closer look...", "In this section we will discuss..." """

    no_duplicate_rule = """### NO DUPLICATE
Each fact appears EXACTLY ONCE in the entire article.
CRITICAL: See the FULL ARTICLE OUTLINE below — it shows which facts belong to OTHER sections.
INSTEAD OF REPEATING: use back-reference ("the mechanism described above...") or skip entirely."""

    h2_h3_rule = """### H2/H3 HIERARCHY
H2 = comprehensive overview (FULL: 3-5 paragraphs, CONTEXT: 1-2 paragraphs)
H3 = direct answer + NEW angle (1-2 paragraphs). NEVER restates H2 content."""

    # --- ENTITY CLARITY ---
    entity_rules = """### ENTITY CLARITY RULES
1. Name the main entity in the FIRST sentence of each section (not "this supplement" but "ashwagandha")
2. When first defining an entity: [Entity name] + [what it is] + [one distinguishing attribute]
   Example: "Ashwagandha, an adaptogenic herb, can lower cortisol by 11-32%."
3. After first definition: use just the name, never re-explain
4. NEVER replace entity names with pronouns in first 2 sentences
5. Use at least 2 anchoring types per passage:
   - Feature anchor: [Entity] + [measurable attribute] ("Ashwagandha lowers cortisol by 11-32%")
   - Comparative anchor: [Entity A] vs [Entity B] ("Unlike HIIT, moderate walking...")
   - Situational anchor: [Entity] + [target group] ("For people over 40...")
   - Temporal anchor: [Entity] + [time/version/year] ("After 8 weeks of supplementation...")
   - Causal anchor: [Entity] + [cause] + [effect] ("Chronic stress raises baseline cortisol by 50-80%")"""

    # --- FORMATTING ---
    formatting_rules = """### FORMATTING RULES
1) Output: <h2>, <h3>, <p>, <table>, <ul>/<li> only. NO <h1>.
2) Paragraphs: MAX 3-4 sentences per <p> tag.
3) Tables: use <table> for comparisons, specifications, multi-attribute data.
4) Lists: use <ul>/<li> for 3+ items with attributes (checklists, steps, symptoms).
5) Active voice: "[Entity] does X" not "X is done by [entity]".
6) Sentence structure: Subject + Active Verb + Object + Context.
7) Professional voice, no marketing language.
8) NO abstract openings ("In today's world...", "It's important to understand...")."""

    # --- BRIDGE SENTENCES (Passage Networks) ---
    # Tylko dla bloków 2+ — model łączy sekcje mostami kontekstowymi.
    # Max 2-3 mosty na cały artykuł, tylko gdy sekcje dzielą encje.
    bridge_instruction = ""
    if block_number > 1:
        bridge_instruction = """
### BRIDGE SENTENCES (optional, max 1 per block)
If an entity defined earlier in another section also fits the context of the current section, you MAY reference it with a 1-sentence bridge:
- "The previously mentioned [entity] also plays a role in..."
- "Beyond [previous topic], [entity] also affects..."
DO NOT: redefine the entity — use only its name. Skip the bridge if no earlier entity fits."""

    # --- ERROR AVOIDANCE (4 rules from microsemantics) ---
    error_avoidance = """### ERROR AVOIDANCE
1) NO Wall of Words: Every section MUST have clear visual breaks (paragraphs, lists, tables).
2) NO Muddled Meaning: One topic per paragraph. If drifting → new paragraph.
3) NO Vanilla Entity: NEVER say "this supplement", "this method" — always use the entity NAME.
4) NO Over-Stylized Writing: No metaphors without subject. No sentences >25 words. Logic must be explicit."""

    # --- ZŁÓŻ PROMPT ---
    prompt = f"""Write block {block_number} of article about: {keyword}
Article title: {h1_title}

{passage_blueprint}

{bluf_rule}

{no_filler_rule}

{no_duplicate_rule}

{h2_h3_rule}

{entity_rules}

{formatting_rules}
{bridge_instruction}
{error_avoidance}

DATA USAGE:
- FACTS: Incorporate ALL provided facts naturally. Each appears ONCE in the entire article.
- ENTITIES: Define ONCE at first mention with name + category + attribute. Later = just name.
- RELATIONSHIPS: Show as causal/comparative anchors in text.
- IDEATIONS: Generate as HTML (tables, checklists). Follow format instructions.
- PASSAGE FORMAT: Follow the specific format assigned to each section header.

{outline_context}

SECTIONS TO WRITE NOW:
{sections_info}

{f"PYTANIA, NA KTÓRE TRZEBA ODPOWIEDZIEĆ:{chr(10)}" + chr(10).join([f"- {q}" for q in all_questions]) if all_questions else ""}

Write in {language}.
Apply PASSAGE BLUEPRINT to every section.
Follow PASSAGE FORMAT instructions per section.
Name entities in first sentence. Use ALL facts. NO FILLER. NO DUPLICATES."""

    return prompt


def generate_block(sections_batch: List[Dict], generator: DraftGenerator,
                   keyword: str, h1_title: str, lang: str,
                   block_number: int,
                   all_sections: List[Dict], current_section_index: int) -> bool:
    """Generuje jeden blok tekstu z response ID chaining."""

    section = sections_batch[0]
    total_entities = sum(len(s.get("entities", [])) for s in sections_batch)
    total_facts = sum(len(s.get("facts", [])) for s in sections_batch)
    total_h3s = sum(len(s.get("h3s", [])) for s in sections_batch)
    section_type = section.get("section_type", "full")
    trigger = section.get("_passage_format", {}).get("trigger", "?")

    print(f"\n📝 Blok {block_number} [{section_type}|{trigger}] ({total_h3s} H3, {total_entities} encji, {total_facts} faktów)")

    prompt = build_prompt(sections_batch, keyword, h1_title, lang, block_number,
                          all_sections, current_section_index)

    if DEBUG_MODE:
        print(f"\n--- PROMPT (blok {block_number}) ---")
        print(prompt[:1000] + "...")
        print("--- END PROMPT ---\n")

    try:
        call_params = {
            "model": MODEL_NAME,
            "input": prompt,
        }

        # Parametry reasoning — aktywne gdy USE_REASONING_PARAMS = True
        # Wpływają na: głębokość myślenia (effort) i objętość tekstu (verbosity)
        if USE_REASONING_PARAMS:
            call_params["reasoning"] = {"effort": REASONING_EFFORT}
            call_params["text"] = {"verbosity": TEXT_VERBOSITY}

        prev_id = generator.get_last_response_id()
        if prev_id:
            call_params["previous_response_id"] = prev_id
            print(f"   🔗 Chaining: previous_response_id = {prev_id[:20]}...")

        response = client.responses.create(**call_params)
        content = re.sub(r"<p>\s*</p>", "", response.output_text)

        generator.blocks.append(content)
        generator.response_ids.append(getattr(response, "id", str(time.time())))
        generator.total_length += len(content)

        print(f"   ✅ Wygenerowano: {len(content)} znaków (łącznie: {generator.total_length})")
        return True

    except Exception as e:
        print(f"   ❌ Błąd generowania: {e}")
        return False


# =====================================================
# ETAP 6 – SKŁADANIE I ZAPIS FINALNEGO ARTYKUŁU
# =====================================================

def assemble_article(h1_title: str, generator: DraftGenerator) -> str:
    """Składa artykuł z bloków. Zaczyna od <h1>."""
    parts = [f"<h1>{h1_title}</h1>"]
    parts.extend(generator.blocks)
    article = "\n\n".join(parts)
    article = re.sub(r"<p>\s*</p>", "", article)
    article = re.sub(r"\n{3,}", "\n\n", article)
    return article


def save_article(article: str, filepath: str):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(article)
    print(f"\n💾 Zapisano: {filepath} ({len(article)} znaków)")


def save_image_prompts(prompts: List[Dict], filepath: str):
    if not prompts:
        return
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(prompts, f, ensure_ascii=False, indent=2)
    print(f"💾 Prompty infografik: {filepath} ({len(prompts)} promptów)")


# =====================================================
# GŁÓWNA FUNKCJA
# =====================================================

def main():
    print("\n🚀 START: Generowanie draftu treści\n")

    # ETAP 1
    print("=" * 40)
    print("ETAP 1: Wczytanie danych z dystrybucji")
    print("=" * 40)
    data = load_distribution(INPUT_FILE)
    if not data:
        return
    project = data["project"]
    sections = data["sections"]

    # ETAP 2
    print("\n" + "=" * 40)
    print("ETAP 2: Deduplikacja faktów H3 vs H2")
    print("=" * 40)
    sections = deduplicate_h3_facts(sections)

    # ETAP 3
    print("\n" + "=" * 40)
    print("ETAP 3: Heading Trigger → Passage Format")
    print("=" * 40)
    sections = analyze_all_sections(sections, project.get("lang", "pl"))
    sections, image_prompts = prepare_ideations(sections)

    # ETAP 4
    print("\n" + "=" * 40)
    print("ETAP 4: Podział na bloki generowania")
    print("=" * 40)
    blocks = create_generation_blocks(sections)

    # ETAP 5
    print("\n" + "=" * 40)
    print("ETAP 5: Generowanie bloków (LLM)")
    print("=" * 40)
    generator = DraftGenerator()

    for i, block_sections in enumerate(blocks):
        if not generate_block(block_sections, generator,
                              project["keyword"], project["h1_title"],
                              project["lang"], i + 1,
                              all_sections=sections, current_section_index=i):
            print(f"\n❌ Błąd w bloku {i+1}, przerywam.")
            return
        if i < len(blocks) - 1:
            time.sleep(0.8)

    # ETAP 6
    print("\n" + "=" * 40)
    print("ETAP 6: Składanie i zapis artykułu")
    print("=" * 40)
    article = assemble_article(project["h1_title"], generator)
    save_article(article, OUTPUT_FILE)
    save_image_prompts(image_prompts, OUTPUT_IMAGE_PROMPTS)

    # Podsumowanie
    print("\n" + "=" * 60)
    print("📊 PODSUMOWANIE:")
    print(f"   • Bloków: {len(generator.blocks)}")
    print(f"   • Długość: {generator.total_length} znaków")
    print(f"   • Plik: {OUTPUT_FILE}")
    if image_prompts:
        print(f"   • Prompty infografik: {OUTPUT_IMAGE_PROMPTS} ({len(image_prompts)})")
    print("=" * 60)


if __name__ == "__main__":
    main()