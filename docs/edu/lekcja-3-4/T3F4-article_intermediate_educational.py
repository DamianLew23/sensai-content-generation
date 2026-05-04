#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
ARTICLE INTERMEDIATE – Wersja edukacyjna (lekcja)
=====================================================
Poprawa flow, hierarchii informacji i czytelności
wizualnej artykułu. Dodaje przejścia narracyjne
i formatowanie HTML (strong, italic, blockquote, br).

WEJŚCIE:
  • output_article_check.html – artykuł po optymalizacji copywriterskiej

WYJŚCIE:
  • output_intermediate.html – artykuł z przejściami i formatowaniem
  • output_intermediate_report.json – raport z metrykami formatowania

OCHRONA DANYCH (Hybrid — identyczna jak article_check):
  • Placeholdery [[SRC_x]] – cytaty źródłowe (model nie widzi treści)
  • Spany <span data-token-id="NUM_x"> – liczby/daty (model widzi w kontekście)

REGUŁY:
  • G – Hierarchia informacji + oddech
  • H – Naturalne przejścia i wtrącenia narracyjne
  • K – Formatowanie wizualne (strong, italic, blockquote, br)

HARD FAIL GUARDS:
  • Brak <h1> w output
  • Wzrost długości > +10%
  • Utrata liczb
  • Utrata źródeł
  • Dodane linki <a>
  • Wykryto SEO intro
