# 
## 1. Powiązane pliki

**Skrypty edukacyjne:**

- `Skrypty python/article_check_educational.py` — optymalizacja copywriterska (krok 1)
- `Skryopty python/article_intermediate_educational.py` — przejścia i formatowanie wizualne (krok 2)

**Prompty:**

- `Prompty/PROMPT_ARTICLE_CHECK.md` — prompt z regułami copywriterskimi
- `Prompty/PROMPT_INTERMEDIATE.md` — prompt z regułami narracyjnymi i formatowaniem

---

## 2. Czym są optymalizacja i przejścia?

**Optymalizacja (article check)** przepuszcza wzbogacony o źródła artykuł przez zestaw reguł copywriterskich, które redukują typowe "AI-izmy" — pierwszą osobę, tryb rozkazujący, śmiałe obietnice, powtórzone definicje. Model edytuje styl i ton tekstu.

**Przejścia (intermediate)** poprawiają flow i czytelność wizualną artykułu — dodają hierarchię informacji, naturalne wtrącenia narracyjne, formatowanie HTML (`<strong>`, `<i>`, `<blockquote>`, `<br />`). Artykuł przestaje wyglądać jak "raport AI" i zyskuje oddech między blokami treści.

Oba kroki edytują istniejący tekst, dlatego oba korzystają z tego samego mechanizmu ochrony danych.

---

## 3. Miejsce w pipeline

```
[output_enriched.html]        ← Wzbogacanie danymi (poprzednia lekcja)
        ↓
   OCHRONA HYBRID              ← Krok 1: optymalizacja copywriterska
   (placeholdery SRC + spany NUM/DAT)
        ↓
   OPTYMALIZACJA LLM (reguły A, C, D, E, F)
        ↓
   WALIDACJA + PRZYWRÓCENIE DANYCH
        ↓
[output_optimized.html]
        ↓
   OCHRONA HYBRID              ← Krok 2: przejścia i formatowanie
   (placeholdery SRC + spany NUM/DAT)
        ↓
   INTERMEDIATE LLM (reguły G, H, K)
        ↓
   WALIDACJA + PRZYWRÓCENIE DANYCH
        ↓
[output_intermediated.html]   ← Wynik końcowy
```

Model: claude-4.5-sonnet / gpt-5.2 (zamiennie, do wyboru) — w obu krokach.

---

## 4. Ochrona danych — podejście Hybrid

Ochrona danych przed LLM to wzorzec projektowy stosowany w każdym etapie, gdzie model edytuje istniejący tekst. W tym pipeline dotyczy obu kroków. Podejście Hybrid łączy dwie techniki, dobierając mechanizm do typu danych.

### Placeholdery — dla danych, których model nie musi "rozumieć"

Cytaty źródłowe `(Źródło: WHO, 2024 — who.int/...)` to długie bloki, które model mógłby zmodyfikować, skrócić lub przeformatować. Model nie musi rozumieć treści cytatu, żeby poprawić styl akapitu.

Mechanizm:

1. Regex `SOURCE_CITATION_RE` znajduje wszystkie cytaty w HTML,
2. Każdy cytat zastąpiony krótkim placeholderem: `[[SRC_001]]`, `[[SRC_002]]`...,
3. Mapa `{placeholder → oryginalny cytat}` zapisana osobno,
4. Model widzi np. `Kortyzol spada o 20% po 8 tygodniach [[SRC_003]].`,
5. Po optymalizacji placeholdery zamieniane z powrotem na pełne cytaty.

Model fizycznie nie może zmienić treści cytatu — nie widzi jej.

### Spany — dla danych, które model musi widzieć w kontekście

Liczby i daty to wartości, które model musi widzieć w kontekście zdania, żeby naturalnie dobrać słowa wokół nich i zdecydować o formatowaniu (np. pogrubienie zaskakującej wartości).

Mechanizm:

1. Regexy (NUM_RE, DATE_RE, DOI_RE, BRACKET_REF_RE) znajdują wrażliwe elementy,
2. Każdy element opakowany w `<span data-token-id="NUM_abc123">20%</span>`,
3. Model widzi wartość i pisze naturalnie wokół niej,
4. Po optymalizacji spany usuwane (unwrap), skrypt sprawdza czy wszystkie ID przetrwały.

### Oba kroki używają tego samego mechanizmu

Identyczny Hybrid w obu krokach: placeholdery `[[SRC_x]]` dla źródeł + spany `<span data-token-id="NUM_x">` dla liczb i dat.

- **Krok 1 (article_check):** model przeformułowuje zdania — widzi wartości liczbowe i dobiera słowa wokół nich.
- **Krok 2 (intermediate):** model dodaje formatowanie wizualne — widzi wartości liczbowe i decyduje o pogrubieniu zaskakujących faktów (`<strong>20-30%</strong>`).

Jeden wzorzec = prostszy kod, jeden zestaw regexów do utrzymania.

### Kolejność przetwarzania (oba kroki)

