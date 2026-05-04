#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
DATA ENRICHMENT – Wersja edukacyjna (lekcja)
=====================================================
Wzbogaca draft artykułu o źródła danych.
Skanuje tekst pod kątem twierdzeń weryfikowalnych,
generuje pytania weryfikacyjne, weryfikuje je przez
web search i wstawia cytaty.

WEJŚCIE:
  • output_draft.html – draft artykułu z etapu generowania

WYJŚCIE:
  • output_enriched.html – artykuł ze źródłami
  • output_enrichment_report.json – raport weryfikacji (opcjonalny)

ETAPY:
  Etap 1  – Wczytanie draftu HTML
  Etap 2  – Ekstrakcja claimów (regex + scoring)
  Etap 2b – Generowanie pytań weryfikacyjnych (gpt-4.1-mini)
  Etap 3  – Weryfikacja claimów (LLM + web search)
  Etap 4  – Wstawianie źródeł do HTML
  Etap 5  – Zapis wzbogaconego artykułu
=====================================================
"""

import os
import re
import json
from typing import Dict, List, Tuple
from datetime import datetime

try:
    from openai import OpenAI
except ImportError:
    print("❌ Zainstaluj: pip install openai")
    raise SystemExit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("❌ Zainstaluj: pip install beautifulsoup4")
    raise SystemExit(1)


# ===== KONFIGURACJA =====

# Pliki wejściowe i wyjściowe
INPUT_FILE = "output_draft.html"
OUTPUT_FILE = "output_enriched.html"
REPORT_FILE = "output_enrichment_report.json"

# Model LLM z web search (weryfikacja)
MODEL_NAME = "gpt-5.2"

# Model mini (generowanie pytań — szybki, tani)
MINI_MODEL = "gpt-4.1-mini"

# Maksymalna liczba claimów do weryfikacji na artykuł
MAX_CLAIMS = 15

# Język artykułu (pl/en/de/fr)
LANG = "pl"

# Słowo kluczowe artykułu (kontekst dla web search)
KEYWORD = "jak obniżyć kortyzol po 40tce?"

# Debug
DEBUG_MODE = True

# Klucz API
if not os.environ.get("OPENAI_API_KEY"):
    print("❌ Ustaw zmienną środowiskową OPENAI_API_KEY")
    raise SystemExit(1)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

CURRENT_YEAR = datetime.now().year
CURRENT_MONTH = datetime.now().month

print("=" * 60)
print("🔬 DATA ENRICHMENT – wersja edukacyjna")
print(f"   • Model weryfikacji: {MODEL_NAME}")
print(f"   • Model pytań: {MINI_MODEL}")
print(f"   • Input: {INPUT_FILE}")
print(f"   • Output: {OUTPUT_FILE}")
print(f"   • Język: {LANG} | Keyword: {KEYWORD}")
print(f"   • Max claimów: {MAX_CLAIMS}")
print("=" * 60)


# =====================================================
# ETAP 1 – WCZYTANIE DRAFTU HTML
# =====================================================
# Cel: Wczytać output z etapu generowania (czysty draft HTML)
# Input: output_draft.html
# Output: string z HTML artykułu

def load_draft(filepath: str) -> str:
    """
    Wczytuje draft artykułu z pliku HTML.
    Draft powinien zaczynać się od <h1> i nie zawierać żadnych
    znaczników typu {{DATA:x}} — to czysty tekst.
    """
    if not os.path.exists(filepath):
        print(f"❌ Plik nie istnieje: {filepath}")
        raise SystemExit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read().strip()

    if not html:
        print(f"❌ Plik jest pusty: {filepath}")
        raise SystemExit(1)

    # Sprawdź czy to HTML z nagłówkiem
    if "<h1" not in html.lower():
        print("⚠️ Uwaga: brak tagu <h1> w drafcie")

    print(f"\n📄 Wczytano draft: {len(html)} znaków")
    return html


# =====================================================
# ETAP 2 – EKSTRAKCJA CLAIMÓW (regex + scoring)
# =====================================================
# Cel: Znaleźć w artykule akapity z twierdzeniami weryfikowalnymi
# Metoda: regex pattern matching + system punktacji
# Output: lista claimów posortowana wg score, obcięta do MAX_CLAIMS
#
# DLACZEGO REGEX A NIE LLM:
# - Deterministyczny wynik (ten sam input = ten sam output)
# - Zero kosztów API na ten etap
# - Szybkość: milisekundy vs sekundy
# - LLM mógłby "wymyślić" claimy, których nie ma w tekście

# --- Wzorce regex ---

# Liczby z jednostkami: "23%", "6.2 million", "450 tys.", "10–20 μg/dl"
# Uwaga: en-dash (–) i zwykły myślnik (-) jako separatory zakresów
NUMBER_RE = re.compile(
    r'\b\d[\d,.\s\-–]*(?:%|million|billion|mln|mld|tys|thousand|'
    r'percent|deaths|cases|prescriptions|users|'
    r'mg|g|kg|ml|l|μg|mcg|ng|IU|j\.m\.|kcal|bpm|mmHg|'
    r'μg/dl|ng/ml|mmol/l|mg/dl)\b',
    re.IGNORECASE
)

# Frazy z rokiem: "in 2019", "w 2023 roku", "since 1899"
YEAR_CLAIM_RE = re.compile(
    r'\b(?:in|w|of|since|od|from|around|circa|by|after|before|until|roku)\s+\d{4}\b',
    re.IGNORECASE
)

# Konkretne daty: "on March 6, 1899", "dnia 6 marca 1899"
DATE_EVENT_RE = re.compile(
    r'\b(?:on\s+\w+\s+\d{1,2},?\s+\d{4}|'
    r'\d{1,2}\s+\w+\s+\d{4}|'
    r'(?:dnia|w dniu)\s+\d{1,2}\s+\w+\s+\d{4})\b',
    re.IGNORECASE
)

# Słowa trendu: "wzrosł", "surpassed", "estimated", "obniża", "zwiększa"
# Uwaga: rozbudowane o polskie czasowniki zmiany (obniż, podnoś, zwiększ...)
STAT_PHRASES = re.compile(
    r'\b(?:surpass|exceed|increas|decreas|rose|fell|grew|dropped|'
    r'estimated|approximately|roughly|'
    r'about \d|more than \d|less than \d|up to \d|over \d|around \d|nearly \d|'
    r'times stronger|times more|times higher|times lower|'
    r'wzrosł|spadł|oszacowa|około \d|ponad \d|blisko \d|prawie \d|'
    r'razy silniejsz|razy więcej|razy wyższ|'
    r'zwiększ|obniż|podnos|podnoś|zmniejsz|reduku|podwyższ|normalizuj|'
    r'obniżen|popraw|pogarszaj|nasil|ogranicza|wzmacnia)\w*\b',
    re.IGNORECASE
)

# Legislacja: "act", "ustawa", "rozporządzenie"
LEGISLATION_RE = re.compile(
    r'\b(?:act|law|regulation|directive|treaty|monograph|schedule|'
    r'ustawa|rozporządzenie|dyrektywa|regulacja)\b',
    re.IGNORECASE
)

# Organizacje: WHO, FDA, EMA itp.
ORG_CLAIM_RE = re.compile(
    r'\b(?:World Health Organization|WHO|FDA|DEA|EPA|CDC|EMA|EFSA|'
    r'European Medicines Agency|Światowa Organizacja Zdrowia|'
    r'American Chemical Society|National Institute|'
    r'United Nations|European Union|Unia Europejska)\b',
    re.IGNORECASE
)

# Normy i dawki medyczne: "normy wynoszą 10–20 μg/dl", "dawka 300–600 mg"
MEDICAL_NORM_RE = re.compile(
    r'\b(?:norma|normy|zakres|stężenie|dawka|dawkowanie|'
    r'poziom wynosi|wynoszą|wynosi|referencyj|wartości prawidłowe|'
    r'zakres referencyjny|wartość prawidłowa|'
    r'standaryzowany|standaryzowanego)\b',
    re.IGNORECASE
)

# Porównania ilościowe: "o 20–30% w porównaniu", "wyższy niż"
COMPARISON_RE = re.compile(
    r'\bo\s+(?:około\s+)?\d[\d,.\-–]*\s*%|'
    r'w porównaniu (?:do|z|ze)|'
    r'(?:więcej|mniej|wyższy|niższy|szybciej|wolniej|lepiej|gorzej)\s+(?:niż|od)|'
    r'w stosunku do',
    re.IGNORECASE
)


def extract_claims(article_html: str) -> List[Dict]:
    """
    Skanuje HTML artykułu i wyodrębnia akapity z twierdzeniami
    weryfikowalnymi. Każdy akapit jest punktowany — im więcej
    wzorców pasuje, tym wyższy score.

    System punktacji:
      statystyka (liczba + jednostka) = 3 pkt
      konkretna data                  = 2 pkt
      trend (wzrost/spadek)           = 2 pkt
      norma/dawka medyczna            = 2 pkt
      porównanie ilościowe            = 2 pkt
      datowane zdarzenie (rok)        = 1 pkt
      legislacja                      = 1 pkt
      organizacja                     = 1 pkt

    Próg: >= 2 pkt = claim-worthy.
    Skanowane tagi: p, li, td (tabele z dawkami/normami).
    Każdy claim dostaje pole 'context':
      - <p>, <li>: pełny tekst elementu
      - <td>: nagłówki kolumn + cały wiersz tabeli (żeby model
              wiedział np. że "300–600 mg" dotyczy ashwagandhy)
    """
    soup = BeautifulSoup(article_html, "html.parser")

    claims = []
    claim_id = 1
    current_h2 = "Wstęp"

    # Skanujemy p, li ORAZ td (tabele z dawkami, normami, danymi)
    for tag in soup.find_all(["h2", "p", "li", "td"]):
        # Śledź aktualny nagłówek H2 (kontekst dla web search)
        if tag.name == "h2":
            current_h2 = tag.get_text(strip=True)
            continue

        text = tag.get_text(" ", strip=True)

        # Pomiń bardzo krótkie akapity
        if len(text) < 30:
            continue

        # --- Budowanie kontekstu ---
        # Dla <td>: nagłówki tabeli + pełny wiersz (żeby model wiedział
        # że "300–600 mg" to dawka ashwagandhy, a nie magnezu)
        if tag.name == "td":
            table = tag.find_parent("table")
            headers = [th.get_text(strip=True) for th in table.find_all("th")] if table else []
            row = tag.find_parent("tr")
            cells = [td.get_text(strip=True) for td in row.find_all("td")] if row else [text]
            context = ""
            if headers:
                context += "Nagłówki tabeli: " + " | ".join(headers) + "\n"
            context += "Wiersz: " + " | ".join(cells)
        else:
            # Dla <p> i <li>: pełny tekst (nie obcinamy do 250 znaków)
            context = text

        # --- Scoring ---
        score = 0
        claim_types = []

        if NUMBER_RE.search(text):
            score += 3
            claim_types.append("statystyka")

        if DATE_EVENT_RE.search(text):
            score += 2
            claim_types.append("konkretna_data")

        if STAT_PHRASES.search(text):
            score += 2
            claim_types.append("trend")

        if MEDICAL_NORM_RE.search(text):
            score += 2
            claim_types.append("norma_medyczna")

        if COMPARISON_RE.search(text):
            score += 2
            claim_types.append("porównanie")

        if YEAR_CLAIM_RE.search(text):
            score += 1
            claim_types.append("datowane_zdarzenie")

        if LEGISLATION_RE.search(text):
            score += 1
            claim_types.append("legislacja")

        if ORG_CLAIM_RE.search(text):
            score += 1
            claim_types.append("organizacja")

        # Próg: minimum 2 punkty
        if score >= 2:
            claims.append({
                "id": claim_id,
                "paragraph_html": str(tag),
                "claim_text": text[:250],
                "context": context,
                "claim_types": claim_types,
                "score": score,
                "h2_context": current_h2,
                "tag_name": tag.name,
            })
            claim_id += 1

    # Sortuj wg score (najwyższy najpierw), weź top MAX_CLAIMS
    # KOLEJNOŚĆ MA ZNACZENIE: model weryfikacyjny dostaje claimy
    # od najsilniejszych do najsłabszych. Jeśli skończy budżet
    # web search — najważniejsze claimy są już zweryfikowane.
    claims.sort(key=lambda c: c["score"], reverse=True)
    selected = claims[:MAX_CLAIMS]

    print(f"\n📌 Etap 2: Znaleziono {len(claims)} claimów, wybrano top {len(selected)}")
    if DEBUG_MODE:
        for c in selected:
            types_str = ", ".join(c["claim_types"])
            print(f"   #{c['id']} (score={c['score']}, {types_str}): {c['claim_text'][:80]}...")

    return selected


# =====================================================
# ETAP 2b – GENEROWANIE PYTAŃ (gpt-4.1-mini)
# =====================================================
# Cel: Zamienić surowe claimy na pytania weryfikacyjne
# Metoda: Jedno wywołanie gpt-4.1-mini (szybkie, tanie)
# Input: lista claimów z kontekstem (pełny tekst/wiersz tabeli)
# Output: te same claimy z dodanym polem 'question'
#
# DLACZEGO PYTANIA:
# - Model z web search lepiej szuka odpowiedzi na pytanie
#   niż "weryfikuje" surowy fragment tekstu
# - Pytanie zawiera intencję wyszukiwania (co chcemy znaleźć)
# - Dla <td> pytanie uzupełnia kontekst (np. "ashwagandha"
#   z wiersza tabeli trafia do pytania)
# - Claim steruje formatowaniem źródła, pytanie steruje szukaniem

def generate_questions(claims: List[Dict]) -> List[Dict]:
    """
    Generuje pytania weryfikacyjne dla każdego claima.
    Używa gpt-4.1-mini — jedno wywołanie, szybkie i tanie.
    Dodaje pole 'question' do każdego claima.
    """
    if not claims:
        return claims

    print(f"\n❓ Etap 2b: Generowanie pytań weryfikacyjnych ({MINI_MODEL})...")

    # Buduj listę claimów z kontekstem
    claims_for_prompt = ""
    for c in claims:
        claims_for_prompt += f"\nCLAIM #{c['id']}:\n"
        claims_for_prompt += f"  Sekcja: {c['h2_context']}\n"
        claims_for_prompt += f"  Kontekst: {c['context'][:500]}\n"

    prompt = f"""Dla każdego claima z artykułu o "{KEYWORD}" wygeneruj krótkie
