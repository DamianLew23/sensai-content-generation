# 2.5 Ekstrakcja faktów i ideations

**Kurs:** AI Content Expert — Blok 2, Lekcja 5
**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 5.0 (6 ocen)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-5/

---

## 🎯 Cel lekcji

Celem tej lekcji jest przetworzenie „surowego" tekstu w ustrukturyzowaną bazę wiedzy przy użyciu modelu językowego (LLM). Dzięki temu procesowi zredukujesz ilość przesyłanych tokenów do **5-10% pierwotnej objętości**, jednocześnie drastycznie zwiększając jakość finalnych treści i eliminując ryzyko halucynacji.

---

## 📒 Notatka z lekcji

Przechodzimy od technicznego przygotowania danych (pobieranie i czyszczenie) do pracy koncepcyjnej.

### Czym jest graf wiedzy w tym kontekście?

Wiele osób utożsamia graf wiedzy wyłącznie z encjami (pojęciami). W naszym podejściu graf wiedzy składa się z **trzech filarów**, które będziemy ekstraktować z tekstów:

1. **Fakty** — Konkretne, sprawdzone informacje zawarte w tekście (np. definicje, zależności przyczynowo-skutkowe).
2. **Dane mierzalne** — Liczby, statystyki, wymiary i czasy. Są to dane twarde, które budują autorytet artykułu (np. „zalecana długość snu: 7-8 godzin").
3. **Ideations (Idee i pomysły na content)** — To koncepcje wynikające z tekstu, które sugerują, jak można urozmaicić treść. Nie chodzi o pisanie artykułu, ale o wyłapanie pomysłów na dodatki, takie jak checklisty, mini-kursy, ramki „warto wiedzieć" czy nawyki do wdrożenia.

### Przygotowanie Promptu: Struktura i Logika

Aby wyciągnąć te dane, nie potrzebujemy skomplikowanych skryptów Pythonowych (choć można to zautomatyzować). Kluczem jest precyzyjny prompt wysłany do modelu (np. GPT-4).

Oto elementy składowe promptu, który budujemy w tej lekcji:

**Rola (Role):** Nadajemy modelowi rolę analityka danych, który ma również doświadczenie w edycji tekstu.
> Przykład: „Działasz jako doświadczony analityk danych i edytor treści".

**Cel (Objective):** Jasno określamy zadanie — ekstrakcja konkretnych typów danych z dostarczonych bloków tekstu.
> Instrukcja: „Twoim zadaniem jest ekstrakcja danych z poniższych bloków tekstu: faktów, danych mierzalnych oraz ideations".

**Kontekst i Ograniczenia (Context & Constraints):** To najważniejszy bezpiecznik. Musisz podać główne słowo kluczowe/temat (np. *Jak obniżyć kortyzol po 40*).
> Zasada: Model ma ignorować wszystko, co nie jest związane z tym tematem. To ostatni etap czyszczenia danych ze „śmieci", które mogły przetrwać wcześniejsze etapy.

**Wytyczne dla Danych Mierzalnych (Guidelines):** Aby dane były użyteczne maszynowo, narzucamy format.
> Wzór: `Definicja – Wartość – Jednostka`
> Przykład: „Średnia waga mężczyzny po 40 – 80 – kg".

### Proces Ekstrakcji Krok po Kroku

**Krok 1: Zgromadzenie wsadu**

Jako input (wejście) wykorzystujemy bloki tekstu oczyszczone w poprzedniej lekcji. Mogą one pochodzić ze stron internetowych, ale także z zeskanowanych książek czy dokumentów PDF. Oddzielamy je separatorem (np. `---`).

**Krok 2: Konstrukcja promptu**

Piszemy prompt (można po polsku, model sobie poradzi, choć docelowo w automatyzacji warto używać angielskiego). Zawieramy w nim instrukcje, aby nie duplikować danych i zwracać wynik w czystej formie (bez zbędnych komentarzy).

**Krok 3: Analiza wyników (Output)**

Po wysłaniu zapytania do modelu otrzymujemy uporządkowaną listę:

- **Fakty:** Np. „Kortyzol jest hormonem steroidowym produkowanym przez nadnercza".
- **Dane:** Np. „Czas wykonania badania: 15 minut".
- **Ideations:** Np. „Stwórz checklistę codziennych nawyków obniżających stres" lub „Mini-kurs technik oddechowych".

### Dlaczego ta metoda jest skuteczna?

- **Oszczędność Tokenów:** Zamiast wysyłać do modelu generującego artykuł 10 stron surowego tekstu, wysyłasz tylko listę wyekstrahowanych faktów. To ogromna oszczędność kosztów API.
- **Eliminacja Halucynacji:** Model generujący treść nie musi „wymyślać" faktów. Dostaje je podane na tacy. Jeśli w bazie wiedzy jest napisane, że badanie trwa 15 minut, model użyje tej konkretnej liczby.
- **Wysoka Jakość:** Dzięki sekcji Ideations Twój artykuł zyskuje unikalne elementy (ramki, listy), które wyróżniają go na tle konkurencji kopiującej „suchy" tekst.

### Następny krok

Twoim zadaniem jest przetestowanie tego podejścia ręcznie w ChatGPT. Skopiuj oczyszczone bloki tekstu z poprzedniej lekcji, użyj skonstruowanego promptu i zobacz, jakiej jakości dane otrzymasz.

---

## 📚 Materiały dodatkowe

- 📝 **Ekstrakcja faktów i ideations — prompt podstawowy** — Prompt do ekstrakcji faktów, danych mierzalnych i pomysłów na content z tekstu
- 📝 **Ekstrakcja zaawansowana — encje, fakty, dane, ideations** — Rozbudowany prompt do kompleksowej ekstrakcji wszystkich typów danych z tekstu

---

## 📝 Transkrypcja wideo

*(Transkrypcja zostanie uzupełniona)*

---

**Poprzednia strona:** 2.4 Czyszczenie treści
**Następna strona:** 2.6 Encje i relacje
