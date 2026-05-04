#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
ARTICLE CHECK – Wersja edukacyjna (lekcja)
=====================================================
Optymalizacja copywriterska artykułu wzbogaconego
o źródła. Stosuje reguły redukujące typowe "AI-izmy"
i chroni dane (liczby, daty, źródła) przed modelem.

WEJŚCIE:
  • output_enriched.html – artykuł ze źródłami (z etapu enrichment)

WYJŚCIE:
  • output_article_check.html – artykuł po optymalizacji copywriterskiej
  • output_article_check_report.json – raport optymalizacji

OCHRONA DANYCH (Hybrid):
  • Placeholdery [[SRC_x]] – cytaty źródłowe (model nie widzi treści)
  • Spany <span data-token-id="NUM_x"> – liczby/daty (model widzi w kontekście)

REGUŁY COPYWRITERSKIE:
  • A – Zero pierwszej osoby
  • C – Jedna definicja, jedno miejsce
  • D – Porządkowanie nawiasów (źródła wyłączone)
  • E – Tonowanie śmiałych obietnic
  • F – Redukcja 2. osoby i trybu rozkazującego
  • I – Upraszczanie opisów technicznych
=====================================================
"""

import os
import re
import json
import uuid
from typing import Dict, List, Tuple

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ Zainstaluj: pip install beautifulsoup4")
    raise SystemExit(1)

try:
    from openai import OpenAI
except ImportError:
    print("❌ Zainstaluj: pip install openai")
    raise SystemExit(1)


# ===== KONFIGURACJA =====

INPUT_FILE = "output_enriched.html"
OUTPUT_FILE = "output_article_check.html"
REPORT_FILE = "output_article_check_report.json"

# Model LLM (claude-4.5-sonnet / gpt-5.2 — zamiennie, do wyboru)
MODEL_NAME = "gpt-5.2"

# Docelowa długość artykułu (znaki). 0 = bez limitu.
TARGET_LENGTH = 0

# Tolerancja długości (+20%)
UPPER_TOLERANCE = 0.20

# Parametry modelu
TEMPERATURE = 0.5
MAX_OUTPUT_TOKENS = 16000

# Debug
DEBUG_MODE = True

# Klucz API
if not os.environ.get("OPENAI_API_KEY"):
    print("❌ Ustaw zmienną środowiskową OPENAI_API_KEY")
    raise SystemExit(1)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

print("=" * 60)
print("🔍 ARTICLE CHECK – wersja edukacyjna")
print(f"   • Model: {MODEL_NAME}")
print(f"   • Input: {INPUT_FILE}")
print(f"   • Output: {OUTPUT_FILE}")
print(f"   • Reguły: A, C, D, E, F, I")
print(f"   • Ochrona: Hybrid (placeholdery SRC + spany NUM/DAT)")
print("=" * 60)


# =====================================================
# REGEX – WZORCE DO OCHRONY DANYCH
# =====================================================
# Każdy regex odpowiada za jeden typ wrażliwych danych.
# Kolejność użycia ma znaczenie — patrz: tokenize_hybrid()

# Cytaty źródłowe: "(Source: WHO, 2024 — who.int/...)" lub "(Źródło: ...)"
# Obsługuje zagnieżdżone nawiasy: (Source: StatPearls (NIH/NLM), 2026 — url)
SOURCE_CITATION_RE = re.compile(
    r'\((?:Source|Źródło):\s*(?:[^()]*|\([^()]*\))*\)',
    re.IGNORECASE
)

# Liczby z jednostkami: "20%", "500 mg", "3,5 mln", "10 tys."
NUM_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:%|mln|mld|tys\.?|k|M|B|zł|PLN|USD|EUR|mg|g|kg|ml|μg|mcg|IU|kcal)?\b",
    re.IGNORECASE
)

# Daty: "2024-01-15", "12 marca 2024", "2024"
DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ž]+\s+\d{4}|\d{4})\b"
)

# DOI: "10.1016/j.cell.2024.01.001"
DOI_RE = re.compile(
    r'\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b',
    re.IGNORECASE
)

# Referencje w nawiasach kwadratowych: "[1]", "[WHO-2024]"
BRACKET_REF_RE = re.compile(
    r"\[(?:\d{1,3}|[A-Za-z0-9-_]+)\]"
)


# =====================================================
# ETAP 1 – WCZYTANIE ARTYKUŁU
# =====================================================

def load_article(filepath: str) -> str:
    """Wczytuje artykuł HTML z pliku."""
    if not os.path.exists(filepath):
        print(f"❌ Plik nie istnieje: {filepath}")
        raise SystemExit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read().strip()

    if not html:
        print(f"❌ Plik jest pusty: {filepath}")
        raise SystemExit(1)

    # Wyczyść puste paragrafy
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all("p"):
        if not tag.get_text(strip=True):
            tag.decompose()

    cleaned = str(soup)
    print(f"\n📄 Wczytano artykuł: {len(cleaned)} znaków")
    return cleaned


# =====================================================
# ETAP 2 – OCHRONA DANYCH (HYBRID)
# =====================================================
# Cel: Zabezpieczyć wrażliwe dane przed modyfikacją przez LLM
# Metoda: Hybrid — placeholdery dla źródeł + spany dla liczb/dat
#
# KOLEJNOŚĆ MA ZNACZENIE:
# 1. Najpierw SRC → cytaty znikają z tekstu (placeholdery)
# 2. Potem NUM/DAT/DOI/REF → działają na tekście bez cytatów (spany)
# Gdyby NUM/DAT działał pierwszy, "wgryzłby się" w rok wewnątrz cytatu.

def tokenize_hybrid(html: str) -> Tuple[str, Dict[str, str], Dict[str, str]]:
    """
    Ochrona Hybrid:
    - Cytaty źródłowe → placeholdery [[SRC_001]] (model nie widzi treści)
    - Liczby/daty → spany <span data-token-id="NUM_x"> (model widzi w kontekście)

    Zwraca:
    - html z ochroną
    - src_map: {placeholder → oryginalny cytat}
    - span_map: {token_id → oryginalna wartość}
    """
    text = html
    src_map = {}
    span_map = {}

    # --- KROK 1: Placeholdery SRC (NAJPIERW) ---
    # Cytaty źródłowe zawierają liczby (rok) i daty — muszą zniknąć
    # zanim regexy NUM/DAT zaczną działać.
    src_idx = 0

    def _src_placeholder(m):
        nonlocal src_idx
        marker = f"[[SRC_{src_idx:03d}]]"
        src_map[marker] = m.group(0)
        src_idx += 1
        return marker

    text = SOURCE_CITATION_RE.sub(_src_placeholder, text)

    # --- KROK 2: Spany NUM/DAT/DOI/REF (POTEM) ---
    # Działają na tekście, w którym cytaty są już placeholderami.
    # Model widzi wartości liczbowe — potrzebuje ich do poprawnego
    # przeformułowania zdań i doboru słów wokół.
    #
    # UWAGA: Placeholdery [[SRC_xxx]] zawierają [SRC_xxx] w środku,
    # co łapie regex BRACKET_REF. Dlatego ukrywamy je tymczasowo.

    src_temp = {}
    for marker in src_map.keys():
        temp_key = f"__SRCHOLD_{len(src_temp)}__"
        src_temp[temp_key] = marker
        text = text.replace(marker, temp_key)

    def _wrap_span(m, prefix):
        token_id = f"{prefix}_{uuid.uuid4().hex[:8]}"
        span_map[token_id] = m.group(0)
        return f'<span data-token-id="{token_id}">{m.group(0)}</span>'

    text = DOI_RE.sub(lambda m: _wrap_span(m, "DOI"), text)
    text = BRACKET_REF_RE.sub(lambda m: _wrap_span(m, "REF"), text)
    text = NUM_RE.sub(lambda m: _wrap_span(m, "NUM"), text)
    text = DATE_RE.sub(lambda m: _wrap_span(m, "DAT"), text)

    # Przywróć placeholdery SRC
    for temp_key, marker in src_temp.items():
        text = text.replace(temp_key, marker)

    return text, src_map, span_map


# =====================================================
# ETAP 3 – BUDOWA PROMPTU Z REGUŁAMI COPYWRITERSKIMI
# =====================================================
# Cel: Skonstruować system prompt z regułami A, C, D, E, F, I
# Model dostaje prompt jako system message, artykuł jako user message

def build_prompt(target_chars: int, upper_limit: int, source_count: int) -> str:
    """Buduje system prompt z regułami copywriterskimi."""

    # Blok długości
    if target_chars > 0:
        length_block = f"LENGTH: Target ~{target_chars} chars, max {upper_limit}."
    else:
        length_block = "LENGTH: No limit — focus on quality."

    # Blok ochrony źródeł
    source_block = ""
    if source_count > 0:
        source_block = f"""
