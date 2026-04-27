#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Query Fan-Out Pipeline
======================
Input: słowo kluczowe
Output: lista tematów z pytaniami + PAA
"""

import json
import re
import requests
from base64 import b64encode
from datetime import datetime

# ========== KONFIGURACJA ==========
KEYWORD = "Jak obniżyć kortyzol po 40tce?"  # <-- ZMIEŃ TUTAJ
LANG = "pl"

# Ustawienia
USE_FAKE_PAA = False  # True = testowe PAA, False = DataForSEO
DEBUG_MODE = True

print("=" * 60)
print(f"🎯 QUERY FAN-OUT: {KEYWORD}")
print("=" * 60)

# ========== PROMPT 1: Intencje i Obszary ==========

PROMPT_PART1 = """# Rola
Jesteś ekspertem semantyki w języku polskim.

# Cel
Rozbij podane zapytanie na podtematy według zdefiniowanych intencji użytkownika.

# Algorytm

## Krok 1: Normalizacja
- Zapisz zapytanie
- Ustal główną encję
- Ustal kategorię tematyczną

## Krok 2: Intencje
Rozważ KAŻDĄ z poniższych intencji - użytkownik wpisujący zapytanie może mieć różne cele, ale wybierz tylko te pasujące do głównego słowa kluczowego:
- **Definicyjna** - czym jest, co to znaczy
- **Problemowa** - objawy, przyczyny, skutki problemu
- **Instrukcyjna** - jak zrobić, jak osiągnąć
- **Decyzyjna** - który wybrać, porównanie opcji
- **Diagnostyczna** - jak sprawdzić, jak zmierzyć

## Krok 3: Obszary
Dla każdej intencji wypisz **główne obszary (podtematy)**, które:
- mają własną logikę
- mogą istnieć jako część tematu głównego (zapytania) lub samodzielnie
- pasują do danej intencji
- **są SILNIE POWIĄZANE z głównym słowem kluczowym** - nie wymyślaj na siłę
- limit 5 obszarów (podtematów) na intencję, tylko istotne, bez wypełniania limitu na siłę dla każdej intencji

Dla każdego obszaru (podtematu) podaj:
- **Pytanie** na które odpowiada ten obszar
- **YMYL** (tak/nie) - czy błędna odpowiedź może mieć poważne konsekwencje

## YMYL - definicja
YMYL = Your Money Your Life. Oznacz YMYL: tak TYLKO gdy błędna informacja może:
- Zaszkodzić zdrowiu (choroby, leki, objawy medyczne)
- Spowodować straty finansowe (inwestycje, podatki, kredyty)
- Mieć konsekwencje prawne (prawo, umowy, regulacje)

YMYL: nie dla zwykłych porad domowych, przepisów, hobby, rozrywki.

# Zasady
- Maksymalnie 5 obszarów na intencję
- Obszary = frazy opisujące temat (mogą być 2-4 słowa)
- Pytanie = konkretne pytanie użytkownika na które odpowiada obszar

# Zasady odpowiedzi
- Zwróć TYLKO format JSON
- Intencje TYLKO z listy 5 zdefiniowanych
- Maksymalnie 5 obszarów na intencję
- Każdy obszar z pytaniem i oznaczeniem YMYL

Zwróć JSON:
{
  "zapytanie": "...",
  "encja": "...",
  "kategoria": "...",
  "intencje": [
    {
      "nazwa": "Definicyjna",
      "obszary": [
        {"temat": "...", "pytanie": "...", "ymyl": true/false}
      ]
    }
  ]
}"""

# ========== PROMPT 2: Przypisanie PAA ==========

PROMPT_PART2 = """# Rola
Jesteś ekspertem semantyki w języku polskim.

# Cel
Przypisz pytania PAA do odpowiednich obszarów tematycznych.

# Input zawiera:
- glowne_slowo_kluczowe: główne zapytanie użytkownika
- obszary: lista obszarów tematycznych (każdy ma "temat" i "pytanie")
- pytania_paa: pytania People Also Ask do przypisania

# Zasady:
1. Dla każdego pytania PAA znajdź NAJBARDZIEJ pasujący obszar
2. Pytanie PAA przypisz TYLKO jeśli jest SPECYFICZNE dla danego obszaru
3. Ogólne pytania (które pasują do głównego słowa kluczowego, ale nie do konkretnego obszaru) → "niepasujące"
4. Jeden PAA może pasować tylko do jednego obszaru

# Przykład
Główne słowo: "Jak obniżyć kortyzol po 40tce?"
Obszary: ["Dieta", "Sen", "Stres", "Objawy"]

"Co jeść żeby obniżyć kortyzol?" → pasuje do "Dieta" (specyficzne)
"Jak najszybciej zbić kortyzol?" → niepasujące (ogólne, nie specyficzne dla żadnego obszaru)
"Po czym poznać wysoki kortyzol?" → pasuje do "Objawy" (specyficzne)

