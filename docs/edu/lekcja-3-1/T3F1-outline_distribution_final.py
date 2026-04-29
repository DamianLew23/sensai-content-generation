#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
OUTLINE & DISTRIBUTION - Wersja plikowa (lekcja)
=====================================================
Buduje outline artykułu z danych Query Fan-Out,
potem dystrybuuje graf wiedzy na sekcje.

WEJŚCIE:
  • Metadane projektu → ZMIENNE W KODZIE (sekcja KONFIGURACJA)
  • input_query_fan_out.json  → micro_areas z Query Fan-Out
  • input_knowledge_graph.json → graf wiedzy

WYJŚCIE:
  • output_outline.json       → wygenerowany outline
  • output_distribution.json  → outline + dane KG per sekcja
=====================================================
"""

import os
import json
import re
from openai import OpenAI
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")


# =====================================================
# KONFIGURACJA - METADANE PROJEKTU
# =====================================================
# Tutaj definiujesz dane projektu bezpośrednio w kodzie.
# Nie ma osobnego pliku JSON - łatwiej modyfikować na lekcji.

PROJECT_CONFIG = {
    # Główne słowo kluczowe artykułu
    "keyword": "jak obniżyć kortyzol po 40tce",
    
    # Tytuł H1 artykułu
    "h1_title": "Jak obniżyć kortyzol po 40tce? Sprawdzone metody na stres",
    
    # Język artykułu: "en", "pl", "de", "fr"
    "lang": "pl",
    
    # INTENCJA WYSZUKIWANIA - kluczowe dla sortowania sekcji!
    # Możliwe wartości (z Query Fan-Out):
    #   • "Definicyjna"    - Czym jest X? Co to znaczy? Jaka jest rola/funkcja?
    #   • "Problemowa"     - Dlaczego mam problem? Jakie są objawy/przyczyny?
    #   • "Instrukcyjna"   - Jak to zrobić? Jakie kroki podjąć?
    #   • "Decyzyjna"      - Co wybrać? Która opcja jest lepsza?
    #   • "Diagnostyczna"  - Jak sprawdzić? Jakie badania? Jak zinterpretować?
    #   • "Porównawcza"    - Czym się różnią A i B? Co jest skuteczniejsze?
    #
    # Ta intencja decyduje, które sekcje idą PIERWSZE w artykule.
    # Jeśli intencja = "Instrukcyjna", to sekcje z poradami będą na początku.
    "search_intent": "Instrukcyjna",
    
    # Opcjonalne - dla artykułów afiliacyjnych
    "is_affiliate": False,
    "aff_product_name": None,
}

# Ścieżki plików
INPUT_QUERY_FAN_OUT = "input_query_fan_out.json"
INPUT_KNOWLEDGE_GRAPH = "input_knowledge_graph.json"
OUTPUT_OUTLINE = "output_outline.json"
OUTPUT_DISTRIBUTION = "output_distribution.json"

# Konfiguracja LLM
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

MODEL_NAME = "gpt-4.1"
TEMPERATURE = 0.3

DEBUG_MODE = True

print("=" * 60)
print("📝 OUTLINE & DISTRIBUTION")
print(f"   • Keyword: {PROJECT_CONFIG['keyword']}")
print(f"   • Intencja: {PROJECT_CONFIG['search_intent']}")
print(f"   • Model: {MODEL_NAME}")
print("=" * 60)


# =====================================================
# WCZYTYWANIE PLIKÓW JSON
# =====================================================

def load_json_file(filepath: str) -> Dict:
    """Wczytaj plik JSON."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"   ✅ Wczytano: {filepath}")
        return data
    except FileNotFoundError:
        print(f"   ❌ Nie znaleziono: {filepath}")
        return {}
    except json.JSONDecodeError as e:
        print(f"   ❌ Błąd JSON w {filepath}: {e}")
        return {}