pytanie weryfikacyjne po polsku.

ZASADY:
1. Pytanie musi być KONKRETNE i WYSZUKIWALNE — zawierać liczby, dawki,
   normy lub nazwy z claima
2. Pytanie musi zawierać pełny kontekst — jeśli claim mówi o dawce,
   pytanie musi zawierać NAZWĘ substancji (np. z nagłówka tabeli)
3. Pytanie ma KIEROWAĆ wyszukiwanie — model z web search użyje go
   jako zapytania
4. Jedno pytanie per claim, po polsku, max 1-2 zdania

CLAIMY:
{claims_for_prompt}

OUTPUT (ŚCISŁY JSON):
Zwróć TYLKO obiekt JSON mapujący ID claima na pytanie:
{{
  "1": "Jakie są normy porannego kortyzolu we krwi i w ślinie?",
  "2": "O ile procent sen 7-9 godzin obniża kortyzol w porównaniu do 5 godzin?",
  "3": "Jaka jest zalecana dzienna dawka standaryzowanego ekstraktu ashwagandhy?"
}}
"""

    try:
        result = client.responses.create(
            model=MINI_MODEL,
            input=prompt,
        )

        questions = parse_json_response(result.output_text)

        # Przypisz pytania do claimów
        assigned = 0
        for c in claims:
            cid = str(c["id"])
            if cid in questions:
                c["question"] = questions[cid]
                assigned += 1
            else:
                # Fallback: użyj tekstu claima jako pytania
                c["question"] = c["claim_text"]

        print(f"   ✅ Wygenerowano pytania: {assigned}/{len(claims)}")
        if DEBUG_MODE:
            for c in claims:
                print(f"   #{c['id']}: {c['question'][:90]}...")

        return claims

    except Exception as e:
        print(f"   ❌ Błąd generowania pytań: {e}")
        # Fallback: użyj claim_text
        for c in claims:
            c["question"] = c["claim_text"]
        return claims


# =====================================================
# ETAP 3 – WERYFIKACJA CLAIMÓW (LLM + web search)
# =====================================================
# Cel: Dla każdego claima znaleźć wiarygodne źródło
# Metoda: Prompt do LLM z narzędziem web_search_preview
# Input: claimy z pytaniami (z etapu 2b)
# Output: dict {claim_id: {status, source, source_url, note}}
#
# KLUCZOWA ZMIANA: model dostaje PARĘ (pytanie + claim):
# - Pytanie → steruje wyszukiwaniem (co model szuka)
# - Claim → steruje formatowaniem (jak opisać źródło)
# Model szuka odpowiedzi na pytanie, a potem potwierdza/koryguje claim.

def build_verification_prompt(claims: List[Dict]) -> str:
    """
    Buduje prompt weryfikacyjny dla LLM.
    Każdy claim zawiera pytanie weryfikacyjne (z etapu 2b)
    + oryginalny tekst z artykułu.
    WYMUSZENIE: źródła MUSZĄ być w języku artykułu.
    """
    # Dynamiczne okno czasowe
    if CURRENT_MONTH >= 7:
        year_context = f"priorytet: dane z {CURRENT_YEAR}; fallback: {CURRENT_YEAR - 1}"
    else:
        year_context = f"priorytet: pełne dane z {CURRENT_YEAR - 1}; sprawdź aktualizacje Q1 {CURRENT_YEAR}"

    # Konfiguracja per język: ograniczenia źródeł
    lang_config = {
        "pl": {
            "label": "Źródło",
            "search_lang": "polski",
            "search_instruction": "Szukaj WYŁĄCZNIE po polsku. Używaj polskich fraz w web search.",
            "source_rule": (
                "Źródło MUSI być w języku polskim — strona, na którą linkujesz,\n"
                "musi zawierać treść po polsku. Nie akceptuj stron anglojęzycznych,\n"
                "niemieckojęzycznych ani w żadnym innym języku.\n"
                "Jeśli nie znajdziesz polskojęzycznego źródła → zwróć 'unverified'."
            ),
        },
        "en": {
            "label": "Source",
            "search_lang": "English",
            "search_instruction": "Search ONLY in English. Use English phrases in web search.",
            "source_rule": (
                "Source MUST be in English — the page you link to must contain\n"
                "English-language content. Do not accept non-English sources.\n"
                "If no English-language source found → return 'unverified'."
            ),
        },
        "de": {
            "label": "Quelle",
            "search_lang": "Deutsch",
            "search_instruction": "Suche AUSSCHLIESSLICH auf Deutsch. Verwende deutsche Suchbegriffe.",
            "source_rule": (
                "Die Quelle MUSS auf Deutsch sein — die verlinkte Seite muss\n"
                "deutschsprachigen Inhalt enthalten. Keine englischsprachigen Quellen.\n"
                "Wenn keine deutschsprachige Quelle gefunden → 'unverified' zurückgeben."
            ),
        },
    }

    config = lang_config.get(LANG, lang_config["en"])
    source_label = config["label"]

    # Lista claimów z pytaniami
    claims_text = ""
    for c in claims:
        claims_text += f"\nCLAIM #{c['id']}:\n"
        claims_text += f"  Pytanie (szukaj odpowiedzi): {c.get('question', c['claim_text'])}\n"
        claims_text += f"  Tekst z artykułu: {c['claim_text']}\n"
        claims_text += f"  Sekcja: {c['h2_context']}\n"

    return f"""Dla każdego claima z artykułu o "{KEYWORD}" znajdź źródło