=====================================================
"""

import os
import re
import json
import uuid
from typing import Dict, List, Tuple, Set

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

INPUT_FILE = "output_article_check.html"
OUTPUT_FILE = "output_intermediate.html"
REPORT_FILE = "output_intermediate_report.json"

# Model LLM (claude-4.5-sonnet / gpt-5.2 — zamiennie, do wyboru)
MODEL_NAME = "gpt-5.2"

# Język artykułu
LANG = "pl"

# Parametry modelu
TEMPERATURE = 0.5
MAX_OUTPUT_TOKENS = 16000

# Guardy
MAX_LENGTH_GROWTH = 0.10  # +10%

# Debug
DEBUG_MODE = True

# Klucz API
if not os.environ.get("OPENAI_API_KEY"):
    print("❌ Ustaw zmienną środowiskową OPENAI_API_KEY")
    raise SystemExit(1)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

print("=" * 60)
print("🔗 ARTICLE INTERMEDIATE – wersja edukacyjna")
print(f"   • Model: {MODEL_NAME}")
print(f"   • Input: {INPUT_FILE}")
print(f"   • Output: {OUTPUT_FILE}")
print(f"   • Reguły: G, H, K")
print(f"   • Ochrona: Hybrid (placeholdery SRC + spany NUM/DAT)")
print(f"   • Max wzrost długości: {MAX_LENGTH_GROWTH:.0%}")
print("=" * 60)


# =====================================================
# REGEX – WZORCE (IDENTYCZNE JAK W ARTICLE_CHECK)
# =====================================================
# Ten sam zestaw regexów zapewnia spójność ochrony
# między krokami pipeline'u.

SOURCE_CITATION_RE = re.compile(
    r'\((?:Source|Źródło):\s*(?:[^()]*|\([^()]*\))*\)',
    re.IGNORECASE
)

NUM_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:%|mln|mld|tys\.?|k|M|B|zł|PLN|USD|EUR|mg|g|kg|ml|μg|mcg|IU|kcal)?\b",
    re.IGNORECASE
)

DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ž]+\s+\d{4}|\d{4})\b"
)

DOI_RE = re.compile(
    r'\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b',
    re.IGNORECASE
)

BRACKET_REF_RE = re.compile(
    r"\[(?:\d{1,3}|[A-Za-z0-9-_]+)\]"
)

# Regex do ekstrakcji samych liczb (do walidacji przed/po)
NUMERIC_EXTRACT_RE = re.compile(
    r'(?:\d{1,3}(?:[ .,\u00A0]\d{3})+|\d+)(?:[.,]\d+)?%?'
    r'|\b\d{4}\b'
    r'|(?:\$|€|£|zł|PLN|USD|EUR)\s?\d+(?:[.,]\d+)?',
    re.IGNORECASE
)

# Wzorce SEO intro (hard fail jeśli wykryte w output)
SEO_INTRO_PATTERNS = {
    "pl": [
        r"jeśli\s+zadajesz\s+sobie\s+pytanie",
        r"zanim\s+przejdziemy",
        r"w\s+tym\s+artykule\s+(?:dowiesz|poznasz|odkryjesz)",
        r"czy\s+zastanawiałeś\s+się",
        r"witaj\s+w\s+(?:naszym|tym)\s+(?:przewodniku|artykule)",
    ],
    "en": [
        r"before\s+we\s+dive\s+in",
        r"let'?s\s+dive\s+in",
        r"in\s+this\s+article,?\s+(?:we'?ll|you'?ll)",
        r"have\s+you\s+ever\s+wondered",
        r"welcome\s+to\s+(?:our|this)\s+(?:guide|article)",
    ],
}


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

    print(f"\n📄 Wczytano artykuł: {len(html)} znaków")
    return html


# =====================================================
# ETAP 2 – OCHRONA DANYCH (HYBRID)
# =====================================================
# Identyczny mechanizm jak w article_check:
# 1. Placeholdery [[SRC_x]] dla źródeł
# 2. Spany <span data-token-id="NUM_x"> dla liczb/dat
#
# Model w intermediate widzi liczby — potrzebuje ich,
# żeby zdecydować o pogrubieniu zaskakujących wartości
# (Reguła K: <strong>20-30%</strong>).

def tokenize_hybrid(html: str) -> Tuple[str, Dict[str, str], Dict[str, str]]:
    """
    Ochrona Hybrid (identyczna jak article_check).
    Zwraca: (html, src_map, span_map)
    """
    text = html
    src_map = {}
    span_map = {}

    # --- KROK 1: Placeholdery SRC (NAJPIERW) ---
    src_idx = 0

    def _src_placeholder(m):
        nonlocal src_idx
        marker = f"[[SRC_{src_idx:03d}]]"
        src_map[marker] = m.group(0)
        src_idx += 1
        return marker

    text = SOURCE_CITATION_RE.sub(_src_placeholder, text)

    # --- KROK 2: Spany NUM/DAT/DOI/REF (POTEM) ---
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
# ETAP 3 – BUDOWA PROMPTU Z REGUŁAMI PRZEJŚĆ
# =====================================================
# Cel: Skonstruować prompt z regułami G, H, K
# Intermediate używa jednego promptu (user message),
# nie system/user split — artykuł jest na końcu promptu.

def build_prompt(html: str, source_count: int) -> str:
    """Buduje prompt z regułami przejść i formatowania."""

    lang_label = "Polish" if LANG == "pl" else "English"

    return f"""You are an expert editor specializing in improving article flow, readability, and visual presentation.
Your task is to enhance the logical flow, narrative structure, AND visual formatting of the article while preserving all content.

Language: {lang_label}

### CRITICAL PRESERVATION RULES
1. **Sources:** Keep ALL [[SRC_xxx]] placeholders exactly as they are. Do NOT modify, move, or delete them. They must stay at the end of their paragraph.
2. **Numbers:** Keep ALL <span data-token-id="...">...</span> tags intact. Do NOT modify content inside spans.
3. **Structure:** Preserve all headings (<h1>, <h2>, <h3>) from the input.
4. **Content:** Do NOT add new information. Do NOT remove existing information.
5. **Length:** Output must be within +{MAX_LENGTH_GROWTH:.0%} of input length.
6. **Links:** Do NOT add any <a> tags or hyperlinks.

### RULE G: INFORMATION HIERARCHY + BREATHING ROOM

Text cannot be uniformly dense. It needs hierarchy and "breathing room."

Paragraph structure with hierarchy:
1. Main sentence (IMPORTANT) — concrete fact or thesis
2. Development/example (MEDIUM) — explanation, context
3. Transition sentence (LIGHT) — connector or mini-summary

