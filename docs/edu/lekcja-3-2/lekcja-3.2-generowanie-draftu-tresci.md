# 3.2 Generowanie draftu treści

**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 5.0 (2 oceny)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-3/lekcja-2/

---

## 🎯 Cel lekcji

Nauczenie się generowania pierwszej wersji (draftu) treści na podstawie przygotowanego outline'u i grafu wiedzy. Zrozumienie generowania blok po bloku z chainingiem, analizy nagłówków, zasad użycia encji i reguł jakościowych (BLUF, NO FILLER, NO DUPLICATE).

---

## 📒 Notatka z lekcji

### Czym jest generowanie draftu?

Generowanie draftu to zamiana danych przypisanych do sekcji (output z dystrybucji) na tekst artykułu w HTML. Model LLM otrzymuje dla każdej sekcji "pakiet danych" — encje, fakty, relacje, ideacje, pytania — i na ich podstawie pisze treść. Artykuł powstaje blok po bloku, z kontrolą jakości opartą na regułach BLUF, NO FILLER i NO DUPLICATE oraz na analizie nagłówków, która determinuje strukturę każdej sekcji.

**Powiązane pliki:**

- **Wejście:** `output_distribution.json` (output z etapu dystrybucji — sekcje z danymi z grafu wiedzy)
- **Wyjście:** `output_draft.html` (wygenerowany draft artykułu w HTML)
- **Wyjście (opcjonalne):** `output_image_prompts.json` (prompty do generowania infografik)

Skrypt realizuje 6 etapów: wczytanie danych → deduplikacja faktów → analiza nagłówków → podział na bloki → generowanie LLM → składanie HTML.

> **Draft to nie finalna wersja**
> Nie da się wygenerować w jednym wywołaniu LLM dobrej jakości treści. Draft to dopiero początek — w kolejnych lekcjach artykuł przejdzie jeszcze przez rewrite, optymalizację i humanizację.

---

### Krok 1: Dlaczego generujemy sekcja po sekcji?

Generowanie całego artykułu naraz powoduje trzy problemy:

1. **Problem kontekstu:** Przy dużej ilości treści model traci sens i jakość tekstu spada, szczególnie w końcowych sekcjach. Nie masz kontroli nad długością poszczególnych sekcji.
2. **Problem duplikacji:** Model zapomina, co już napisał, i powtarza informacje. Generując blokami, do każdego wywołania dołączasz pełny outline z adnotacją, które dane należą do innych sekcji. Dodatkowo, wysyłasz `previous_response_id`, dzięki czemu model "pamięta" co już napisał.
3. **Problem kontroli jakości:** Blok po bloku pozwala monitorować długość każdego bloku osobno, przerwać generowanie gdy artykuł osiągnie docelową długość, a w razie błędu powtórzyć tylko jeden blok zamiast całego artykułu.

> **Zasada:** Każda sekcja (od H2 do następnego H2) to kompletny, samodzielny pakiet — musi być zrozumiała bez czytania reszty artykułu. H3 wchodzą w skład bloku swojego H2.

---

### Krok 2: Response ID chaining (OpenAI)

Kluczowa zaleta OpenAI Responses API to parametr `previous_response_id`. Pozwala na łączenie wywołań w wątek, gdzie model "pamięta" wcześniejsze bloki bez wysyłania ich ponownie w prompcie.

**Jak to działa:**

- Blok 1: wywołanie bez `previous_response_id` → `response_id = "resp_abc123"`
- Blok 2: `previous_response_id = "resp_abc123"` → `response_id = "resp_def456"`
- Blok 3: `previous_response_id = "resp_def456"` → `response_id = "resp_ghi789"`

**Efekt:** mniej duplikacji, spójny styl i ton, oszczędność tokenów.

| Podejście | Duplikacja | Koszt tokenów | Spójność |
|---|---|---|---|
| Cały artykuł naraz | Wysoka | Średni | Niska (model gubi kontekst) |
| Bloki BEZ chainingu | Bardzo wysoka | Niski | Brak |
| Bloki Z chainingiem (nasze) | Niska | Niski | Wysoka |
| Bloki + pełna historia w prompcie | Niska | Bardzo wysoki | Wysoka |

