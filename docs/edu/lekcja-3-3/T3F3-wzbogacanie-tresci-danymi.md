
## 1. Powiązane pliki

**Skrypt edukacyjny:** `Skrypty python/data_enrichment_educational.py`

- Wejście: `output_draft.html` (draft artykułu z etapu generowania)
- Wyjście: `output_enriched.html` (artykuł wzbogacony o źródła)
- 3 etapy: ekstrakcja claimów → weryfikacja web search → wstawianie źródeł


---

## 2. Czym jest wzbogacanie treści danymi?

Wzbogacanie (enrichment) to etap, w którym gotowy draft artykułu zostaje **przeskanowany pod kątem twierdzeń wymagających źródeł** — liczb, dat, statystyk, odniesień do organizacji i legislacji. Każde takie twierdzenie (claim) jest weryfikowane przez model LLM z dostępem do web search, a następnie opatrzone cytatem źródłowym bezpośrednio w HTML.

Enrichment:

- NIE modyfikuje treści artykułu (nie dopisuje nowych akapitów),
- NIE wymaga żadnych znaczników od etapu generowania (draft jest "czysty"),
- NIE wstawia źródeł tam, gdzie nie znalazł wiarygodnego potwierdzenia,
- DODAJE źródła w formacie `(Source: domena, rok)` / `(Źródło: domena, rok)`.

---

## 3. Ekstrakcja claimów — jak skrypt "czyta" artykuł

Ekstrakcja claimów to programistyczne skanowanie HTML w poszukiwaniu akapitów zawierających twierdzenia weryfikowalne. Skrypt NIE używa do tego LLM — to czysty regex + heurystyki.

### Kategorie wykrywanych claimów

| Kategoria                | Waga  | Co wykrywa                                                                 | Przykład z tekstu                     |
| ------------------------ | ----- | -------------------------------------------------------------------------- | ------------------------------------- |
| **Statystyka**           | 3 pkt | Liczby + jednostki (%, mg, μg/dl, million, tys.)                           | "300–600 mg ekstraktu/dzień"          |
| **Konkretna data**       | 2 pkt | Pełne daty (on March 6, 1899)                                              | "dnia 6 marca 1899 roku..."           |
| **Trend**                | 2 pkt | Czasowniki zmiany: EN (surpass, increase) + PL (obniża, zwiększa, podnosi) | "obniża poziom kortyzolu"             |
| **Norma medyczna**       | 2 pkt | Normy, dawki, zakresy referencyjne, stężenia                               | "Normy kortyzolu wynoszą 10–20 μg/dl" |
| **Porównanie ilościowe** | 2 pkt | Frazy "o X%", "w porównaniu do", "wyższy niż"                              | "o 20–30% w porównaniu do 5 godzin"   |
| **Datowane zdarzenie**   | 1 pkt | Frazy z rokiem (in 2019, w 2023 roku)                                      | "w 2019 roku FDA zatwierdziła..."     |
| **Legislacja**           | 1 pkt | Odniesienia do aktów prawnych                                              | "zgodnie z rozporządzeniem UE..."     |
| **Organizacja**          | 1 pkt | Nazwy instytucji (WHO, FDA, EMA)                                           | "według danych WHO..."                |

### System punktacji (scoring)

Każdy akapit dostaje punkty za obecność wzorców. Próg to **≥ 2 punkty** — dopiero wtedy akapit jest uznawany za "claim-worthy". To eliminuje zdania opiniotwórcze i czysto narracyjne.

Wagi: statystyka = 3 pkt, konkretna data / trend / norma medyczna / porównanie = 2 pkt, datowane zdarzenie / legislacja / organizacja = 1 pkt.

Claimów jest ograniczona liczba na artykuł (domyślnie 15) — wybierane są te o najwyższym score, posortowane potem z powrotem w kolejności dokumentu.

### Skanowane tagi HTML

Skrypt skanuje nie tylko `<p>` i `<li>`, ale też **`<td>`** (komórki tabel). Tabele w artykułach medycznych często zawierają dawki, normy i zakresy referencyjne — to jedne z najcenniejszych claimów do weryfikacji.

### Wielojęzyczność wzorców