# Output
Zwróć JSON z mapowaniem - dla każdego obszaru lista pasujących PAA:
{
  "przypisania": {
    "Dieta": ["Co jeść żeby obniżyć kortyzol?"],
    "Sen": [],
    "Objawy": ["Po czym poznać wysoki kortyzol?"]
  },
  "niepasujace_paa": ["Jak najszybciej zbić kortyzol?"]
}

Użyj DOKŁADNYCH nazw obszarów z inputu jako kluczy."""


# ========== FUNKCJE ==========

def call_llm(system_prompt: str, user_prompt: str) -> dict:
    """Wywołuje LLM i zwraca JSON"""
    from openai import OpenAI
    client = OpenAI(api_key=API_OPENAI_KEY)
    
    try:
        # Połącz system i user prompt
        full_prompt = f"{system_prompt}\n\n{user_prompt}\n\nZwróć TYLKO valid JSON, bez dodatkowego tekstu."
        
        response = client.responses.create(
            model="gpt-5.2",
            input=full_prompt,
            reasoning={
                "effort": "medium"
            }
        )
        
        # Wyciągnij tekst z odpowiedzi
        result_text = None
        if hasattr(response, 'output_text'):
            result_text = response.output_text
        elif hasattr(response, 'output'):
            result_text = response.output
        elif hasattr(response, 'content'):
            result_text = response.content
        else:
            # Spróbuj jako string
            result_text = str(response)
        
        if DEBUG_MODE:
            print(f"   LLM response type: {type(response)}")
        
        # Znajdź JSON w odpowiedzi
        json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        else:
            print(f"⚠️ Nie znaleziono JSON w odpowiedzi")
            if DEBUG_MODE:
                print(f"   Odpowiedź: {result_text[:500] if result_text else 'BRAK'}...")
            return {}
            
    except Exception as e:
        print(f"❌ Błąd LLM: {e}")
        import traceback
        if DEBUG_MODE:
            traceback.print_exc()
        return {}


def get_paa_questions(keyword: str, lang: str = 'pl') -> list:
    """Pobiera pytania PAA z DataForSEO"""
    
    if USE_FAKE_PAA:
        return [
            f"Czym jest {keyword.split()[0]}?",
            f"Jak naturalnie obniżyć kortyzol?",
            f"Jakie są objawy wysokiego kortyzolu?",
            f"Co jeść żeby obniżyć kortyzol?",
            f"Czy kawa podnosi kortyzol?",
            f"Jak stres wpływa na kortyzol?",
            f"Kiedy badać kortyzol?",
            f"Jakie suplementy obniżają kortyzol?"
        ]
    
    # Użyj bezpośrednio zmiennych z Colab
    credentials = b64encode(f"{DFS_LOGIN}:{DFS_PASSWORD}".encode()).decode('ascii')
    headers = {
        'Authorization': f'Basic {credentials}',
        'Content-Type': 'application/json'
    }
    
    location_codes = {'pl': 2616, 'en': 2840, 'de': 2276, 'fr': 2250}
    
    payload = [{
        "keyword": keyword,
        "language_code": lang,
        "location_code": location_codes.get(lang, 2616),
        "device": "desktop",
        "people_also_ask_click_depth": 2
    }]
    
    try:
        response = requests.post(
            "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"⚠️ DataForSEO status: {response.status_code}")
            return []
        
        data = response.json()
        questions = []
        
        if "tasks" in data and data["tasks"]:
            task = data["tasks"][0]
            if "result" in task and task["result"]:
                items = task["result"][0].get("items", [])
                for item in items:
                    if item.get("type") == "people_also_ask":
                        for paa_item in item.get("items", []):
                            question = paa_item.get("title", "")
                            if question:
                                questions.append(question)
        
        return list(dict.fromkeys(questions))[:20]
    
    except Exception as e:
        print(f"❌ Błąd PAA: {e}")
        return []


def format_output(result: dict) -> str:
    """Formatuje wynik do zapisu"""
    lines = []
    lines.append(f"ARTYKUŁ GŁÓWNY: \"{result.get('artykul_glowny', '')}\"")
    lines.append("")
    
    # Grupuj po intencjach jeśli są
    current_intencja = None
    
    for obszar in result.get('obszary_z_paa', []):
        # Sprawdź czy jest intencja
        intencja = obszar.get('intencja')
        if intencja and intencja != current_intencja:
            if current_intencja is not None:
                lines.append("")
            lines.append(f"--- {intencja} ---")
            lines.append("")
            current_intencja = intencja
        
        temat = obszar.get('temat') or obszar.get('nazwa') or '(brak tematu)'
        pytanie = obszar.get('pytanie_glowne') or obszar.get('pytanie') or '(brak pytania)'
        ymyl = obszar.get('ymyl', False)
        
        lines.append(str(temat))
        lines.append(str(pytanie))
        lines.append(f"YMYL: {'tak' if ymyl else 'nie'}")
        
        pytania_paa = obszar.get('pytania_paa', [])
        if pytania_paa:
            lines.append("PAA:")
            for paa in pytania_paa:
                if paa:
                    lines.append(f"- {paa}")
        
        lines.append("")
    
    niepasujace = result.get('niepasujace_paa', [])
    if niepasujace:
        lines.append("=" * 40)
        lines.append("NIEPASUJĄCE PAA:")
        for paa in niepasujace:
            if paa:
                lines.append(f"- {paa}")
    
    return "\n".join(lines)


# ========== GŁÓWNY PIPELINE ==========

def run_pipeline(keyword: str, lang: str = 'pl'):
    """Główny pipeline Query Fan-Out"""
    
    # 1. Pobierz PAA
    print("\n1️⃣ Pobieranie PAA...")
    paa_questions = get_paa_questions(keyword, lang)
    print(f"   Pobrano {len(paa_questions)} pytań PAA")
    if DEBUG_MODE and paa_questions:
        for q in paa_questions[:3]:
            print(f"   - {q}")
        if len(paa_questions) > 3:
            print(f"   ... i {len(paa_questions) - 3} więcej")
    
    # 2. LLM #1: Intencje i Obszary
    print("\n2️⃣ LLM #1: Generowanie intencji i obszarów...")
    result1 = call_llm(
        PROMPT_PART1,
        f"Zapytanie: \"{keyword}\""
    )
    
    if DEBUG_MODE:
        print(f"   Intencje: {len(result1.get('intencje', []))}")
        for intencja in result1.get('intencje', []):
            print(f"   - {intencja['nazwa']}: {len(intencja.get('obszary', []))} obszarów")
    
    # Przygotuj listę wszystkich obszarów do przypisania PAA
    wszystkie_obszary = []
    for intencja in result1.get('intencje', []):
        for obszar in intencja.get('obszary', []):
            wszystkie_obszary.append({
                "intencja": intencja['nazwa'],
                "temat": obszar['temat'],
                "pytanie": obszar['pytanie'],
                "ymyl": obszar.get('ymyl', False)
            })
    
    # 3. LLM #2: Przypisanie PAA (tylko jeśli są pytania PAA)
    if paa_questions:
        print("\n3️⃣ LLM #2: Przypisanie PAA do obszarów...")
        print(f"   Wysyłam {len(wszystkie_obszary)} obszarów do wzbogacenia PAA")
        
        input_for_paa = {
            "glowne_slowo_kluczowe": keyword,
            "obszary": wszystkie_obszary,
            "pytania_paa": paa_questions
        }
        
        result2 = call_llm(
            PROMPT_PART2,
            f"Input:\n{json.dumps(input_for_paa, ensure_ascii=False, indent=2)}"
        )
        
        # Pobierz mapowanie PAA -> obszar
        przypisania = result2.get('przypisania', {})
        niepasujace = result2.get('niepasujace_paa', [])
        
        if DEBUG_MODE:
            przypisane_count = sum(len(v) for v in przypisania.values())
            print(f"   Przypisano PAA: {przypisane_count}")
            print(f"   Niepasujące PAA: {len(niepasujace)}")
        
        # Zbuduj finalny wynik - każdy obszar z przypisanymi PAA
        obszary_z_paa = []
        for obszar in wszystkie_obszary:
            temat = obszar['temat']
            # Znajdź PAA dla tego obszaru (sprawdź różne warianty klucza)
            paa_dla_obszaru = []
            for klucz, pytania in przypisania.items():
                if klucz.lower() == temat.lower() or temat.lower() in klucz.lower() or klucz.lower() in temat.lower():
                    paa_dla_obszaru = pytania
                    break
            
            obszary_z_paa.append({
                "intencja": obszar.get('intencja', ''),
                "temat": temat,
                "pytanie_glowne": obszar['pytanie'],
                "ymyl": obszar.get('ymyl', False),
                "pytania_paa": paa_dla_obszaru if paa_dla_obszaru else []
            })
        
        result2 = {
            "obszary_z_paa": obszary_z_paa,
            "niepasujace_paa": niepasujace
        }
    else:
        print("\n3️⃣ Brak PAA - pomijam przypisanie")
        # Utwórz wynik bez PAA
        result2 = {
            "obszary_z_paa": [
                {
                    "intencja": o.get('intencja', ''),
                    "temat": o['temat'],
                    "pytanie_glowne": o['pytanie'],
                    "ymyl": o['ymyl'],
                    "pytania_paa": []
                }
                for o in wszystkie_obszary
            ],
            "niepasujace_paa": []
        }
    
    # Dodaj tytuł artykułu
    result2['artykul_glowny'] = keyword
    
    # 4. Formatowanie i zapis
    print("\n4️⃣ Formatowanie wyniku...")
    output_text = format_output(result2)
    
    # Wyświetl
    print("\n" + "=" * 60)
    print("WYNIK:")
    print("=" * 60)
    print(output_text)
    
    # Zapisz do pliku
    filename = f"query_fanout_{keyword.replace(' ', '_').replace('?', '')[:30]}.txt"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(output_text)
    print(f"\n💾 Zapisano do: {filename}")
    
    return result2


# ========== URUCHOMIENIE ==========

if __name__ == "__main__":
    run_pipeline(KEYWORD, LANG)