odpowiadające na podane pytanie i potwierdź lub skoryguj tekst z artykułu.

CLAIMY DO WERYFIKACJI:
{claims_text}

KONTEKST:
- Dziś: {datetime.now().strftime('%Y-%m-%d')}
- Preferencja czasowa: {year_context}

═══════════════════════════════════════════════
OGRANICZENIE JĘZYKA ŹRÓDEŁ (BEZWZGLĘDNE):
═══════════════════════════════════════════════
Język artykułu: {config["search_lang"]}
{config["search_instruction"]}

{config["source_rule"]}
═══════════════════════════════════════════════

ZASADY:
1. Użyj PYTANIA jako zapytania w web search
2. Znajdź stronę w języku {config["search_lang"]}, która odpowiada na pytanie
3. Porównaj odpowiedź ze strony z TEKSTEM Z ARTYKUŁU
4. Jeśli tekst jest poprawny → "confirmed" + źródło
5. Jeśli tekst ma błędne dane → "corrected" + poprawna wartość + źródło
6. Jeśli brak źródła w języku {config["search_lang"]} → "unverified"
7. NIE wymyślaj źródeł ani liczb

FORMAT ŹRÓDŁA:
- "source": etykieta tekstowa — nazwa źródła + rok (BEZ URL-i)
- "source_url": DOKŁADNY URL strony (pełny https://)
- source_url MUSI być prawdziwym URL znalezionym przez web search

OUTPUT (ŚCISŁY JSON):
{{
  "1": {{
    "status": "confirmed",
    "source": "{source_label}: ...",
    "source_url": "https://...",
    "note": ""
  }},
  "2": {{
    "status": "corrected",
    "source": "{source_label}: ...",
    "source_url": "https://...",
    "corrected_value": "Poprawna wartość to ...",
    "note": "Opis korekty"
  }},
  "3": {{
    "status": "unverified",
    "source": "",
    "source_url": "",
    "note": "Brak źródła w języku {config["search_lang"]}"
  }}
}}

Statusy: "confirmed" | "corrected" | "unverified"
"""


def verify_claims(claims: List[Dict]) -> Dict:
    """
    Wysyła claimy do LLM z web search.
    Zwraca dict {claim_id_str: {status, source, source_url, note}}.
    """
    if not claims:
        return {}

    print(f"\n🔍 Etap 3: Weryfikacja {len(claims)} claimów przez web search...")
    prompt = build_verification_prompt(claims)

    if DEBUG_MODE:
        print(f"   📤 Długość promptu: {len(prompt)} znaków")

    try:
        result = client.responses.create(
            model=MODEL_NAME,
            input=prompt,
            tools=[{"type": "web_search_preview"}],
            tool_choice="auto",
        )

        parsed = parse_json_response(result.output_text)

        # Podsumowanie
        confirmed = sum(1 for v in parsed.values() if v.get("status") == "confirmed")
        corrected = sum(1 for v in parsed.values() if v.get("status") == "corrected")
        unverified = sum(1 for v in parsed.values() if v.get("status") == "unverified")
        print(f"   ✅ Potwierdzone: {confirmed}")
        print(f"   🔄 Skorygowane: {corrected}")
        print(f"   ❓ Niezweryfikowane: {unverified}")

        return parsed

    except Exception as e:
        print(f"   ❌ Błąd web search: {e}")
        return {}


def parse_json_response(text: str) -> Dict:
    """
    Parsuje JSON z odpowiedzi LLM.
    Obsługuje markdown fences (```json ... ```) i częściowe parsowanie.
    """
    # Usuń markdown fences
    cleaned = re.sub(r'```json\s*', '', text)
    cleaned = re.sub(r'```\s*', '', cleaned)

    try:
        # Spróbuj znaleźć blok JSON
        match = re.search(r'\{[\s\S]*\}\s*$', cleaned.strip())
        if match:
            return json.loads(match.group())
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: wyciągnij pojedyncze obiekty claimów
        out = {}
        for cid in re.findall(r'"(\d+)"\s*:', text):
            try:
                pattern = rf'"{cid}"\s*:\s*(\{{[^{{}}]*\}})'
                obj_match = re.search(pattern, text)
                if obj_match:
                    out[cid] = json.loads(obj_match.group(1))
            except Exception:
                pass
        return out


# =====================================================
# ETAP 4 – WSTAWIANIE ŹRÓDEŁ DO HTML
# =====================================================
# Cel: Dodać cytaty źródłowe do akapitów z potwierdzonymi claimami
# Metoda: String replacement w HTML (od końca do początku)
# Output: wzbogacony HTML + statystyki
#
# KLUCZOWE DECYZJE:
# - confirmed → dodaj źródło
# - corrected → dodaj źródło (ale NIE zmieniaj tekstu!)
# - unverified → zostaw bez zmian (czysty tekst)
# - Reverse order → żeby pozycje znakowe się nie przesuwały

def clean_source_value(value: str) -> str:
    """
    Czyści tekst źródła z URL-i, protokołów, www.
    Wynik: czytelna etykieta dla ludzi.
    """
    if not value:
        return value

    # Usuń surowe URL-e → zostaw tylko domenę
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+|www\.[^\s<>"{}|\\^`\[\]]+'

    def replace_url(match):
        url = match.group(0)
        domain_match = re.search(r'(?:https?://)?(?:www\.)?([^/]+)', url)
        if domain_match:
            return domain_match.group(1).split('/')[0]
        return ""

    value = re.sub(url_pattern, replace_url, value)

    # Usuń linki Markdown [tekst](url)
    value = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', value)

    # Usuń tagi <a href>
    value = re.sub(r'<a[^>]*href=[^>]*>([^<]*)</a>', r'\1', value, flags=re.IGNORECASE)

    # Normalizacja
    value = re.sub(r'^https?://', '', value)
    value = re.sub(r'^www\.', '', value)

    return value.strip()


def build_citation(source: str, source_url: str) -> str:
    """
    Buduje cytat źródłowy.
    Format: "Źródło: WHO, 2024 — who.int/news-room/fact-sheets/..."
    Jeśli brak URL: "Źródło: WHO, 2024"
    """
    source = source.strip().rstrip(".")

    if not source_url:
        return source

    # Oczyść URL do wyświetlania
    display_url = source_url.strip()
    display_url = re.sub(r'^https?://', '', display_url)
    display_url = re.sub(r'^www\.', '', display_url)
    display_url = display_url.rstrip('/')

    # Skróć bardzo długie URL-e (max 120 znaków)
    if len(display_url) > 120:
        parts = display_url.split('/')
        display_url = '/'.join(parts[:4])

    return f"{source} — {display_url}"


def add_source_to_element(html: str, source: str, tag_name: str) -> str:
    """
    Dodaje cytat źródłowy przed zamykającym tagiem <p> lub <li>.
    Obsługuje interpunkcję (kropka na końcu zdania).
    """
    source = source.strip().rstrip(".")
    close_tag = f"</{tag_name}>"
    close_pos = html.rfind(close_tag)

    if close_pos == -1:
        return html + f" ({source})"

    before_close = html[:close_pos].rstrip()

    # Sprawdź czy już jest źródło (nie duplikuj)
    if re.search(r'\((?:Source|Źródło):', before_close[-250:]):
        return html

    # Wstaw przed zamykającym tagiem
    if before_close.endswith('.'):
        before_close = before_close[:-1]
        return f"{before_close} ({source}).{close_tag}{html[close_pos + len(close_tag):]}"
    else:
        return f"{before_close} ({source}){close_tag}{html[close_pos + len(close_tag):]}"


def insert_sources(article_html: str, claims: List[Dict], verifications: Dict) -> Tuple[str, Dict]:
    """
    Wstawia cytaty źródłowe do artykułu HTML.
    Claimy przychodzą posortowane po score, ale wstawianie wymaga
    kolejności pozycji w dokumencie. Sortujemy po pozycji, potem
    przetwarzamy od końca do początku (żeby pozycje się nie przesuwały).
    """
    stats = {
        "total_claims": len(claims),
        "sources_added": 0,
        "corrections_made": 0,
        "unverified": 0,
        "sources_list": [],
    }

    if not verifications:
        return article_html, stats

    enriched = article_html

    # Reverse order — od końca dokumentu do początku.
    # Claimy przychodzą posortowane po score, ale wstawianie wymaga
    # kolejności pozycji w dokumencie (żeby replace nie przesuwał pozycji).
    # Sortujemy po pozycji paragraph_html w dokumencie, potem odwracamy.
    claims_by_position = sorted(
        claims,
        key=lambda c: article_html.find(c["paragraph_html"]),
        reverse=True,  # od końca dokumentu
    )
    for claim in claims_by_position:
        cid = str(claim["id"])
        verification = verifications.get(cid, {})
        status = verification.get("status", "unverified")
        source = clean_source_value(verification.get("source", ""))
        source_url = (verification.get("source_url") or "").strip()

        if status == "unverified" or not source:
            stats["unverified"] += 1
            continue

        # Zbuduj cytat
        citation = build_citation(source, source_url)
        original_html = claim["paragraph_html"]

        if status == "confirmed":
            new_html = add_source_to_element(original_html, citation, claim["tag_name"])
            enriched = enriched.replace(original_html, new_html, 1)
            stats["sources_added"] += 1
            stats["sources_list"].append(citation)

            if DEBUG_MODE:
                print(f"   ✓ #{cid}: +źródło → {citation}")

        elif status == "corrected":
            # Dodaj źródło, ale NIE zmieniaj tekstu
            # Korekta jest flagowana do przeglądu
            new_html = add_source_to_element(original_html, citation, claim["tag_name"])
            enriched = enriched.replace(original_html, new_html, 1)
            stats["corrections_made"] += 1
            stats["sources_list"].append(citation)

            note = verification.get("note", "")
            if DEBUG_MODE:
                print(f"   🔄 #{cid}: korekta → {note[:80]}")
                print(f"         +źródło → {citation}")

    # Deduplikacja listy źródeł
    stats["sources_list"] = list(dict.fromkeys(stats["sources_list"]))

    return enriched, stats


# =====================================================
# ETAP 5 – ZAPIS WZBOGACONEGO ARTYKUŁU
# =====================================================
# Cel: Zapisać artykuł ze źródłami i opcjonalny raport
# Output: output_enriched.html + output_enrichment_report.json

def save_enriched(html: str, stats: Dict, verifications: Dict):
    """
    Zapisuje wzbogacony artykuł i raport weryfikacji.
    """
    # Zapisz artykuł
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n💾 Zapisano artykuł: {OUTPUT_FILE} ({len(html)} znaków)")

    # Zapisz raport
    report = {
        "keyword": KEYWORD,
        "lang": LANG,
        "timestamp": datetime.now().isoformat(),
        "stats": stats,
        "verifications": verifications,
    }
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"📊 Zapisano raport: {REPORT_FILE}")


# =====================================================
# MAIN – URUCHOMIENIE PIPELINE
# =====================================================
if __name__ == "__main__":
    print("\n🚀 START – DATA ENRICHMENT (wersja edukacyjna)")
    print("   • Analizuje czysty draft (bez markerów)")
    print("   • Wyodrębnia twierdzenia weryfikowalne (regex)")
    print("   • Generuje pytania weryfikacyjne (mini)")
    print("   • Weryfikuje przez web search (LLM)")
    print("   • Wstawia cytaty źródłowe do HTML")
    print(f"   • Max {MAX_CLAIMS} claimów na artykuł\n")

    # Etap 1: Wczytanie
    article_html = load_draft(INPUT_FILE)

    # Etap 2: Ekstrakcja claimów
    claims = extract_claims(article_html)

    if not claims:
        print("\nℹ️ Brak twierdzeń do weryfikacji — kopiuję artykuł bez zmian")
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(article_html)
        print(f"💾 Zapisano: {OUTPUT_FILE}")
    else:
        # Etap 2b: Generowanie pytań weryfikacyjnych
        claims = generate_questions(claims)

        # Etap 3: Weryfikacja
        verifications = verify_claims(claims)

        # Etap 4: Wstawianie źródeł
        print(f"\n✏️ Etap 4: Wstawianie źródeł...")
        enriched_html, stats = insert_sources(article_html, claims, verifications)

        # Podsumowanie
        print(f"\n📊 WYNIK ENRICHMENTU:")
        print(f"   • Claimów przeskanowanych: {stats['total_claims']}")
        print(f"   • Źródeł dodanych: {stats['sources_added']}")
        print(f"   • Korekt (do przeglądu): {stats['corrections_made']}")
        print(f"   • Niezweryfikowanych: {stats['unverified']}")
        if stats["sources_list"]:
            print(f"   • Źródła: {', '.join(stats['sources_list'][:5])}")

        # Etap 5: Zapis
        save_enriched(enriched_html, stats, verifications)

    print("\n✅ GOTOWE")