Wzorce trendu zawierają zarówno angielskie (_surpass, increase, decrease_), jak i **polskie czasowniki zmiany** (_obniża, zwiększa, podnosi, zmniejsza, redukuje, normalizuje_). Artykuły po polsku wymagają tych wzorców, bo samo `increased` nie trafi w "obniża poziom kortyzolu o 20–30%".

Wzorce liczbowe obsługują **en-dash (–)** obok zwykłego myślnika (-), bo polska typografia używa pauzy w zakresach: "50–80%", "7–9 godzin", "300–600 mg". Bez tego wiele zakresów liczbowych przepada.

---

## 4. Weryfikacja przez web search

Wyekstrahowane claimy trafiają do modelu LLM z narzędziem **web search**. Model otrzymuje prompt z listą claimów i instrukcjami weryfikacji.

### Trzy statusy weryfikacji

|Status|Co oznacza|Co się dzieje w artykule|
|---|---|---|
|**confirmed**|Claim potwierdzony, znaleziono źródło|Dodane źródło w nawiasie|
|**corrected**|Dane w artykule nieprecyzyjne, znaleziono poprawne|Dodane źródło + notatka do review (tekst NIE jest automatycznie zmieniany)|
|**unverified**|Nie znaleziono wiarygodnego źródła|Tekst zostaje bez zmian (czysty)|

### Dlaczego "corrected" nie zmienia tekstu automatycznie?

Bezpieczeństwo. Automatyczna korekta liczb w opublikowanym artykule to ryzyko — model mógł źle zinterpretować źródło. Korekta jest **flagowana** do przeglądu przez człowieka lub kolejny etap (article_check).

### Dynamiczne okno czasowe

Prompt uwzględnia aktualny miesiąc. Jeśli jest druga połowa roku — priorytet mają dane z bieżącego roku. Jeśli pierwsza połowa — dane z pełnego poprzedniego roku + ewentualne aktualizacje Q1 bieżącego.

---

## 5. Wstawianie źródeł do HTML

Po weryfikacji skrypt wstawia cytaty źródłowe bezpośrednio w HTML artykułu.

### Format źródła

```
Tekst twierdzenia (Źródło: WHO, 2024 — who.int/news-room/fact-sheets/detail/opioid-overdose).
```

Składa się z:

- **Etykieta** — "Source" lub "Źródło" (zależnie od języka artykułu)
- **Nazwa źródła + rok** — czytelna dla ludzi, bez pełnego URL
- **Ścieżka URL** — domena + ścieżka (bez protokołu), obcięta do 120 znaków

### Ochrona przed duplikatami

Skrypt sprawdza, czy akapit nie ma już cytatu `(Source:` / `(Źródło:` — jeśli ma, nie dodaje drugiego.

### Kolejność wstawiania

Claimy przetwarzane są **od końca artykułu do początku** (reverse order). Dzięki temu pozycje znakowe wcześniejszych claimów nie przesuwają się po wstawieniu źródła do późniejszego akapitu.

---

## 6. Czyszczenie URL-i

Źródła w artykule powinny być czytelne dla ludzi, nie zawierać surowych linków. Skrypt:

- Usuwa protokoły (`https://`, `http://`),
- Usuwa `www.`,
- Skraca URL-e powyżej 120 znaków do domeny + pierwsze segmenty ścieżki,
- Zamienia linki Markdown `[tekst](url)` na sam tekst,
- Usuwa tagi HTML `<a href>`.

Wynik: źródło pojawia się jako czytelna domena ze ścieżką, nie jako klikalne łącze.

---

## 7. Podsumowanie pipeline'u

```
[output_draft.html]
        ↓
   EKSTRAKCJA CLAIMÓW (regex + scoring)
        ↓
   WERYFIKACJA (LLM + web search)
        ↓
   WSTAWIANIE ŹRÓDEŁ (confirmed/corrected → cytat, unverified → bez zmian)
        ↓
[output_enriched.html]
```

Enrichment jest **nieinwazyjny** — nie zmienia struktury artykułu, nie dodaje ani nie usuwa sekcji, nie modyfikuje twierdzeń (nawet błędnych — te flaguje). Jedyną zmianą jest dodanie cytatów źródłowych w nawiasach na końcu akapitów.