def load_inputs() -> tuple:
    """Wczytuje pliki wejściowe."""
    print("\n📂 Wczytywanie danych wejściowych")
    print("-" * 40)
    
    query_fan_out = load_json_file(INPUT_QUERY_FAN_OUT)
    knowledge_graph = load_json_file(INPUT_KNOWLEDGE_GRAPH)
    
    if not query_fan_out.get("micro_areas"):
        print("   ❌ Brak 'micro_areas' w input_query_fan_out.json!")
        return None, None
    
    print(f"\n   📦 Micro areas: {len(query_fan_out['micro_areas'])}")
    print(f"   🧠 Encje: {len(knowledge_graph.get('entities', []))}")
    print(f"   📝 Fakty: {len(knowledge_graph.get('facts', []))}")
    
    return query_fan_out, knowledge_graph


# =====================================================
# ETAP 2: SORTOWANIE MICRO AREAS WG INTENCJI
# =====================================================
"""
DLACZEGO TO WAŻNE?

Intencja wyszukiwania (search intent) mówi nam, CZEGO użytkownik szuka.
Artykuł powinien od razu odpowiadać na tę potrzebę.

Przykład:
- Keyword: "history of painkillers"
- Intencja: Definitional (użytkownik chce wiedzieć CO TO / JAK BYŁO)

Micro areas z Query Fan-Out mają różne intencje:
  • "Ancient pain relief methods" → Definitional ★
  • "Discovery of aspirin" → Definitional ★
  • "Opioids vs non-opioids" → Comparative
  • "Modern developments" → Informational

Sortowanie:
  1. NAJPIERW: sekcje z intencją = primary intent (Definitional)
  2. POTEM: pozostałe sekcje

Efekt: Artykuł zaczyna się od tego, czego użytkownik szuka!
"""

def sort_areas_by_intent(micro_areas: List[Dict], primary_intent: str) -> List[Dict]:
    """
    Sortuje micro_areas: intencja główna PIERWSZA, potem reszta.
    Zachowuje oryginalną kolejność w ramach każdej grupy.
    """
    print("\n📊 SORTOWANIE MICRO AREAS WG INTENCJI")
    print("-" * 40)
    print(f"   🎯 Intencja główna: {primary_intent}")
    
    primary = []
    secondary = []
    
    for area in micro_areas:
        area_intent = area.get("intent", "")
        if area_intent == primary_intent:
            primary.append(area)
        else:
            secondary.append(area)
    
    print(f"\n   ★ Pasujące do intencji głównej: {len(primary)}")
    print(f"   ○ Pozostałe: {len(secondary)}")
    
    sorted_areas = primary + secondary
    
    # Podgląd kolejności po sortowaniu
    print(f"\n   📝 Kolejność sekcji po sortowaniu:")
    for i, area in enumerate(sorted_areas, 1):
        marker = "★" if area.get("intent") == primary_intent else "○"
        paa_count = len(area.get("paa_questions", []))
        print(f"      {i}. {marker} [{area.get('intent', '?')}] {area.get('area', '?')} ({paa_count} PAA)")
    
    return sorted_areas


# =====================================================
# LLM - WYWOŁANIE MODELU
# =====================================================

def call_llm(prompt: str) -> Optional[str]:
    """Wywołanie modelu LLM z wymuszeniem JSON."""
    try:
        full_prompt = f"{prompt}\n\nReturn ONLY valid JSON, no additional text."
        
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": full_prompt}],
            temperature=TEMPERATURE,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content
    
    except Exception as e:
        logging.error(f"Błąd LLM: {e}")
        return None


def parse_llm_json(result: str) -> Optional[Dict]:
    """Wyciąga JSON z odpowiedzi LLM."""
    if not result:
        return None
    json_match = re.search(r"\{.*\}", result, re.DOTALL)
    if not json_match:
        print("   ❌ Nie znaleziono JSON w odpowiedzi")
        return None
    try:
        return json.loads(json_match.group())
    except json.JSONDecodeError as e:
        print(f"   ❌ Błąd parsowania JSON: {e}")
        return None


# =====================================================
# ETAP 3: GENEROWANIE OUTLINE (LLM)
# =====================================================