Implementation:
- Every 2-3 dense paragraphs → insert a lighter transitional paragraph
- After a series of facts → mini-summary or rhetorical question
- Before new section → connecting sentence to previous content

### RULE H: NATURAL TRANSITIONS AND NARRATIVE INSERTIONS

Add human narrative insertions that break the "report-like" tone.

Types of insertions (1-2 per H2 section):
1. Mini-summaries: "In short: X changed Y by introducing Z."
2. Acknowledging difficulty: "This may sound complicated, but in practice..."
3. Contextualization: connect to everyday experience relevant to the article topic
4. Rhetorical questions (sparingly): "What does this mean in practice?"

CRITICAL: These are TEMPLATES, not literal text. Adapt each insertion to the article's actual subject matter.

### RULE K: VISUAL FORMATTING FOR READABILITY

The article must NOT be a wall of plain text.

K1: Bold (<strong>)
- Bold key terms at first meaningful use
- Bold surprising numbers or facts
- Bold names of substances, laws, products on first mention
- Target: 2-4 bolded phrases per H2 section
- NEVER bold entire sentences or headings
- Keep bolded phrases short (1-5 words)

K2: Italic (<i>)
- Emphasis on important statements
- Foreign terms, titles, Latin names
- Rhetorical or reflective sentences (mini-conclusions)
- Target: 1-2 italic phrases per H2 section

K3: Blockquote (<blockquote>)
- Notable historical quotes or key definitions
- Pivotal statements deserving visual emphasis
- Target: 0-2 per entire article (very selective)

K4: Line breaks (<br />)
- When a thought within a paragraph concludes but the next continues the same topic
- Before a contrasting or pivotal follow-up sentence
- Target: 5-15 per article, focus on longest/densest paragraphs

### ADDITIONAL RULES

ONE THOUGHT = ONE PARAGRAPH:
- Each paragraph: ONE main idea
- Max 5 sentences OR ~800 characters per paragraph
- Split long paragraphs covering multiple topics

NO DUPLICATE IDEAS:
- If you add italic emphasis, check whether the NEXT sentence says the same thing
- Never express the same idea twice in a row

FORBIDDEN SEO INTROS (HARD FAIL):
- "jeśli zadajesz sobie pytanie", "zanim przejdziemy" (PL)
- "before we dive in", "let's dive in" (EN)
- "w tym artykule dowiesz się", "in this article you'll learn"

### OUTPUT REQUIREMENTS
- Return ONLY the edited HTML article
- Start with the existing <h1>
- No explanations, no code fences
- Preserve ALL [[SRC_xxx]] placeholders and <span> tags exactly

### ARTICLE TO PROCESS