> **Inne modele:** Chaining działa z modelami reasoning OpenAI (GPT-5, o-series). Przy Claude lub Gemini ustaw `USE_REASONING_PARAMS = False` w skrypcie — wtedy generowanie odbywa się bez chainingu, ale outline nadal zapewnia kontekst.

---

### Krok 3: Antyduplikacja — trzy mechanizmy

Duplikacja to jeden z najgorszych problemów przy generowaniu treści. W skrypcie stosowane są trzy mechanizmy jednocześnie:

1. **Chaining (response ID):** Model pamięta kontekst poprzednich bloków, więc nie powtarza informacji.
2. **Outline jako kontekst:** Przy każdym bloku model dostaje cały outline z dystrybucją danych i informacją, która sekcja jest bieżąca. Widzi, które dane należą do innych sekcji.
3. **Programatyczna deduplikacja faktów (H3 vs H2):** Skrypt zbiera fakty użyte w H2 do zbioru `already_covered`. Fakty H3 obecne w tym zbiorze są usuwane przed wysłaniem do modelu — dzięki temu fakt pojawia się w artykule tylko raz. Encje nie są usuwane, ale oznaczane flagą `_covered_in_h2 = true`, więc model użyje nazwy encji, ale nie będzie jej ponownie definiować.

> **Duplikacja mimo wszystko**
> Nawet z tymi trzema mechanizmami duplikacja nie zniknie w 100% na etapie draftu. W kolejnych etapach pipeline'u (rewrite, optymalizacja) jest osobny prompt, w którym eliminacja duplikacji to jedno z najważniejszych zadań.

---

### Krok 4: Analiza nagłówka → format sekcji

To algorytm, który programatycznie analizuje nagłówek H2/H3 i przypisuje wymagany format sekcji ZANIM dane trafią do LLM. Model nie musi "zgadywać" jak napisać sekcję — dostaje konkretną instrukcję strukturalną.

**Dlaczego to ważne:** Bez analizy nagłówka sekcja "Jak zadbać o sen…" i "Kortyzol i jego rola…" wyglądałyby identycznie — kilka akapitów prozy. Z analizą — pierwsza dostaje format instrukcji, a druga format definicji.

| Wzorzec nagłówka | Typ | Wymagany format sekcji |
|---|---|---|
| "Co to jest…" / "Czym jest…" | Definicja | Zdanie definiujące → Rozwinięcie z atrybutami → Podsumowanie |
| "Jak…" / "W jaki sposób…" | Instrukcja | Kontekst + cel → Kroki/metody → Rezultat |
| "Dlaczego…" / "Przyczyny…" | Przyczyna | Twierdzenie → Wyjaśnienie przyczynowe → Dowód/statystyka → Wniosek |
| "X a Y" / "Co pomaga, co szkodzi" | Porównanie | Ramka porównania → Tabela różnic → Analiza → Werdykt |
| "Jak rozpoznać…" / "Objawy…" | Diagnostyka | Ogólna zasada → Warunki/objawy (lista) → Metody weryfikacji |
| "Najlepsze…" / "Rodzaje…" | Lista | Kontekst wyboru → Lista z encjami i atrybutami → Rekomendacja |
| Pytanie (kończy się na "?") | Bezpośrednia odpowiedź | Odpowiedź w 1. zdaniu → Rozwinięcie z kontekstem → Dodatkowy kąt |

W skrypcie analiza jest realizowana przez dopasowanie regex wzorców (dla wersji polskiej i angielskiej), a nie przez dodatkowe wywołanie LLM — żeby nie mnożyć zapytań i nie komplikować pipeline'u.

---

### Krok 5: Struktura sekcji — 5 elementów

Każda sekcja (H2 lub H3) powinna zawierać 5 elementów w tej kolejności:

1. **Zdanie otwierające (1-2 zdania):** Nazwij główną encję w pierwszym zdaniu. Ustal kontekst: kto/co/dla kogo/kiedy. To zdanie powinno działać jako samodzielna odpowiedź na pytanie z nagłówka (zasada BLUF).
2. **Treść merytoryczna (3-5 zdań):** Wyjaśnienie, kroki, analiza — główna zawartość sekcji. Krótkie zdania, aktywna strona, jasne przejścia. Jeden temat na akapit, zero dygresji.
3. **Dane wspierające (1 element):** Konkretna statystyka z liczbą, fakt z dostarczonych danych lub porównanie z nazwaną alternatywą. Na etapie draftu dane mogą być wymyślone — w kolejnej lekcji zbierzemy prawdziwe dane z internetu (Web Search API).
4. **Elementy wizualne (jeśli dostępne):** Tabele jako HTML `<table>`, checklisty jako HTML `<ul>`, infografiki → osobny prompt do narzędzia graficznego. To "ideacje" z grafu wiedzy — powodują, że artykuł jest czytelny i przyjazny dla LLM-ów.
5. **Podsumowanie (1 zdanie):** Kluczowa myśl prostym językiem. Tylko dla sekcji FULL (pomijaj w sekcjach CONTEXT).

---

### Krok 6: Zasady użycia encji — 5 typów kotwic

Same użycie encji z grafu wiedzy nie wystarczy. Encje muszą być "zakotwiczone" w tekście, żeby nie były tylko wstawioną wysepką.

**Zasady nazewnictwa:**

- Przy pierwszym użyciu encji w sekcji podaj: nazwa + czym jest + atrybut wyróżniający.
- Po pierwszej definicji: używaj tylko nazwy, nigdy nie definiuj ponownie.
- Nie zastępuj encji zaimkami w pierwszych 2 zdaniach sekcji.

| Typ kotwicy | Wzorzec | Przykład |
|---|---|---|
| Atrybutowa | Encja + cecha mierzalna | "Ashwagandha obniża kortyzol o 11-32%" |
| Porównawcza | Encja A vs Encja B | "W przeciwieństwie do HIIT, umiarkowany spacer…" |
| Sytuacyjna | Encja + grupa docelowa | "Osoby po 40. roku życia powinny…" |
| Czasowa | Encja + czas/okres | "Po 8 tygodniach suplementacji…" |
| Przyczynowa | Encja + przyczyna + skutek | "Przewlekły stres podnosi bazowy kortyzol o 50-80%" |

**Minimum 2 kotwice na sekcję.** To powoduje, że struktura artykułu jest semantyczna — encje mają relację z informacjami zawartymi w tekście.

---

### Krok 7: Reguły jakościowe i unikanie błędów

W prompcie zdefiniowane są cztery grupy reguł jakościowych:

**BLUF (Bottom Line Up Front):** Zdanie otwierające odpowiada na pytanie z nagłówka natychmiast.
- Źle: "Istnieje wiele czynników wpływających na kortyzol…"
- Dobrze: "7-9 godzin snu obniża kortyzol o 20-30% u osób po 40-tce."

**NO FILLER:** Test: usuń zdanie — czy tekst stracił informację? Nie → to filler. Każde zdanie musi zawierać konkretny fakt, liczbę, porównanie, przykład lub krok do wykonania.
- Zabronione: "Warto zwrócić uwagę…", "W tej sekcji omówimy…", "Jest to kluczowe…"

**NO DUPLICATE:** Każdy fakt dokładnie raz w całym artykule. Outline w prompcie pokazuje, które fakty należą do innych sekcji.

**H2/H3 HIERARCHY:** H2 = kompleksowy przegląd. H3 = bezpośrednia odpowiedź + nowy kąt widzenia. H3 nigdy nie powtarza treści H2.

**Prompt definiuje również 4 błędy do unikania:**

| Błąd | Co to jest | Reguła |
|---|---|---|
| Ściana tekstu | Brak wizualnych przerw | Każda sekcja musi mieć akapity, listy lub tabele |
| Rozmycie tematu | Mieszanie wątków w akapicie | Jeden temat na akapit |
| Encja bez nazwy | "ten suplement" zamiast konkretnej nazwy | Zawsze nazwa encji, nigdy ogólnik |
| Przerost formy | Zdania powyżej 25 słów | Podmiot + Orzeczenie + Dopełnienie + Kontekst |

---

### Krok 8: Konfiguracja skryptu

Przed uruchomieniem ustaw parametry w sekcji konfiguracyjnej:

**Pliki wejściowe/wyjściowe:**