OUTLINE_PROMPT = """# Role
You are an expert content architect. Create an article outline from semantic areas.

# Context
- Main keyword: "{keyword}"
- H1 title: "{h1_title}"
- Language: {language}
- Primary search intent: {primary_intent}

# Input: MICRO Areas (already sorted by priority)
{areas_json}

# RULES

## Rule 1: Each AREA = one H2
- Create engaging H2 header from area name
- Header in {language}
- Make it engaging, not just copy of area name

## Rule 2: Each PAA question = one H3
- If area has PAA questions → each becomes H3
- If area has NO PAA → H2 has no H3s (that's fine!)

## Rule 3: H3 Format Decision
For each PAA, decide:

**USE AS-IS (question format)** when:
- PAA is clear, specific question
- Works naturally as a section header
→ H3 = PAA question (maybe minor style edit)

**CONVERT TO CONTEXT** when:
- PAA is awkward as header
- Too long or convoluted
→ H3 = contextual header that ANSWERS the PAA

## Rule 4: SENTENCE CASE for all headers
Only first word capitalized (+ proper nouns, names, acronyms).

# Output Format
Return JSON:
{{
  "outline": [
    {{
      "type": "intro",
      "order": 0,
      "header": null,
      "source_area": null,
      "h3s": []
    }},
    {{
      "type": "h2",
      "order": 1,
      "header": "Engaging H2 header in sentence case",
      "source_area": "Original area name",
      "source_intent": "Definitional",
      "h3s": [
        {{
          "header": "H3 header in sentence case",
          "format": "question|context",
          "source_paa": "Original PAA question"
        }}
      ]
    }}
  ]
}}"""


def generate_outline(sorted_areas: List[Dict]) -> Optional[Dict]:
    """Generuje outline artykułu."""
    print("\n🤖 GENEROWANIE OUTLINE")
    print("-" * 40)
    
    keyword = PROJECT_CONFIG["keyword"]
    h1_title = PROJECT_CONFIG.get("h1_title", keyword)
    lang = PROJECT_CONFIG.get("lang", "en")
    primary_intent = PROJECT_CONFIG.get("search_intent", "Definicyjna")
    
    lang_names = {"pl": "Polish", "en": "English", "de": "German", "fr": "French"}
    language = lang_names.get(lang, "English")
    
    # Przygotuj areas do promptu
    areas_for_prompt = []
    for i, area in enumerate(sorted_areas):
        areas_for_prompt.append({
            "order": i + 1,
            "area": area.get("area", ""),
            "intent": area.get("intent", ""),
            "question": area.get("question", ""),
            "paa_questions": area.get("paa_questions", []),
        })
    
    prompt = OUTLINE_PROMPT.format(
        keyword=keyword,
        h1_title=h1_title,
        language=language,
        primary_intent=primary_intent,
        areas_json=json.dumps(areas_for_prompt, ensure_ascii=False, indent=2),
    )
    
    print(f"   📤 Wysyłam {len(areas_for_prompt)} areas do {MODEL_NAME}...")
    
    result = call_llm(prompt)
    outline_data = parse_llm_json(result)
    
    if not outline_data:
        return None
    
    outline = outline_data.get("outline", [])
    h2_count = sum(1 for s in outline if s.get("type") == "h2")
    h3_count = sum(len(s.get("h3s", [])) for s in outline)
    print(f"   ✅ Outline: {h2_count} sekcji H2, {h3_count} nagłówków H3")
    
    return outline_data


def display_outline(outline_data: Dict):
    """Wyświetla outline."""
    outline = outline_data.get("outline", [])
    keyword = PROJECT_CONFIG["keyword"]
    
    print(f"\n{'=' * 60}")
    print(f"📄 OUTLINE: {keyword}")
    print("=" * 60)
    
    for section in outline:
        order = section.get("order", 0)
        section_type = section.get("type", "h2")
        header = section.get("header") or "[INTRO]"
        h3s = section.get("h3s", [])
        
        if section_type == "intro":
            print(f"\n   {order}. 📖 INTRO")
        else:
            intent = section.get("source_intent", "")
            print(f"\n   {order}. 📌 H2: {header} [{intent}]")
        
        for h3 in h3s:
            icon = "❓" if h3.get("format") == "question" else "📝"
            print(f"      {icon} H3: {h3.get('header', '')}")
    
    print("=" * 60)


# =====================================================
# ETAP 4: DYSTRYBUCJA GRAFU WIEDZY NA SEKCJE
# =====================================================

