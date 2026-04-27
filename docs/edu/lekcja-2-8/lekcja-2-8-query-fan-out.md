# 2.8 Query Fan-Out

**Kurs:** AI Content Expert — Blok 2, Lekcja 8
**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 4.9 (7 ocen)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-8/

---

## 🎯 Cel lekcji

Opanowanie techniki **Query Fan-Out** do rozszerzania zapytań i lepszego pokrycia tematu.

Praktyczny przewodnik po procesie Query fan-out, który jest kluczowym etapem przygotowania treści semantycznych. Dzięki tej metodzie rozbijesz jedno ogólne zapytanie na precyzyjne obszary tematyczne, co pozwoli Ci stworzyć artykuł idealnie dopasowany do intencji użytkownika oraz zaplanować strukturę linkowania wewnętrznego (tematyczny autorytet).

---

## 📒 Notatka z lekcji

### Czym jest query fan-out w praktyce

Query fan-out to proces rozbicia głównego zapytania użytkownika na zestaw równoległych osi interpretacyjnych. Systemy wyszukiwania (i modele LLM) traktują te osie jako osobne problemy do rozwiązania.

**To NIE jest:** lista synonimów, klastrowanie słów kluczowych ani gotowy spis treści (outline).

**To JEST:** fundament projektowania artykułu (mikrosemantyka) oraz kontekstu całej domeny (makrosemantyka).

### Trzy wymiary fan-outu

Każde zapytanie należy przeanalizować w trzech wymiarach, aby uzyskać pełny kontekst semantyczny:

**1. Fan-out intencyjny**

Odpowiada na pytanie: „Po co użytkownik to wpisuje?". Wyróżniamy 6 głównych intencji:

- **Definicyjna:** Co to jest? Jaka jest rola X?
- **Problemowa:** Dlaczego mam problem? Jakie są przyczyny?
- **Instrukcyjna:** Jak to zrobić krok po kroku?
- **Decyzyjna:** Co wybrać? Co działa najlepiej?
- **Diagnostyczna:** Jak sprawdzić/zinterpretować wyniki?
- **Porównawcza:** Czym się różni A od B?

**2. Fan-out tematyczny**

Określa stabilne obszary (treści evergreen), które muszą zostać pokryte, aby odpowiedź była kompletna. Tematy te odpowiadają na pytania pomocnicze (np. często pojawiające się w sekcjach People Also Ask).

**3. Fan-out semantyczno-encjowy**

To praca na modelu świata — określenie konkretnych obiektów (encji) i relacji między nimi (np. *kortyzol → jest wydzielany przez → nadnercza*).

### Procedura robocza krok po kroku