Cytaty źródłowe zawierają w sobie liczby i daty (np. rok `2024`). Gdyby regex NUM/DAT działał pierwszy, "wgryzłby się" w środek cytatu. Dlatego:

1. **Najpierw** — placeholdery SRC (cytaty znikają z tekstu),
2. **Potem** — spany NUM/DAT (działają na tekście bez cytatów),
3. **Na końcu** — tekst z placeholderami SRC i spanami NUM/DAT idzie do modelu.

---

## 5. Walidacja po każdym kroku

### Krok 1: Przywrócenie placeholderów i spanów

W obu krokach identyczna procedura: skrypt szuka `[[SRC_xxx]]` i zamienia na oryginalne cytaty, parsuje spany `<span data-token-id>` i porównuje ID z mapą, następnie usuwa tagi span (unwrap).

### Krok 2: Kontrola liczby cytatów

Niezależnie od placeholderów, skrypt liczy cytaty regexem w finalnym HTML. Mniej niż w oryginale = **hard fail**.

### Hierarchia błędów

|Brakujący element|Akcja|
|---|---|
|`SRC_*` (placeholder cytatu)|**HARD FAIL** — artykuł odrzucony|
|NUM/DAT (span lub placeholder)|**SOFT WARNING** — kontynuacja z ostrzeżeniem|

### Dodatkowe guardy (krok 2 — intermediate)

Intermediate ma rozszerzoną walidację, bo dodaje treść (przejścia, wtrącenia):

|Guard|Warunek hard fail|
|---|---|
|Brak `<h1>` w output|Artykuł odrzucony|
|Wzrost długości > +10%|Artykuł odrzucony|
|Utrata liczb|Artykuł odrzucony|
|Utrata źródeł|Artykuł odrzucony|
|Dodane linki `<a>`|Artykuł odrzucony|
|Wykryto SEO intro|Artykuł odrzucony|

---

## 6. Reguły optymalizacji — 5 kluczowych zasad (article_check)

Skrypt: `article_check_educational.py`

### O1: Zero pierwszej osoby (Reguła A)

Pierwsza osoba (l.poj. i l.mn.) to jeden z najsilniejszych sygnałów tekstu AI. "Polecam", "uważam", "sugerujemy" — wszystko zamieniane na formy bezosobowe.

|Zamiast|Użyj|
|---|---|
|Polecam X|X sprawdza się w praktyce|
|Uważam, że warto|Warto rozważyć|
|Sugerujemy metodę Z|Metoda Z umożliwia...|

### O2: Tonowanie śmiałych obietnic (Reguła E)

|Zamiast|Użyj|
|---|---|
|Szybko zobaczysz rezultaty|Rezultaty pojawiają się stopniowo|
|Gwarantowane wyniki|Oczekiwane wyniki|
|Jedyny sposób|Jeden ze sposobów|
|Rewolucyjny|Skuteczny|

Dotyczy superlatywów, obietnic czasowych i gwarancji.

### O3: Redukcja drugiej osoby i trybu rozkazującego (Reguła F)

Max 2-3 zdania rozkazujące na sekcję H2. "Sprawdź szybkość" → "Szybkość można sprawdzić za pomocą...". "Twoja strona" → "strona". Dozwolone: pytania retoryczne (max 1/sekcja), CTA na końcu sekcji.

### O4: Jedna definicja — jedno miejsce (Reguła C)

Każdy termin definiowany tylko raz, przy pierwszym użyciu. Powtórzone wyjaśnienia w nawiasach, dopiski "czyli...", "innymi słowy..." — usuwane. Przy kolejnych wystąpieniach: sam termin lub zaimek.

### O5: Porządkowanie nawiasów (Reguła D)

Nawiasy dłuższe niż 5 słów zamieniane na osobne zdanie lub usuwane. Max 1 nawias definicyjny na akapit. Wyjątek krytyczny: cytaty źródłowe `(Źródło: ...)` są wyłączone — w podejściu Hybrid ten wyjątek jest obsługiwany automatycznie (cytaty to placeholdery, nie nawiasy).

---

## 7. Reguły przejść — 5 kluczowych zasad (intermediate)

Skrypt: `article_intermediate_educational.py`

### P1: Hierarchia informacji + oddech (Reguła G)

Tekst nie może być jednorodnie gęsty. Każde 2-3 gęste akapity wymagają lżejszego akapitu przejściowego — mini-podsumowania, pytania retorycznego lub zdania łączącego z poprzednią sekcją. Struktura akapitu: zdanie główne (WAŻNE) → rozwinięcie (ŚREDNIE) → przejście (LEKKIE).

### P2: Naturalne przejścia i wtrącenia narracyjne (Reguła H)

Wtrącenia przełamują ton "raportu AI". Typy (1-2 na sekcję H2): mini-podsumowania ("W skrócie: X zmienił Y przez Z"), przyznanie trudności ("To może brzmieć skomplikowanie, ale w praktyce..."), kontekstualizacja (powiązanie z codziennym doświadczeniem), pytania retoryczne (oszczędnie). Wtrącenia muszą być dopasowane do tematu artykułu — nie kopiowane jako szablony.