DISTRIBUTION_PROMPT = """# Role
You are a content distribution expert. Assign knowledge graph data to article sections.

# Article Outline
{outline_json}

# Data to Distribute

## Entities ({entity_count} total)
{entities_json}

## Facts ({fact_count} total)
{facts_json}

## Ideations ({ideation_count} total)
{ideations_json}

## Relationships ({relationship_count} total)
{relationships_json}

## Data Markers ({data_marker_count} total)
{data_markers_json}

# Your Task
Assign each piece of data to the MOST RELEVANT section (by order number).

**RULES:**
1. NOT everything must be used - only assign if TRULY relevant
2. Each item can go to ONE section only (no duplicates)
3. INTRO (order 0): Only 2-3 key entities, 1-2 key facts
4. Match by semantic relevance
5. Aim for 60-80% coverage (not 100%)

# Output Format
Return JSON:
{{
  "distribution": {{
    "0": {{
      "entity_indices": [0, 1],
      "fact_indices": [0],
      "ideation_indices": [],
      "relationship_indices": [],
      "data_marker_indices": []
    }},
    "1": {{
      "entity_indices": [2, 3],
      "fact_indices": [1, 2],
      "ideation_indices": [0],
      "relationship_indices": [0],
      "data_marker_indices": []
    }}
  }},
  "unused": {{
    "entity_indices": [],
    "fact_indices": [],
    "ideation_indices": [],
    "relationship_indices": [],
    "data_marker_indices": []
  }}
}}"""


def prepare_items_for_prompt(items: List, max_items: int = 100) -> str:
    """Przygotowuje listę z indeksami do promptu."""
    if not items:
        return "[]"
    truncated = items[:max_items]
    indexed = [{"index": i, **(item if isinstance(item, dict) else {"value": item})} 
               for i, item in enumerate(truncated)]
    return json.dumps(indexed, ensure_ascii=False, indent=2)


def distribute_knowledge_graph(outline: List[Dict], kg: Dict) -> Optional[Dict]:
    """Dystrybuuje dane KG na sekcje outline."""
    print("\n📦 DYSTRYBUCJA GRAFU WIEDZY")
    print("-" * 40)
    
    entities = kg.get("entities", [])
    facts = kg.get("facts", [])
    ideations = kg.get("ideations", [])
    relationships = kg.get("relationships", [])
    data_markers = kg.get("data_markers", [])
    
    print(f"   📊 Dane do dystrybucji:")
    print(f"      • Encje: {len(entities)}")
    print(f"      • Fakty: {len(facts)}")
    print(f"      • Ideacje: {len(ideations)}")
    print(f"      • Relacje: {len(relationships)}")
    print(f"      • Data markers: {len(data_markers)}")
    
    if not any([entities, facts, ideations, relationships, data_markers]):
        print("   ⚠️ Brak danych do dystrybucji")
        return None
    
    # Outline do promptu (uproszczony)
    outline_for_prompt = [{
        "order": s.get("order"),
        "type": s.get("type"),
        "header": s.get("header") or "INTRO",
        "h3s": [h3.get("header") for h3 in s.get("h3s", [])],
    } for s in outline]
    
    prompt = DISTRIBUTION_PROMPT.format(
        outline_json=json.dumps(outline_for_prompt, ensure_ascii=False, indent=2),
        entities_json=prepare_items_for_prompt(entities),
        entity_count=len(entities),
        facts_json=prepare_items_for_prompt(facts),
        fact_count=len(facts),
        ideations_json=prepare_items_for_prompt(ideations),
        ideation_count=len(ideations),
        relationships_json=prepare_items_for_prompt(relationships),
        relationship_count=len(relationships),
        data_markers_json=prepare_items_for_prompt(data_markers),
        data_marker_count=len(data_markers),
    )
    
    print(f"\n   🤖 Wysyłam do {MODEL_NAME}...")
    
    result = call_llm(prompt)
    dist_result = parse_llm_json(result)
    
    if not dist_result:
        return None
    
    # Zamień indeksy na faktyczne dane
    dist_indices = dist_result.get("distribution", {})
    final_distribution = {}
    total_entities = 0
    total_facts = 0
    
    for order_str, indices in dist_indices.items():
        order = int(order_str)
        sec_entities = [entities[i] for i in indices.get("entity_indices", []) if i < len(entities)]
        sec_facts = [facts[i] for i in indices.get("fact_indices", []) if i < len(facts)]
        sec_ideations = [ideations[i] for i in indices.get("ideation_indices", []) if i < len(ideations)]
        sec_relationships = [relationships[i] for i in indices.get("relationship_indices", []) if i < len(relationships)]
        sec_data_markers = [data_markers[i] for i in indices.get("data_marker_indices", []) if i < len(data_markers)]
        
        total_entities += len(sec_entities)
        total_facts += len(sec_facts)
        
        final_distribution[order] = {
            "entities": sec_entities,
            "facts": sec_facts,
            "ideations": sec_ideations,
            "relationships": sec_relationships,
            "data_markers": sec_data_markers,
        }
    
    coverage = round((total_entities + total_facts) / max(len(entities) + len(facts), 1) * 100)
    
    print(f"\n   ✅ Dystrybucja zakończona:")
    print(f"      • Encje: {total_entities}/{len(entities)}")
    print(f"      • Fakty: {total_facts}/{len(facts)}")
    print(f"      • Pokrycie: ~{coverage}%")
    
    return {
        "distribution": final_distribution,
        "stats": {
            "entities_used": total_entities,
            "entities_total": len(entities),
            "facts_used": total_facts,
            "facts_total": len(facts),
            "coverage_percent": coverage,
        },
    }