- `INPUT_FILE` — output z poprzedniej lekcji (`output_distribution.json`)
- `OUTPUT_FILE` — draft w HTML (`output_draft.html`)
- `OUTPUT_IMAGE_PROMPTS` — prompty do infografik

**Model:** `gpt-5.2` (lub dowolny model reasoning OpenAI). Przy innym modelu ustaw `USE_REASONING_PARAMS = False`.

**Verbosity (objętość tekstu):**

- `low` = krótkie sekcje
- `medium` = balans (domyślne)
- `high` = obszerne sekcje

To bezpośrednio wpływa na zużycie tokenów.

**Reasoning effort:**

- `low` = szybka odpowiedź
- `medium` = balans
- `high` = najgłębsze rozumowanie (najdroższe)

Do generowania treści zazwyczaj wystarczy `medium`.

> **Czas wykonania**
> Skrypt generuje cały artykuł w ok. 2-3 minuty. Każdy blok to osobne zapytanie do API, z pauzą 0.8s między blokami (ochrona przed rate limitem).

---

### Krok 9: Sekcje "full" vs "context"

Artykuł składa się z dwóch typów sekcji, zgodnie z dystrybucją intencji z outline'u:

| Typ sekcji | Kiedy | Efekt |
|---|---|---|
| `full` | Intencja główna artykułu | 3-5 akapitów, pełne dane, struktura 5 elementów z podsumowaniem |
| `context` | Inne intencje (uzupełniające) | 1-2 akapity, krótkie wspomnienie tematu, BEZ podsumowania |

Dla przykładowego artykułu o kortyzolu (intencja instrukcyjna): 5 sekcji `full` (konkretne sposoby obniżenia kortyzolu) + 3 sekcje `context` (definicje, diagnostyka, przyczyny). Sekcje kontekstowe nie dominują — służą wyczerpaniu tematu i wewnętrznemu linkowaniu.

---

### Krok 10: Mosty kontekstowe między sekcjami

Sekcje nie powinny być wyizolowanymi wyspami. Jeśli encja zdefiniowana wcześniej pasuje do kontekstu bieżącej sekcji, warto nawiązać do niej 1-zdaniowym mostem, np.:

> "Wspomniany wcześniej [encja] odgrywa rolę również w…"

**Ograniczenia:** max 2-3 mosty na cały artykuł. Most nie powtarza treści i nie definiuje encji ponownie — tylko wskazuje połączenie.

---

## Podsumowanie

W tej lekcji poznaliśmy pełny proces generowania draftu artykułu:

- Generowanie blok po bloku z chainingiem (response ID) zamiast całego artykułu naraz
- Analiza nagłówków determinuje format każdej sekcji (instrukcja, definicja, porównanie, lista…)
- Struktura sekcji — 5 elementów: zdanie otwierające (BLUF), treść merytoryczna, dane wspierające, elementy wizualne, podsumowanie
- Kotwiczenie encji — 5 typów kotwic (atrybutowa, porównawcza, sytuacyjna, czasowa, przyczynowa)
- Reguły jakościowe — BLUF, NO FILLER, NO DUPLICATE, H2/H3 HIERARCHY
- 3 mechanizmy antyduplikacji — chaining, outline jako kontekst, programatyczna deduplikacja faktów

Draft to dopiero Mercedes — w kolejnych lekcjach (rewrite, optymalizacja, humanizacja) zamienimy go w Porsche.

---

## 📦 Materiały do pobrania

### Skrypt Python (generowanie draftu)

⬇️ Pobierz skrypt Python `T3F2-generation_draft_educational.py` — pełny skrypt (6 etapów: wczytanie → deduplikacja → analiza nagłówków → bloki → LLM → HTML)

### Przykładowe dane (input + output)

⬇️ **Output distribution (JSON) — input:** `T3F2-output_distribution.json` — przykładowy input (output z lekcji 3.1)

⬇️ **Draft artykułu (HTML) — output:** `T3F2-output_draft.html` — przykładowy wygenerowany draft

---

## 📝 Transkrypcja wideo