{html}
"""


# =====================================================
# ETAP 4 – WYWOŁANIE MODELU LLM
# =====================================================

def call_llm(prompt: str) -> str:
    """Wysyła artykuł do modelu z regułami przejść."""
    print(f"\n🤖 Wywołanie LLM ({MODEL_NAME})...")

    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=MAX_OUTPUT_TOKENS,
        temperature=TEMPERATURE,
    )

    output = (resp.choices[0].message.content or "").strip()
    print(f"   ✅ Odpowiedź: {len(output)} znaków")
    return output


# =====================================================
# ETAP 5 – WALIDACJA I PRZYWRÓCENIE DANYCH
# =====================================================
# Cel: Przywrócić dane + uruchomić guardy
#
# Guardy intermediate są SZERSZE niż article_check,
# bo ten krok dodaje treść (przejścia, wtrącenia):
# - Wzrost długości max +10%
# - Utrata liczb (porównanie zbiorów)
# - Dodane linki <a>
# - Wykryto SEO intro

def extract_text(html: str) -> str:
    """Wyciąga czysty tekst z HTML."""
    return BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True)


def extract_numbers(text: str) -> Set[str]:
    """Wyciąga zbiór wartości liczbowych z tekstu."""
    return set(NUMERIC_EXTRACT_RE.findall(text))


def count_formatting(html: str) -> Dict[str, int]:
    """Liczy elementy formatowania wizualnego."""
    soup = BeautifulSoup(html, "html.parser")
    return {
        "strong": len(soup.find_all("strong")),
        "italic": len(soup.find_all("i")) + len(soup.find_all("em")),
        "blockquote": len(soup.find_all("blockquote")),
        "br": len(soup.find_all("br")),
    }


def detect_seo_intro(html: str) -> bool:
    """Sprawdza czy output zawiera zabronione wzorce SEO intro."""
    text = extract_text(html).lower()
    patterns = SEO_INTRO_PATTERNS.get(LANG, SEO_INTRO_PATTERNS["en"])
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def restore_and_validate(
    html: str,
    src_map: Dict[str, str],
    span_map: Dict[str, str],
    original_source_count: int,
    original_text: str,
    original_length: int,
) -> Tuple[str, Dict]:
    """
    Przywraca dane i uruchamia guardy.
    Zwraca (html, validation_report).
    """
    report = {
        "hard_fail": False,
        "hard_fail_reason": None,
        "src_missing": [],
        "spans_missing": [],
        "source_count_before": original_source_count,
        "source_count_after": 0,
        "length_growth": 0.0,
        "numbers_missing": [],
    }

    # --- Przywrócenie placeholderów SRC ---
    for marker, original in src_map.items():
        if marker in html:
            html = html.replace(marker, original)
        else:
            report["src_missing"].append(marker)
            report["hard_fail"] = True
            report["hard_fail_reason"] = "source_lost"

    # --- Weryfikacja spanów ---
    soup = BeautifulSoup(html, "html.parser")
    found_ids = {
        span.get("data-token-id")
        for span in soup.find_all("span", attrs={"data-token-id": True})
    }
    report["spans_missing"] = list(set(span_map.keys()) - found_ids)

    # --- Usunięcie spanów (unwrap) ---
    for span in soup.find_all("span", attrs={"data-token-id": True}):
        span.unwrap()
    html = str(soup)

    # --- GUARD: Brak <h1> ---
    if not re.search(r'<h1\b[^>]*>', html, re.IGNORECASE):
        report["hard_fail"] = True
        report["hard_fail_reason"] = "missing_h1"
        print("   ❌ HARD FAIL: Brak <h1> w output")

    # --- GUARD: Dodane linki ---
    if re.findall(r'<a\b[^>]*>', html, re.IGNORECASE):
        report["hard_fail"] = True
        report["hard_fail_reason"] = "anchors_added"
        print("   ❌ HARD FAIL: Dodane linki <a>")

    # --- GUARD: Wzrost długości ---
    output_text = extract_text(html)
    output_length = len(output_text)
    report["length_growth"] = (output_length - original_length) / original_length if original_length > 0 else 0

    if report["length_growth"] > MAX_LENGTH_GROWTH:
        report["hard_fail"] = True
        report["hard_fail_reason"] = "length_growth"
        print(f"   ❌ HARD FAIL: Wzrost długości {report['length_growth']:.1%} > {MAX_LENGTH_GROWTH:.0%}")

    # --- GUARD: Utrata liczb ---
    original_numbers = extract_numbers(original_text)
    output_numbers = extract_numbers(output_text)
    missing_numbers = original_numbers - output_numbers
    report["numbers_missing"] = list(missing_numbers)[:10]

    if missing_numbers:
        report["hard_fail"] = True
        report["hard_fail_reason"] = "numbers_lost"
        print(f"   ❌ HARD FAIL: Utrata liczb: {list(missing_numbers)[:5]}")

    # --- GUARD: SEO intro ---
    if detect_seo_intro(html):
        report["hard_fail"] = True
        report["hard_fail_reason"] = "seo_intro"
        print("   ❌ HARD FAIL: Wykryto SEO intro")

    # --- Kontrola liczby cytatów ---
    report["source_count_after"] = len(SOURCE_CITATION_RE.findall(html))
    if report["source_count_after"] < original_source_count:
        report["hard_fail"] = True
        report["hard_fail_reason"] = "source_count_drop"
        print(f"   ❌ HARD FAIL: Cytaty: {original_source_count} → {report['source_count_after']}")

    if report["src_missing"]:
        print(f"   ❌ Zgubione źródła: {report['src_missing']}")
    if report["spans_missing"]:
        print(f"   ⚠️ Zgubione spany: {len(report['spans_missing'])} (soft warning)")

    return html, report


# =====================================================
# ETAP 6 – ZAPIS WYNIKU
# =====================================================

def save_result(html: str, report: Dict):
    """Zapisuje artykuł z przejściami i raport."""
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

    # Metryki "before"
    original_text = extract_text(article_html)
    original_length = len(original_text)
    source_count = len(SOURCE_CITATION_RE.findall(article_html))
    formatting_before = count_formatting(article_html)

    print(f"🔗 Cytaty źródłowe: {source_count}")
    print(f"🎨 Formatowanie: strong={formatting_before['strong']}, "
          f"italic={formatting_before['italic']}, "
          f"blockquote={formatting_before['blockquote']}, "
          f"br={formatting_before['br']}")

    # Etap 2: Ochrona Hybrid
    protected_html, src_map, span_map = tokenize_hybrid(article_html)
    print(f"🔒 Ochrona Hybrid: {len(src_map)} placeholderów SRC, {len(span_map)} spanów NUM/DAT")

    # Etap 3: Budowa promptu
    prompt = build_prompt(protected_html, source_count)

    if DEBUG_MODE:
        print(f"   📤 Prompt: {len(prompt)} znaków")

    # Etap 4: Wywołanie LLM
    llm_output = call_llm(prompt)

    if not llm_output.strip():
        print("❌ Pusta odpowiedź modelu")
        raise SystemExit(1)

    # Etap 5: Walidacja i przywrócenie danych
    print(f"\n🔓 Walidacja i przywracanie danych...")
    final_html, validation = restore_and_validate(
        llm_output, src_map, span_map, source_count,
        original_text, original_length
    )

    if validation["hard_fail"]:
        print(f"\n❌ ARTYKUŁ ODRZUCONY — {validation['hard_fail_reason']}")
        raise SystemExit(1)

    # Metryki "after"
    final_text = extract_text(final_html)
    final_length = len(final_text)
    formatting_after = count_formatting(final_html)

    # Raport końcowy
    report = {
        "version": "edu-1.0",
        "step": "intermediate",
        "model": MODEL_NAME,
        "rules": ["G", "H", "K"],
        "lengths": {
            "input": original_length,
            "output": final_length,
            "growth": round(validation["length_growth"], 4),
        },
        "protection": {
            "placeholders_src": {"total": len(src_map), "missing": len(validation["src_missing"])},
            "spans_num_dat": {"total": len(span_map), "missing": len(validation["spans_missing"])},
        },
        "sources": {
            "before": source_count,
            "after": validation["source_count_after"],
        },
        "formatting": {
            "before": formatting_before,
            "after": formatting_after,
        },
    }

    print(f"\n📊 WYNIK:")
    print(f"   • Długość: {original_length} → {final_length} ({validation['length_growth']:+.1%})")
    print(f"   • Źródła: {source_count} → {validation['source_count_after']}")
    print(f"   • Placeholdery SRC: {len(src_map)} (zgubione: {len(validation['src_missing'])})")
    print(f"   • Spany NUM/DAT: {len(span_map)} (zgubione: {len(validation['spans_missing'])})")
    print(f"   • Formatowanie after: strong={formatting_after['strong']}, "
          f"italic={formatting_after['italic']}, "
          f"blockquote={formatting_after['blockquote']}, "
          f"br={formatting_after['br']}")

    # Etap 6: Zapis
    save_result(final_html, report)

    print("\n✅ GOTOWE — artykuł gotowy do publikacji")