### CRITICAL: SOURCE PLACEHOLDERS ({source_count} found)
Text contains [[SRC_000]], [[SRC_001]], ... placeholders.
These represent source citations — NEVER remove, edit, move, or reformat them.
Keep each placeholder exactly where it is, at the end of its paragraph.
"""

    return f"""You are an HTML optimization engine with copywriter expertise.

### OUTPUT
Return ONLY edited HTML. No explanations, no code fences. Start with <h1>.

{length_block}
{source_block}

### CRITICAL: PRESERVE DATA
1. Source placeholders [[SRC_xxx]] — do NOT touch
2. Span tags <span data-token-id="...">...</span> — preserve intact
These rules override all other instructions.

### URL POLICY
Keep URL text, but REMOVE <a> tags. URLs must not be clickable.

### COPYWRITER RULES (APPLY ALL)

#### RULE A: ZERO FIRST PERSON (SINGULAR AND PLURAL)
First person = AI signal.

FORBIDDEN: "I recommend", "I think", "We suggest", "Polecam", "Uważam", "Polecamy"

REPLACEMENTS:
- Subjectless: "I recommend X" → "X proves effective"
- Object as subject: "I suggest method Z" → "Method Z enables..."
- Impersonal: "I encourage" → "It's worth considering"

#### RULE C: ONE DEFINITION — ONE PLACE
Each term defined ONLY ONCE at first use.
Remove: repeated explanations, parenthetical definitions at subsequent uses.
Keep: only FIRST definition, replace subsequent with just the term.