### P3: Formatowanie wizualne (Reguła K)

Artykuł nie może być ścianą tekstu. Cztery narzędzia:

- `<strong>` — pogrubienie kluczowych terminów przy pierwszym użyciu i zaskakujących faktów liczbowych (2-4 na sekcję H2, nigdy całe zdania),
- `<i>` — akcent na ważne stwierdzenia, terminy obcojęzyczne, zdania refleksyjne (1-2 na sekcję H2),
- `<blockquote>` — cytaty historyczne lub definicje zasługujące na wyróżnienie (0-2 na cały artykuł),
- `<br />` — oddech wewnątrz gęstych akapitów, przed zdaniem kontrastującym lub podsumowującym (5-15 na artykuł).

### P4: Jedna myśl = jeden akapit

Każdy akapit zawiera jedną główną myśl. Zmiana tematu wewnątrz akapitu = nowy akapit. Max 5 zdań lub ~800 znaków na akapit. Długie akapity pokrywające wiele wątków są dzielone.

### P5: Zakaz duplikowania myśli

Jeśli model doda zdanie w kursywie (Reguła K), a następne zdanie mówi to samo innymi słowami — drugie zdanie musi zostać usunięte. Ta sama myśl nigdy nie pojawia się dwa razy z rzędu, niezależnie od formatowania.

---

## 8. Struktura promptów — co widzi model

### Krok 1 (article_check) — system prompt + user message

System prompt: blok LENGTH (z tolerancją +20%), blok PLACEHOLDER RULES (`[[SRC_xxx]]`), blok PRESERVE SPANS, blok URL POLICY, reguły copywriterskie A/C/D/E/F/I, reguły drugorzędne.

User message — HTML z ochroną Hybrid:

```html
<p>Suplementacja ashwagandhą obniża kortyzol o <span data-token-id="NUM_a1b2">20-30%</span>
po <span data-token-id="NUM_c3d4">8</span> tygodniach [[SRC_001]].</p>
```

### Krok 2 (intermediate) — jeden prompt (user message)

Prompt zawiera: reguły G/H/K, instrukcje ochrony `[[SRC_x]]` i spanów NUM/DAT, guardy (brak `<a>`, brak SEO intro, limit wzrostu +10%), artykuł HTML na końcu.

User message — HTML z ochroną Hybrid:

```html
<p>Suplementacja ashwagandhą obniża kortyzol o <span data-token-id="NUM_a1b2">20-30%</span>
po <span data-token-id="NUM_c3d4">8</span> tygodniach [[SRC_003]].</p>
```

Oba modele zwracają tylko edytowany HTML — bez wyjaśnień, komentarzy, bloków kodu. Start od `<h1>`.

---

## 9. Kontrola długości

|Parametr|Krok 1 (article_check)|Krok 2 (intermediate)|
|---|---|---|
|Limit|`target_length × 1.20`|`input_length × 1.10`|
|Logika|Tolerancja +20% od targetu projektu|Wzrost max +10% od inputu|
|Hard fail|Przekroczenie = odrzucenie|Przekroczenie = odrzucenie|

Krok 2 ma ciaśniejszy limit, bo intermediate **nie powinien** istotnie zmieniać objętości — dodaje przejścia i formatowanie, nie nową treść.

---

## 10. Raport

Po każdym kroku generowany jest raport JSON. Przykład raportu z kroku 2 (intermediate):

```json
{
  "version": "2.2",
  "model": "claude-4.5-sonnet",
  "rules_applied": ["G", "H", "K"],
  "lengths": {
    "input": 12450,
    "output": 13100,
    "growth": 0.052
  },
  "sources": {
    "protected": 14,
    "preserved": 14
  },
  "numbers": {
    "protected": 73,
    "missing": []
  },
  "formatting": {
    "before": {"strong": 0, "italic": 0, "blockquote": 0, "br": 0},
    "after": {"strong": 12, "italic": 6, "blockquote": 1, "br": 9}
  }
}
```

Kluczowe metryki:

- **sources.preserved vs sources.protected** — czy zachowano wszystkie cytaty,
- **lengths.growth** — czy wzrost mieści się w limicie +10%,
- **formatting.before vs after** — czy reguła K zadziałała (zerowe wartości "before" = artykuł był ścianą tekstu).

---

## 11. Podsumowanie: pełny pipeline

```
Query Fan-Out → Outline → Dystrybucja KG → Draft → Enrichment → Optymalizacja → Przejścia → Publikacja
```

|Etap|Odpowiada za|Nie dotyka|
|---|---|---|
|Draft|Tworzenie treści z danych KG|Źródeł, stylu, formatowania|
|Enrichment|Dodanie źródeł do twierdzeń|Treści, struktury|
|Optymalizacja|Poprawa stylu i tonu|Źródeł, danych, struktury|
|Przejścia|Flow, oddech, formatowanie wizualne|Źródeł, danych, stylu|

Każdy etap ma jedną odpowiedzialność i chroni output poprzednich etapów.