Cieszę się, że udało nam się wspólnie dotrzeć do tej lekcji. Ta lekcja dotyczy generowania draftu treści. Dlaczego draftu? Dlatego, że ja uznaję, iż nie da się wygenerować w jednym wywołaniu LMA dobrej jakości treści. Treść, później jeżeli widzieliście spis treści naszych zajęć, to zobaczycie, że będziemy generować tą treść, a później ją przepisywać jeszcze trzy razy. Zbiór reguł i do generowania i do optymalizacji, czy humanizacji byłby zbyt duży i w tej chwili żaden model językowy, i myślę, że jeszcze długo, długo, żaden model językowy nie będzie mógł tego wykonać należycie, żeby spełnić wszystkie nasze reguły.

Parę słów wstępu jeszcze na sam początek, zanim przejdziemy do prezentacji. Powiązane pliki tradycyjnie — jest tutaj skrypt Pythona, ale nie ma tym razem promptu. Myślę, że jeżeli ktoś już dotarł do tej lekcji, to będzie na tyle obyty, żeby ten prompt sobie z tego skryptu wyciągnąć i zmienić, dostosować swoje potrzeby do swojego pipeline'u.

Co jest wejściem? Oczywiście output distribution to jest to, co wygenerowaliśmy w poprzedniej lekcji, czyli rozdana dystrybucja wszystkich elementów, które zbieraliśmy w poprzednich blokach, dostosowana, przypisana do odpowiednich sekcji spisu treści, od odpowiednich nagłówków. Na wyjściu będzie draft już w postaci HTML.

Jeszcze jedna rzecz, która jest dość istotna. Warto też jako treść traktować grafiki, a tak naprawdę infografiki. Oczywiście jest inna ścieżka do generowania infografii, dlatego nie będziemy się tym zajmować, natomiast mamy możliwość utrzymując cały kontekst, całego artykułu, wiedząc dokładnie gdzie takie infografiki by się przydały, mamy możliwość stworzenia promptów do generowania tych grafik, a później możecie to sobie wygenerować w jakimś nanobanana albo w innym systemie, appce, która generuje te zdjęcia.

Zaczynamy od prezentacji. Tak jak wspomniałem na wstępie zajmiemy się generowaniem już draftu treści, czyli przeszliśmy od zebrania wszystkich danych do stworzenia outline'u, który ma przypisane end, fakty i wszystkie te pozostałe elementy.

Co będziemy robić w tym etapie? Przede wszystkim pamiętajcie czym tutaj jest input. Input jest outputem z poprzedniej lekcji, więc musimy mieć wygenerowany ten output z dystrybucją. Później takim istotnym dość elementem też jest deduplikacja, o której powiem przy dedykowanym slajdzie. Bardzo ważną, oczywiście też ważną sekcją całego systemu, całego skryptu jest analiza nagłówków, bo ta analiza nagłówków pozwoli nam ukształtować naszą treść w taki sposób, aby idealnie odpowiadała na zadane pytania, trafiała z intencjami, żeby była też również zróżnicowana. No i na koniec, tak jak na wstępie też powiedziałem, dostaniemy gotowy draft artykułu, który będzie już z kolei inputem do kolejnych etapów, etapów, w których będziemy optymalizować, deduplikować znowu, bo to zawsze jest niedoskonałe i humanizować.

Dlaczego generujemy blokami? Już to wyjaśniałem wcześniej, ale to jest ta lekcja, której to dotyczy. Generujemy blokami, dlatego że przy dużej ilości treści do wygenerowania model językowy, a próbowałem uwierzcie mi wielu, traci sens, traci przede wszystkim jakość tekstu, który jest generowany. Więc ta końcówka zazwyczaj już jest bardzo słaba. Generowanie blokami pozwala nam również na wiele innych rzeczy. Między innymi na to, żeby móc zrestartować na przykład tylko jedną część artykułu.

I bardzo ważna zasada, którą się będziemy trzymali. Każda sekcja, a przypominam sekcja to jest H2, czyli od nagłówka H2 do następnego nagłówka H2. I każda sekcja będzie zawierała również nagłówki H3, ale każda sekcja to kompletny pakiet. Musimy to trochę traktować w taki sposób, żeby się dało zrozumieć o co chodzi czytając tylko jedną sekcję. Oczywiście będziemy też robić swojego rodzaju kotwice, powiązania między sekcjami, ale to jest niezwykle istotne, bo jak widzieliście wcześniej, każda sekcja też ma przypisaną intencję. Oczywiście pierwsze sekcje są zgodne z intencją główną naszego zapytania, ale później mogą być też inne intencje, więc one mogą też być w inny sposób generowane i zupełnie inaczej opowiadać o problemie.