Algorytm postępowania przy tworzeniu analizy dla konkretnego zapytania (np. „kortyzol"):

**Krok 1: Normalizacja zapytania**

- Zapisz zapytanie w jednym prostym zdaniu.
- Określ:
  - Główną encję (np. hormon)
  - Kontekst/Kategorię (np. zdrowie)
  - Typ ryzyka — czy temat należy do kategorii **YMYL** (Your Money, Your Life)? Jeśli tak, wymaga szczególnej rzetelności i warstw zabezpieczających (źródeł).

**Krok 2: Generowanie intencji i obszarów**

- Wypisz unikalne intencje użytkownika.
- Dla każdej z nich przypisz maksymalnie 5 istotnych obszarów tematycznych.
- **Zasada:** Nie wypełniaj obszarów na siłę. Wybieraj tylko te, które mają własną logikę i są silnie powiązane z zapytaniem.
- Dla każdego obszaru sformułuj jedno konkretne pytanie pomocnicze.

**Krok 3: Klasyfikacja mikro i makro (Test samodzielności)**

Dla każdego wygenerowanego obszaru zadaj pytanie:
> „Czy użytkownik mógłby wpisać to jako osobne zapytanie i oczekiwać pełnej, osobnej odpowiedzi?"

- **TAK (MAKRO):** Oznacz temat jako osobny artykuł do napisania (backlog). W artykule bazowym umieść tylko krótką wzmiankę i zaplanuj link wewnętrzny.
- **NIE (MIKRO):** Oznacz temat jako sekcję w obecnie przygotowywanym artykule bazowym.

**Krok 4: Projektowanie artykułu bazowego**

- Wybierz jedną, dominującą intencję (np. dla zapytania „jak obniżyć…" będzie to intencja instrukcyjna).
- Użyj tematów z tej intencji jako głównych sekcji artykułu.
- Zastosuj strukturę **BLUF** (Bottom Line Up Front): zacznij fragment od bezpośredniej odpowiedzi, a następnie dodaj kontekst.
- Dodaj warstwę zabezpieczającą, jeśli temat jest z grupy YMYL.

---

## 🛠️ Narzędzia i automatyzacja

Proces ten możesz realizować na trzy sposoby:

### 1. Prosty Prompt

Idealny do szybkiego rozbicia słowa kluczowego na listę tematów i pytań w ChatGPT.

📥 **Plik:** `T2F8-query_fan_out_simple_prompt.md`

```markdown
# Rola
Jesteś ekspertem semantyki w języku polskim.

# Cel
Rozbij podane zapytanie na podtematy według intencji użytkownika.

# Reguły
- Rozważ KAŻDĄ intencję, ale wybierz tylko pasujące do słowa kluczowego:
  - **Definicyjna** - czym jest, co to znaczy
  - **Problemowa** - objawy, przyczyny, skutki problemu
  - **Instrukcyjna** - jak zrobić, jak osiągnąć
  - **Decyzyjna** - który wybrać, porównanie opcji
  - **Diagnostyczna** - jak sprawdzić, jak zmierzyć
  - **Porównawcza** - różnice, porównania, plusy i minusy
- Dla każdej intencji wypisz obszary (podtematy), które:
  - mają własną logikę
  - są SILNIE POWIĄZANE z głównym słowem kluczowym
  - limit 5 obszarów na intencję, tylko istotne, bez wypełniania na siłę
- Dla każdego obszaru podaj pytanie i YMYL (tak/nie)
- YMYL: tak tylko gdy błąd może zaszkodzić zdrowiu, finansom lub mieć konsekwencje prawne

# Przykłady

Input:
Słowo kluczowe: "kortyzol"

Output:
Zapytanie: "kortyzol"
Encja główna: kortyzol
Kategoria: zdrowie

Intencja: Definicyjna
- Definicja i rola — Czym jest kortyzol i jaką pełni funkcję? — YMYL: tak
- Rytm dobowy — Jak zmienia się poziom kortyzolu w ciągu dnia? — YMYL: tak

Intencja: Problemowa
- Objawy wysokiego kortyzolu — Jakie są objawy podwyższonego kortyzolu? — YMYL: tak
- Przyczyny — Co powoduje wysoki kortyzol? — YMYL: tak

Intencja: Instrukcyjna
- Dieta — Jak dieta wpływa na kortyzol? — YMYL: tak
- Sen — Jak sen reguluje kortyzol? — YMYL: tak

Intencja: Diagnostyczna
- Badania — Jak zbadać poziom kortyzolu? — YMYL: tak

# Output
Format odpowiedzi:
Zapytanie: "[słowo kluczowe]"
Encja główna: [encja]
Kategoria: [kategoria]

Intencja: [nazwa]
- [Obszar/temat] — [Pytanie?] — YMYL: [tak/nie]

----------

# Słowo kluczowe:
Jak obniżyć kortyzol po 40tce?
```

### 2. Zaawansowane Prompty (Część 1 i 2)

Pozwalają na precyzyjną klasyfikację mikro/makro i budowanie strategii contentowej bez umiejętności programistycznych.

#### Prompt cz. 1 (Intencje)

📥 **Plik:** `T2F8-query_fan_out_advanced-intent-themes.md`

```markdown
# Rola
Jesteś ekspertem semantyki w języku polskim.

# Cel
Rozbij podane zapytanie na podtematy według zdefiniowanych intencji użytkownika.

# Algorytm

## Krok 1: Normalizacja
- Zapisz zapytanie
- Ustal główną encję
- Ustal kategorię tematyczną

## Krok 2: Intencje
Rozważ KAŻDĄ z poniższych intencji - użytkownik wpisujący zapytanie może mieć
różne cele, ale wybierz tylko te pasujące do głównego słowa kluczowego:
- **Definicyjna** - czym jest, co to znaczy
- **Problemowa** - objawy, przyczyny, skutki problemu
- **Instrukcyjna** - jak zrobić, jak osiągnąć
- **Decyzyjna** - który wybrać, porównanie opcji
- **Diagnostyczna** - jak sprawdzić, jak zmierzyć
- **Porównawcza** - porównanie, testy A/B

## Krok 3: Obszary
Dla każdej intencji wypisz **główne obszary (podtematy)**, które:
- mają własną logikę
- mogą istnieć jako część tematu głównego (zapytania) lub samodzielnie
- pasują do danej intencji
- limit 5 obszarów na intencję, tylko istotne

Dla każdego obszaru podaj:
- **Pytanie** na które odpowiada ten obszar
- **YMYL** (tak/nie) - czy błędna odpowiedź może mieć poważne konsekwencje

## YMYL - definicja
YMYL = Your Money Your Life. Oznacz YMYL: tak TYLKO gdy błędna informacja może:
- Zaszkodzić zdrowiu (choroby, leki, objawy medyczne)
- Spowodować straty finansowe (inwestycje, podatki, kredyty)
- Mieć konsekwencje prawne (prawo, umowy, regulacje)

YMYL: nie dla zwykłych porad domowych, przepisów, hobby, rozrywki.

# Format outputu

Zapytanie: "[zapytanie]"
Encja główna: [encja]
Kategoria: [kategoria]

Intencja: [nazwa]
* [Obszar] — [Pytanie?] — YMYL: [tak/nie]

# Słowo kluczowe
Jak obniżyć kortyzol po 40tce?
```

#### Prompt cz. 2 (Klasyfikacja Mikro/Makro)

📥 **Plik:** `T2F8-query_fan_out_advanced-classification.md`

```markdown
# Rola
Jesteś ekspertem semantyki w języku polskim.

# Cel
Na podstawie podanych intencji i obszarów/tematów sklasyfikuj każdy obszar/temat
jako MICRO (sekcja w artykule głównym) lub MACRO (osobny artykuł).

# Algorytm

## Test samodzielności
Dla każdego obszaru/tematu zadaj pytanie:
"Czy użytkownik mógłby wpisać to jako OSOBNE zapytanie i oczekiwać OSOBNEJ,
pełnej odpowiedzi?"

- **TAK** → MACRO (osobny artykuł)
- **NIE** → MICRO (sekcja w artykule głównym)

## Zasady klasyfikacji
- MICRO = obszar/temat jest częścią odpowiedzi na główne zapytanie
- MACRO = obszar/temat zasługuje na własny artykuł, bo ma osobny intent
- Artykuł główny = tytuł identyczny z zapytaniem
- W artykule głównym umieść tylko obszary/tematy MICRO
- Obszary/tematy MACRO to propozycje osobnych artykułów

# Format outputu

ARTYKUŁ GŁÓWNY: "[zapytanie]"

Intencja: [nazwa]
* [Obszar/temat MICRO] — [Pytanie?] — YMYL: [tak/nie]

ARTYKUŁY DODATKOWE:
* [Obszar/temat MACRO - ogólny, bez kontekstu z zapytania głównego] — [Pytanie] — YMYL: [tak/nie]

# Zasady odpowiedzi
- **MICRO: Kopiuj obszary/tematy 1:1 z inputu** - nie modyfikuj, zachowaj kontekst
- **MACRO: Usuń kontekst specyficzny z zapytania głównego** - artykuły dodatkowe
  powinny być evergreen (np. "po 40tce", "dla kobiet", "w ciąży")
- Wynik to obszary tematyczne według intencji, NIE struktura artykułu

[User prompt]
Wstaw odpowiedź z części pierwszej (poprzedni prompt)
```

### 3. Skrypt Python (z PAA)

Pobiera dane PAA (People Also Ask) bezpośrednio z Google (przez API DataForSEO) i używa LLM do automatycznego przypisania realnych pytań użytkowników do konkretnych obszarów tematycznych.

**Wymagania:** Klucz API OpenAI oraz dostęp do DataForSEO.

**Wskazówka:** Wykorzystanie realnych pytań PAA sprawia, że Twój artykuł staje się „magnesem" na ruch z wyszukiwarki, ponieważ odpowiada na faktyczne dylematy użytkowników.

📥 **Plik:** `T2F8-query_fan_out_simple_paa.py`

```python
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
KEYWORD = "Jak obniżyć kortyzol po 40tce?"
LANG = "pl"

# Ustawienia
USE_FAKE_PAA = False  # True = testowe PAA, False = DataForSEO
DEBUG_MODE = True

# ========== PROMPT 1: Intencje i Obszary ==========
PROMPT_PART1 = """# Rola
Jesteś ekspertem semantyki w języku polskim.
... (pełny prompt jak w sekcji "Prompt cz. 1" powyżej)
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

# Zasady:
1. Dla każdego pytania PAA znajdź NAJBARDZIEJ pasujący obszar
2. Pytanie PAA przypisz TYLKO jeśli jest SPECYFICZNE dla danego obszaru
3. Ogólne pytania (które pasują do głównego słowa kluczowego, ale nie do
   konkretnego obszaru) → "niepasujące"
4. Jeden PAA może pasować tylko do jednego obszaru

# Output JSON:
{
  "przypisania": {
    "Dieta": ["Co jeść żeby obniżyć kortyzol?"],
    "Sen": [],
    "Objawy": ["Po czym poznać wysoki kortyzol?"]
  },
  "niepasujace_paa": ["Jak najszybciej zbić kortyzol?"]
}
"""

# ========== FUNKCJE ==========

def call_llm(system_prompt, user_prompt):
    """Wywołuje LLM i zwraca JSON"""
    from openai import OpenAI
    client = OpenAI(api_key=API_OPENAI_KEY)
    full_prompt = f"{system_prompt}\n\n{user_prompt}\n\nZwróć TYLKO valid JSON."
    response = client.responses.create(
        model="gpt-5.2",
        input=full_prompt,
        reasoning={"effort": "medium"}
    )
    result_text = getattr(response, 'output_text', None) or str(response)
    json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
    return json.loads(json_match.group()) if json_match else {}


def get_paa_questions(keyword, lang='pl'):
    """Pobiera pytania PAA z DataForSEO"""
    if USE_FAKE_PAA:
        return [
            f"Czym jest {keyword.split()[0]}?",
            "Jak naturalnie obniżyć kortyzol?",
            "Jakie są objawy wysokiego kortyzolu?",
            # ...
        ]

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
    response = requests.post(
        "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
        json=payload, headers=headers, timeout=60
    )
    data = response.json()
    questions = []
    for task in data.get("tasks", []):
        for result in task.get("result", []) or []:
            for item in result.get("items", []):
                if item.get("type") == "people_also_ask":
                    for paa_item in item.get("items", []):
                        q = paa_item.get("title", "")
                        if q:
                            questions.append(q)
    return list(dict.fromkeys(questions))[:20]


def run_pipeline(keyword, lang='pl'):
    """Główny pipeline Query Fan-Out"""
    # 1. Pobierz PAA
    paa_questions = get_paa_questions(keyword, lang)

    # 2. LLM #1: Intencje i Obszary
    result1 = call_llm(PROMPT_PART1, f"Zapytanie: \"{keyword}\"")

    wszystkie_obszary = []
    for intencja in result1.get('intencje', []):
        for obszar in intencja.get('obszary', []):
            wszystkie_obszary.append({
                "intencja": intencja['nazwa'],
                "temat": obszar['temat'],
                "pytanie": obszar['pytanie'],
                "ymyl": obszar.get('ymyl', False)
            })

    # 3. LLM #2: Przypisanie PAA
    if paa_questions:
        input_for_paa = {
            "glowne_slowo_kluczowe": keyword,
            "obszary": wszystkie_obszary,
            "pytania_paa": paa_questions
        }
        result2 = call_llm(
            PROMPT_PART2,
            f"Input:\n{json.dumps(input_for_paa, ensure_ascii=False, indent=2)}"
        )
        # ... (mapowanie PAA -> obszary, zapis do pliku)

    return result2


if __name__ == "__main__":
    run_pipeline(KEYWORD, LANG)
```

---

## 📝 Transkrypcja wideo

Cześć, witam Was w kolejnej lekcji. Na samym początku poproszę Was o skupienie, ponieważ ten temat jest nie tylko rozległy, ale według mnie jest to **jeden z trzech, czterech tematów, które są najważniejsze w całym naszym kursie**.

Jesteśmy w bloku drugim i zostały nam, oprócz tej lekcji, jeszcze dwie lekcje, które zakończą nasze solidne przygotowania do generowania treści. W bloku trzecim będziemy tę treść już bezpośrednio generować, wykorzystując wszystko, co osiągnęliśmy.

Jeżeli spojrzycie na opis lekcji, zobaczycie, że tym razem jest on rozległy — opisałem każdy prompt i każdy plik. Prompty mają input, output. Skrypt Python również ma wszystkie wymagania. Później jest dość rozległa część teoretyczna, która być może niewiele Wam powie, ale po lekcji będziecie mogli sięgnąć i utrwalić.

### Czym jest Query Fan-Out?

Query fan-out to **rozbicie głównego zapytania** (na przykład spisywanego w Google albo wysyłanego do modeli językowych) **na podzapytania, podtematy**. Po co? Żeby modele albo wyszukiwarka jak najlepiej dobrały odpowiedzi.

My będziemy to wykorzystywać przede wszystkim po to, żeby **stworzyć obszary tematyczne, które pomogą nam zaprojektować cały artykuł**. Nie jest to outline (spis treści artykułu). Nie jest to lista tematów do stworzenia. Wyobraźcie sobie to jako obszary podzielone na trzy części:

- **Intencje** — do nich będziemy przypisywać tematy (też nazywane obszarami).
- **Tematy/obszary**.
- **Encje** — ale my encje robimy zupełnie inaczej, bo nie wierzę w encje przygotowywane przez modele językowe. Daje to pole do halucynacji.

### Strona teoretyczna

Najpierw normalizujemy zapytanie, definiujemy główną encję, dodajemy kontekst (np. dla kortyzolu — zdrowie) i jaki cel ma użytkownik wpisując to zapytanie.

Przypisujemy **6 intencji**: Definicyjna, Problemowa, Instrukcyjna, Decyzyjna, Diagnostyczna, Porównawcza. W mojej opinii wyczerpują one cały zakres możliwości stworzenia podzapytań i ciężko coś dodać.

Dla intencji problemowej: „dlaczego mam problem", „jakie są objawy", „co powoduje". Dla instrukcyjnej: „jak to zrobić", „jakie kroki podjąć".

Dla każdej intencji jesteśmy w stanie przypisać parę obszarów tematycznych — daje nam to szeroki wachlarz wyboru.

Na koniec mamy **pełny kontekst semantyczny**. To nasz fundament — obok grafu wiedzy daje bardzo solidną bazę do stworzenia świetnego artykułu, konkretnego, mocno związanego z tematem i — najważniejsze — **dopasowanego do intencji**.

### Lekcja w 3 wariantach

Lekcja przygotowana jest tak, aby osoby zaawansowane technologicznie (Python, pipeline'y) jak i osoby zajmujące się copywritingiem czy briefami mogły to wykorzystać bezpośrednio, bez wymagań technicznych.

### Wariant 1 — Prosty Prompt

**Rola:** „Jesteś ekspertem semantyki w języku polskim". Jeżeli generujesz query fan-out dla innych języków, podmień język. Prompt w polskim — łatwiej tłumaczyć. Możecie go zamienić na angielski w modelu, ale nawet są badania, że polski lepiej komunikuje się z modelem.

**Cel:** Bardzo krótki — „rozbij podane zapytanie na podtematy według intencji użytkownika". Nie proszę o zrobienie „fanoutu", bo większość modeli nie zna tego pojęcia. Jeżeli się upierasz, dodaj definicję w prompcie.

**Reguły:**

> „Rozważ każdą intencję, ale wybierz tylko pasujące do słowa kluczowego."

To istotne — nie chcemy, żeby model na siłę wykorzystywał każdą intencję. Mają być tylko te, które rzeczywiście pasują.

Szybki przegląd intencji z definicjami — jeśli ich nie podasz, model będzie tworzył swoje i dostaniecie mnóstwo halucynacji.

Dla każdej intencji:
> „Wypisz obszary, podtematy, które są istotne, mają własną logikę, są SILNIE POWIĄZANE z głównym słowem kluczowym."

I limit:
> „Limit 5 obszarów na intencję, tylko istotne, bez wypełniania na siłę."

Dla każdego obszaru: pytanie + flaga **YMYL** (tak/nie). Po co? Żebyśmy w przyszłości, w pipeline, mogli mieć tę flagę i zupełnie inaczej skonstruować temat — z weryfikowalnymi źródłami.

**Praktyka w ChatGPT — wynik dla „jak obniżyć kortyzol po 40tce":**

- **Definicyjna** (2 obszary): kortyzol a wiek, wpływ hormonów. Trafione — aspekt 40 jest ważny.
- **Problemowa** (3/5): objawy wysokiego kortyzolu po 40, przyczyny, skutki długoterminowe.
- **Instrukcyjna**: styl życia, aktywność fizyczna, dieta, sen i regeneracja, redukcja stresu. Według mnie to **główna intencja** naszego zapytania.
- **Diagnostyczna** i **Decyzyjna** (po 2 obszary): badania hormonalne, interpretacja wyników; suplementacja, kiedy do lekarza.

Świetny kontekst do tworzenia artykułu. Outline można by z tego zrobić, ale ja jeszcze przefiltruję i zestawię z grafem wiedzy.

### Wariant 2 — Skrypt Python z PAA

Pomyślałem — skoro możemy zrobić query fan-out modelem, ale Google ma też **PAA (People Also Ask)** — pytania dodatkowe, które są generowane przez Google'a (sposób, w jaki Google rozbija zapytania). Możemy te pytania pobrać z **DataForSEO** przez API.

Co robi skrypt? Oprócz prostego promptu generuje pytania i przypisuje je do obszarów tematycznych za pomocą drugiego promptu. Mamy więc 2 zapytania do modelu i 1 do API.

**Praktyka:** Pobieramy 9 pytań z Google'a, generujemy intencje i obszary (4 z 6 intencji wykorzystane, każdy obszar po 5 podtematów). Następnie przypisanie PAA do obszarów:

- „Jak obniżyć kortyzol po menopauzie" → intencja definicyjna (pasuje, bo kortyzol po 40).
- „Po czym poznać, że mam wysoki kortyzol" → objawy wysokiego kortyzolu (pasuje).
- „Co natychmiast obniża poziom kortyzolu" → techniki redukcji stresu.

Pytania, które powtarzają główne zapytanie albo są duplikatem, **nie są przypisywane**. Świetny brief dla copywritera. Wystarczy klucz OpenAI + DataForSEO.

### Wariant 3 — Algorytm Mikro/Makro

Algorytm pokazuje kontekst **mikro** i **makro**:

- **Mikrosemantyka** = dotyczy danego artykułu (tego konkretnego, którym się zajmujemy).
- **Makrosemantyka** = pozostałe obszary, artykuły dodatkowe, które warto stworzyć, żeby otoczyć ekspertyzą nasz artykuł.

Pipeline jest podobny, z jedną różnicą: po fan-oucie intencyjnym i tematycznym robimy **test samodzielności**. Po co? Żeby wyodrębnić obszary, które na 100% powinny być w naszym artykule (dobrane do dominującej intencji — w przypadku „jak obniżyć…" to instrukcyjna), a także listę tematów dodatkowych do zbudowania makro-obszaru tematycznego.

W praktyce możemy wykorzystać Query Fan-Out do **budowania content planu semantycznie powiązanego** z naszym zapytaniem. Możecie zbudować świetny obszar, który zagospodaruje całą kategorię/stronę.

**Test samodzielności:** dla każdego obszaru → „Czy użytkownik mógłby wpisać to jako osobne zapytanie?". TAK = osobny artykuł (makro). NIE = mikroobszar.

Nawet jeżeli temat kwalifikuje się jako osobny artykuł, warto go lekko wspomnieć w naszym artykule — i dać **link wewnętrzny** do osobnego dokumentu. Zapisuję sobie powiązania mikro/makro, żeby w przyszłości łatwo dodać linki wewnętrzne.

**Wynik końcowy:** artykuł bazowy + plan publikacji (backlog na kolejne artykuły).

### Praktyka — dwa zaawansowane prompty

**Prompt 1 (część 1)** = nasz prompt z wariantu 1, do którego dopisałem brakującą intencję porównawczą.

**Pro tip:** Jeżeli korzystacie z platformy OpenAI, **warto te prompty zapisywać**. Dostajecie API skonfigurowane już z tym promptem, gotowe do użycia. Nie musicie wysyłać dużego promptu w polu system. Możecie korzystać z API w dowolnym miejscu, a prompt zmieniać tylko w jednym miejscu. Game changer. OpenAI zrobiło duży krok naprzód.

**Prompt 2 (część 2)** = klasyfikacja na mikro/makro. Trzeba było dopisać:
> „Wynik to obszary tematyczne według intencji, NIE struktura artykułu"

— bo model się upierał i wciskał gotowy outline.

**Test samodzielności** — dla każdego obszaru: „Czy użytkownik mógłby wpisać to jako osobne zapytanie?".

Wklejam output z poprzedniego promptu jako user message. **Reasoning effort: high** — to ma być fundament dla wielu artykułów.

**Wynik:**

- **ARTYKUŁ GŁÓWNY:** „Jak obniżyć kortyzol po 40":
  - Intencja **Instrukcyjna** — 5 obszarów (najbardziej pasuje, jak mówiłem).
  - Intencja **Decyzyjna** — wybór strategii redukcji, od czego zacząć, rodzaj treningu, wybór badań, wybór suplementów.

Świetnie dobrane! Nasz artykuł ogranicza się tylko do intencji instrukcyjnej i decyzyjnej — żadnych innych. Te przeważają i nie ma sensu tworzyć **fillerów** (sekcji, które nie wnoszą nic do tematu). To prawdziwa semantyka.

- **ARTYKUŁY DODATKOWE:** wszystkie obszary niewpasowane w główne intencje — wysoki kortyzol, objawy, skutki zdrowotne. To buduje **topic authority** wokół tematu kortyzolu.

### Podsumowanie

Mam nadzieję, że ta lekcja zmieni Wasze podejście do przygotowywania contentu. W następnej lekcji wykorzystamy Query Fan-Out, encje, fakty, ideations i inne rzeczy, które pobraliśmy wcześniej, żeby **zbudować graf wiedzy** — wielką przestrzeń, którą spróbujemy zwizualizować.

---

**Poprzednia strona:** 2.7 NER
**Następna strona:** 2.9 Graf wiedzy