# =====================================================
# ZAPIS WYNIKÓW
# =====================================================

def save_results(outline_data: Dict, distribution: Optional[Dict]):
    """Zapisuje wyniki do plików JSON."""
    print("\n💾 ZAPIS WYNIKÓW")
    print("-" * 40)
    
    # 1. Outline
    with open(OUTPUT_OUTLINE, "w", encoding="utf-8") as f:
        json.dump(outline_data, f, ensure_ascii=False, indent=2)
    print(f"   ✅ {OUTPUT_OUTLINE}")
    
    # 2. Distribution (outline + dane KG per sekcja)
    if distribution:
        outline = outline_data.get("outline", [])
        dist_data = distribution.get("distribution", {})
        
        sections_with_data = []
        for section in outline:
            order = section.get("order", 0)
            sec_dist = dist_data.get(order, {})
            
            sections_with_data.append({
                "type": section.get("type"),
                "order": order,
                "header": section.get("header"),
                "source_area": section.get("source_area"),
                "source_intent": section.get("source_intent"),
                "h3s": section.get("h3s", []),
                "entities": sec_dist.get("entities", []),
                "facts": sec_dist.get("facts", []),
                "ideations": sec_dist.get("ideations", []),
                "relationships": sec_dist.get("relationships", []),
                "data_markers": sec_dist.get("data_markers", []),
            })
        
        output = {
            "project": PROJECT_CONFIG,
            "sections": sections_with_data,
            "stats": distribution.get("stats", {}),
        }
        
        with open(OUTPUT_DISTRIBUTION, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"   ✅ {OUTPUT_DISTRIBUTION}")


# =====================================================
# MAIN
# =====================================================

def main():
    print("\n🚀 START\n")
    
    # Wczytaj dane
    query_fan_out, knowledge_graph = load_inputs()
    if query_fan_out is None:
        return
    
    micro_areas = query_fan_out["micro_areas"]
    primary_intent = PROJECT_CONFIG["search_intent"]
    
    # Etap 2: Sortowanie
    sorted_areas = sort_areas_by_intent(micro_areas, primary_intent)
    
    # Etap 3: Outline
    outline_data = generate_outline(sorted_areas)
    if not outline_data:
        print("\n❌ Nie udało się wygenerować outline")
        return
    
    display_outline(outline_data)
    
    # Etap 4: Dystrybucja
    distribution = None
    if knowledge_graph:
        outline = outline_data.get("outline", [])
        distribution = distribute_knowledge_graph(outline, knowledge_graph)
    
    # Zapis
    save_results(outline_data, distribution)
    
    print(f"\n{'=' * 60}")
    print(f"✅ ZAKOŃCZONO")
    print("=" * 60)


if __name__ == "__main__":
    main()