Cały artykuł. Jaka jest różnica przy generowaniu całego artykułu i oczywiście przy generowaniu blok po bloku? Tak jak wspomniałem, jeżeli zrobimy to cały naraz artykuł, wrzucimy, czy nawet mamy ten nasz outline i wrzucimy go i poprosimy o wygenerowanie całego artykułu, to rzeczywiście potrafi zgubić dane z początku, potrafi powtarzać rzeczy, bo już zapomina co było. No i tak jak mówiłem, przede wszystkim jest słaba jakość. Nie mamy też kontroli nad tą duplikacją, a tutaj przy generowaniu blok po bloku, przy tym podzieleniu i tak zwanym wykorzystaniu stanu chainingu to jest specjalna tak naprawdę funkcja w API modelu OpenAI i też za chwilę o niej opowiem to mamy bardzo redukujemy ilość duplikacji.

Co to jest ten chaining? Wyobraźcie sobie, że API modelu językowego, praktycznie każdego, nie wiąże między sobą wątków. Tak jak macie chat GPT, w którym macie całą konwersację w jednym wątku, to rzeczywiście model językowy tak jest skonstruowany, że pamięta, rozumie kontekst całej konwersacji. Natomiast w API tak nie jest i to był zawsze bardzo duży problem, jeżeli chodzi o generowanie treści. Sytuacja się zmieniła, jak pojawiły się modele rezonningowe. Okazało się, że jak wyszła wersja GPT-5, to ma taką funkcję, że można podać poprzednie ID odpowiedzi. I wtedy model będzie utrzymywał ten kontekst. Dlatego też dzisiaj polecam wam generowanie za pomocą OpenAI.

I jak to wygląda w praktyce? Jeżeli mamy w pierwszym bloku wygenerowaną już odpowiedź, to ta odpowiedź ma przypisane ID. Więc przy następnym bloku mamy możliwość podania tego, a już mamy ten id, czyli inputu z poprzedniego bloku, bo to są osobne zapytania. I podajemy to jako response id. I oczywiście dostaniemy nową odpowiedź z nowym response id, czyli to będzie resp.dev i tak dalej. Do kolejnego bloku podajemy to, co było na outputcie. To jest właśnie ten chaining.

I warto też sobie porównać podejścia do generowania. Sama duplikacja, wiecie, że modele nie są deterministyczne. Ona raz bywa, raz nie. Bardzo ciężko samymi promptami ją ograniczyć. Ja robię to w dwóch miejscach. Tutaj się staramy jak najwięcej zduplikować informacji, a i tak zobaczycie, że będą się zdarzały powtórki. Natomiast później jest cały duży i będzie lekcja osobna, cały duży prompt do optymalizacji tego artykułu, w którym ta duplikacja jest chyba jedną z najważniejszych rzeczy.

Problem polega na tym, że jeżeli wysyłacie całą historię robiąc sekcja po sekcji, że wysyłacie całą historię, czyli poprzednią sekcję wygenerowaną, to przy generowaniu setek treści wasz koszt wzrasta naprawdę, jest bardzo wysoki, bo jest więcej tokenów, które model musi przetworzyć. I na koniec artykułu praktycznie wysyłacie za każdym razem większość artykułów.

Teraz bardzo ważna rzecz, która zmienia wszystko. Będziemy analizować dwie rzeczy, żeby dobrze wygenerować daną sekcję, żeby ona dobrze odpowiadała na nagłówek. Musimy przeanalizować sam nagłówek i wszystkie dane, które do niej mamy. Zobaczcie, jeżeli mamy taki nagłówek, który ma wzorzec, który się zaczyna na przykład od "jak", to my wiemy, że to jest instrukcja i że powinien być kontekst, cel, kroki i jakiś rezultat. Nie mylcie tego z intencjami, chociaż to trochę się pokrywa, ale to jest bardzo prosty algorytm, który analizuje nasze nagłówki. Dla przykładu, jeżeli jest "X a Y" to jest porównanie — ramka, może tabelę warto zastosować. Jeżeli jest pytanie, to musi być odpowiedź i zgodnie z zasadą BLUF odpowiedź ma być w pierwszym zdaniu, a dopiero później ją rozwijamy.