#### RULE D: PARENTHETICAL CLEANUP
- Max 5 words in parentheses
- Max 1 parenthetical per paragraph
- Long parentheses (>5 words) → separate sentence or delete
- EXCEPTION: [[SRC_xxx]] placeholders are EXEMPT — never touch them

#### RULE E: TONE DOWN BOLD CLAIMS
Replace:
- "quickly see results" → "results appear gradually"
- "guaranteed results" → "expected results"
- "the only way" → "one of the ways"
- "revolutionary" → "effective"
- "always works" → "often proves effective"

#### RULE F: REDUCE 2ND PERSON & IMPERATIVES
Max 2-3 imperative sentences per H2 section.
- "Check speed" → "Speed can be checked with..."
- "Your site" → "the site"
- "You must remember" → "It's important"
Allowed: rhetorical questions (max 1/section), CTA at section end.

#### RULE I: SIMPLIFY TECHNICAL DESCRIPTIONS
When text contains technical instructions (edit file, code, FTP, database):
INSTEAD OF detailed steps → What it does (1 sentence) + Who should do it.

### SECONDARY RULES
- Consolidate repeated ideas
- Improve transitions, simplify phrasing
- Prefer active voice
- Keep HTML structure (<h1>, <h2>, <p>, <ul>, <li>)
- Headings: no trailing punctuation
- Do NOT add new information
"""


# =====================================================
# ETAP 4 – WYWOŁANIE MODELU LLM
# =====================================================

def call_llm(system_prompt: str, html: str) -> str:
    """Wysyła artykuł do modelu z regułami copywriterskimi."""
    print(f"\n🤖 Wywołanie LLM ({MODEL_NAME})...")

    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": html},
        ],
        max_completion_tokens=MAX_OUTPUT_TOKENS,
        temperature=TEMPERATURE,
    )

    output = (resp.choices[0].message.content or "").strip()
    print(f"   ✅ Odpowiedź: {len(output)} znaków")
    return output


# =====================================================
# ETAP 5 – WALIDACJA I PRZYWRÓCENIE DANYCH
# =====================================================
# Cel: Sprawdzić czy nic się nie zgubiło, przywrócić oryginalne dane
#
# Kolejność:
# 1. Przywróć placeholdery SRC → sprawdź brakujące (hard fail)
# 2. Sprawdź spany → raportuj brakujące (soft warning)
# 3. Usuń spany (unwrap)
# 4. Policz cytaty regexem (dodatkowe zabezpieczenie)

def restore_and_validate(
    html: str,
    src_map: Dict[str, str],
    span_map: Dict[str, str],
    original_source_count: int,
) -> Tuple[str, Dict]:
    """
    Przywraca dane i waliduje kompletność.
    Zwraca (html, validation_report).
    validation_report["hard_fail"] = True → artykuł odrzucony.
    """
    report = {
        "hard_fail": False,
        "src_missing": [],
        "spans_missing": [],
        "source_count_before": original_source_count,
        "source_count_after": 0,
    }

    # --- KROK 1: Przywrócenie placeholderów SRC ---
    for marker, original in src_map.items():
        if marker in html:
            html = html.replace(marker, original)
        else:
            report["src_missing"].append(marker)
            report["hard_fail"] = True

    if report["src_missing"]:
        print(f"   ❌ HARD FAIL: Zgubione źródła: {report['src_missing']}")

    # --- KROK 2: Weryfikacja spanów ---
    soup = BeautifulSoup(html, "html.parser")
    found_ids = {
        span.get("data-token-id")
        for span in soup.find_all("span", attrs={"data-token-id": True})
    }
    missing_spans = set(span_map.keys()) - found_ids
    report["spans_missing"] = list(missing_spans)

    if missing_spans:
        print(f"   ⚠️ Zgubione spany: {len(missing_spans)} (soft warning)")

    # --- KROK 3: Usunięcie spanów (unwrap) ---
    for span in soup.find_all("span", attrs={"data-token-id": True}):
        span.unwrap()
    html = str(soup)

    # --- KROK 4: Usunięcie linków ---
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a"):
        a.unwrap()
    html = str(soup)

    # --- KROK 5: Kontrola liczby cytatów ---
    report["source_count_after"] = len(SOURCE_CITATION_RE.findall(html))
    if report["source_count_after"] < original_source_count:
        report["hard_fail"] = True
        print(f"   ❌ HARD FAIL: Cytaty: {original_source_count} → {report['source_count_after']}")

    return html, report


# =====================================================
# ETAP 6 – ZAPIS WYNIKU
# =====================================================

def save_result(html: str, report: Dict):
    """Zapisuje zoptymalizowany artykuł i raport."""
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n💾 Zapisano artykuł: {OUTPUT_FILE} ({len(html)} znaków)")

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"📊 Zapisano raport: {REPORT_FILE}")


# =====================================================
# MAIN – URUCHOMIENIE PIPELINE
# =====================================================

if __name__ == "__main__":

    # Etap 1: Wczytanie
    article_html = load_article(INPUT_FILE)

    # Zlicz źródła przed ochroną
    source_count = len(SOURCE_CITATION_RE.findall(article_html))
    print(f"🔗 Cytaty źródłowe: {source_count}")

    # Etap 2: Ochrona Hybrid
    protected_html, src_map, span_map = tokenize_hybrid(article_html)
    print(f"🔒 Ochrona Hybrid: {len(src_map)} placeholderów SRC, {len(span_map)} spanów NUM/DAT")

    # Etap 3: Budowa promptu
    upper_limit = int(TARGET_LENGTH * (1.0 + UPPER_TOLERANCE)) if TARGET_LENGTH > 0 else 0
    prompt = build_prompt(TARGET_LENGTH, upper_limit, source_count)

    if DEBUG_MODE:
        print(f"   📤 Prompt: {len(prompt)} znaków")

    # Etap 4: Wywołanie LLM
    llm_output = call_llm(prompt, protected_html)

    if not llm_output.strip():
        print("❌ Pusta odpowiedź modelu")
        raise SystemExit(1)

    # Etap 5: Walidacja i przywrócenie danych
    print(f"\n🔓 Walidacja i przywracanie danych...")
    final_html, validation = restore_and_validate(
        llm_output, src_map, span_map, source_count
    )

    if validation["hard_fail"]:
        print("\n❌ ARTYKUŁ ODRZUCONY — utrata danych krytycznych")
        raise SystemExit(1)

    # Kontrola długości
    final_text = BeautifulSoup(final_html, "html.parser").get_text(" ", strip=True)
    final_length = len(final_text)

    if TARGET_LENGTH > 0 and final_length > upper_limit:
        print(f"❌ Przekroczenie długości: {final_length} > {upper_limit}")
        raise SystemExit(1)

    # Raport końcowy
    report = {
        "version": "edu-1.0",
        "step": "article_check",
        "model": MODEL_NAME,
        "rules": ["A", "C", "D", "E", "F", "I"],
        "lengths": {
            "final_text": final_length,
            "target": TARGET_LENGTH,
        },
        "protection": {
            "placeholders_src": {"total": len(src_map), "missing": len(validation["src_missing"])},
            "spans_num_dat": {"total": len(span_map), "missing": len(validation["spans_missing"])},
        },
        "sources": {
            "before": source_count,
            "after": validation["source_count_after"],
        },
    }

    print(f"\n📊 WYNIK:")
    print(f"   • Długość: {final_length} znaków")
    print(f"   • Źródła: {source_count} → {validation['source_count_after']}")
    print(f"   • Placeholdery SRC: {len(src_map)} (zgubione: {len(validation['src_missing'])})")
    print(f"   • Spany NUM/DAT: {len(span_map)} (zgubione: {len(validation['spans_missing'])})")

    # Etap 6: Zapis
    save_result(final_html, report)

    print("\n✅ GOTOWE — artykuł przekazany do etapu intermediate")