Jak powinna wyglądać struktura sekcji? Powiedzmy sobie, że to będzie pięć elementów. Zdanie otwierające, o którym cały czas mówię, czyli BLUF plus encja plus odpowiedź. Encja zazwyczaj mamy przypisaną do danej sekcji. Później następuje treść merytoryczna, czyli tu wyjaśniamy. Mamy dane wspierające — statystyki lub fakt. I jeszcze jedna rzecz — sprawdzimy promptem, które dane nadają się do tego, żeby podać je statystycznie i żeby one nie były wymyślane. Zbierzemy je z internetu wykorzystując Web Search w API modelu. Dochodzą nam elementy wizualne — tabele, checklisty, HTML. I na koniec małe, krótkie podsumowanie.

Same encje, użycie tych encji, mając nawet w kontekście ich opis, same użycie encji nie wystarcza. Warto te encje kotwierzyć w naszym kontekście. Co to znaczy kotwierzyć? To znaczy tak ich używać, żeby one nie były tylko wstawioną wysepką. I tu wprowadzimy sobie pięć typów tych kotwic: atrybutowa, czyli encja plus cecha mierzalna; porównawcza — encja A versus encja B; sytuacyjna, czyli encja plus grupa docelowa; czasowa — encja plus czas; i przyczynowa — encja, przyczyna i skutek.

Jakość i kontrola. Możemy w naszym prompcie zastosować przykłady błędów do unikania. Przy generowaniu tekstów dużo lepiej modele wykorzystują informacje z promptu jeżeli podamy też błędy, czyli przykłady negatywne. Ściana tekstu — wiecie jak to wygląda, model zrobi 5 nagłówków i w każdym będzie podobna ilość tekstu. Rozmycie tematu — jeden temat na akapit. Encja bez nazwy — musi być wymieniona z nazwy, zakotwiczona i zdefiniowana. Przerost formy — ograniczamy zdania powyżej 25 słów.

Reguły jakościowe: BLUF, czyli odpowiedź pierwsza. No filler — jeżeli zdanie możesz wyciąć z treści i nic się nie zmienia, to jest filler. Reguły duplikacji — jednorazowe użycie faktu. H2/H3 hierarchia — H2 to jest przegląd, a H3 to jest nowy kąt widzenia.

Jak skrypt działa w praktyce: najpierw następuje analiza wszystkich nagłówków. Później skrypt dzieli na bloki — mamy 9 bloków, wszystko jest skojarzone z sekcjami H2 i poniżej. Mamy informację o typie sekcji — full, intro, kontekst. Każdy blok jest generowany osobnym zapytaniem, z chainingiem, z informacją ile mamy encji, ile faktów. Czas wykonania: pomiędzy 2 a 3 minuty. Statystyki: 18 220 znaków w artykule.

Na wyjściu mamy dwa pliki. Output draft to nasz HTML, który zaczyna się od nagłówka. I mamy output prompty do obrazków — jedną infografikę do wygenerowania.

Co do konfiguracji: model GPT-5.2, ale może być każdy reasoning. Ustawiamy flagę `USE_REASONING_PARAMS` na `true`. Verbosity: `low` = niska objętość, `medium` = średnia, `high` = wysoka. Reasoning effort: średni. Wzorce nagłówków realizowane przez dopasowania patternów regex dla wersji polskiej i angielskiej.

Wynik: artykuł z różnorodną strukturą — tabele, kroki instrukcji, listy, porównania. Każda sekcja jest inna, nie ma powtarzalności. Encje zakotwiczone czasowo, atrybutowo, porównawczo. Sekcje full z pełnym rozwinięciem tematu, sekcje context z krótkim uzupełnieniem. Artykuł zaczyna się od odpowiedzi (BLUF), bez filerów, bez niepotrzebnych wstępów. Draft to Mercedes — po kolejnych etapach (rewrite, optymalizacja, humanizacja) będzie Porsche.

---

**Nawigacja:**
- Poprzednia strona: 3.1 Outline
- Następna strona: 3.3 Wzbogacanie danymi
