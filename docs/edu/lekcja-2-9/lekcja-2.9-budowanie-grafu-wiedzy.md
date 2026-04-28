# 2.9 Budowanie grafu wiedzy

**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 5.0 (4 oceny)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-9/

---

## 🎯 Cel lekcji

Nauczenie się budowania grafu wiedzy z wyekstrahowanych encji i relacji.

---

## 📒 Notatka z lekcji

### Co to jest graf wiedzy

Graf wiedzy to uporządkowana reprezentacja informacji, gdzie:

- **encje** (osoby, marki, pojęcia, procesy) są węzłami,
- **relacje** między encjami są krawędziami,
- **reszta** (fakty, dane mierzalne, pomysły, fan-out) to "warstwa treści", którą przypinasz do grafu.

### Po co go robimy (praktycznie, pod artykuł + LLM)

- **Jedno źródło prawdy:** zamiast 5 plików i notatek w różnych formatach — 1 spójny obiekt.
- **Kontrola kontekstu dla LLM:** dajesz modelowi to samo zawsze, w tej samej strukturze → mniej halucynacji, lepsza spójność.
- **Łatwe cięcie kontekstu:** możesz później wycinać pod-zbiory (np. tylko encje + relacje + 1 intencja).
- **Analiza embeddingowa:** encje/relacje mają opisy-konspekty → embeddingi są sensowne i możesz wyłapywać outliery.

### Dobre praktyki

**Minimalny, stabilny schemat**
Im mniej pól, tym mniej "miejsc do zepsucia JSON". Bogactwo ma być w danych, nie w strukturze.

**Opisy (konspekty) tylko tam, gdzie to pomaga LLM najbardziej**
`entities[].description` i `entities_relationships[].description`. To poprawia "rozumienie" bez puchnięcia reszty.

**Relacje tylko dla encji**
Reszta (facts, ideations, measurables, fan-out) to nie graf relacyjny 1:1, tylko elementy warstwy treści. Dzięki temu graf encji jest czysty i łatwy do rysowania.

**Weryfikacja i sanity check**
Unikalne ID, brak duplikatów encji, relacje sensowne semantycznie. Minimum: "czy każda relacja wskazuje na istniejące entity_id?"

### Nasze składowe grafu

Z poprzednich kroków zbieramy do pliku tekstowego `kg_input.txt`:

- Encje i relacje encji (z konspektami)
- Fakty (krótkie, jednozdaniowe)
- Ideations (pomysły/angle na sekcje)
- Dane mierzalne (metryki, które potem możesz uzupełniać)

### Pipeline skryptu

```
scraped_content_all.txt
  ├──→ ner_builder_colab.py ──→ entities.json
  └──→ data_extractor.py ──→ extracted_data.txt
                  │
                  ▼
          kg_assembler.py ──→ kg_output.json
```

### Input 1: entities.json

```json
{
  "entities": [
    {
      "entity_id": "E001",
      "entity_name": "...",
      "type": "...",
      "description": "..."
    }
  ],
  "entities_relationships": [
    {
      "entity_id2text": ["Source", "Target"],
      "predicate": "CAUSES",
      "description": "..."
    }
  ]
}
```

**Typy encji:** HORMONE, PRODUCT, PROCESS, SYMPTOM, DISEASE, TOPIC, PERSON, ORGANIZATION, ROLE, MEDIA

**Predykaty:** CAUSES, REDUCES, RELATED_TO, PART_OF, AFFECTS, TREATS, PRODUCES, REQUIRES

### Input 2: extracted_data.txt

```
#Facts
- Fakt pierwszy.
- Fakt drugi.

#Measurable data
- Opis - [wartość][jednostka]

#Ideations
- Pomysł na content.
```

**Format measurable:** `Poziom kortyzolu - [10-20][µg/dL]`

### OUTPUT: kg_output.json

Scala oba pliki: `entities`, `entities_relationships`, `facts`, `measurables`, `ideations`.

---

## 📚 Materiały dodatkowe

### Powiązane pliki

**PLIKI JSON**

- 📂 **Przykładowa struktura grafu wiedzy (JSON)** — Przykładowy plik ze strukturą grafu wiedzy

**PROMPTY**

- 📝 **Tekstowy graf wiedzy (prompt)** — Prompt generujący Graf Wiedzy na podstawie pliku tekstowego z pobraną treścią ze stron
- 📝 **Graf wiedzy JSON (prompt)** — Prompt generujący Graf Wiedzy w formacie JSON na podstawie pliku tekstowego

**SKRYPTY PYTHON**

- 🐍 **Graf wiedzy - skrypt Python** — Skrypt do budowania grafu wiedzy
- 🐍 **Wizualizacje grafu wiedzy (2D/3D)** — Wizualizacja grafu wiedzy w 2D i 3D. Aby wyświetlić pliki HTML trzeba pobrać i zapisać na komputerze.
- 📂 **Finalny pipeline NER - merge i deduplikacja** — Skrypt do budowania grafu wiedzy z mergowaniem i deduplikacją encji z różnych źródeł

---

## 📝 Transkrypcja wideo

Dotarliśmy do grafu wiedzy, więc na tej lekcji pokażę Ci, jak ja buduję te grafy wiedzy, jakie są najważniejsze, dobre praktyki w budowaniu takiego grafu wiedzy, ale na początek oczywiście kilka informacji organizacyjnych.

Tak jak to już mam w zwyczaju, na górze w tym opisie tekstowym naszej lekcji masz informacje o powiązanych plikach. Więc będzie też plik JSON, którym sobie omówimy taką bardzo podstawową strukturę i budowę grafu wiedzy. Dwa prompty, które ja użyję w tej lekcji i dwa skrypty Pythona.

I teraz bardzo ważna uwaga, ponieważ tutaj zaczynają się nam rzeczy komplikować i input do grafu wiedzy, tego, który będziemy robić za pomocą Pythona, już potrzebuje danych z innych skryptów, które robiliśmy też wcześniej, z innych lekcji. Załączyłem tutaj pipeline, w którym widzicie z czego się biorą te dane i oczywiście też krótki opis, jaka ma być postać tych plików, ponieważ to nie jest jednoznaczne, że każdy z Was mógłby robić to w zupełnie inny sposób, więc albo dostosujecie sobie ten skrypt Pythona, albo skorzystacie z tego schematu, który tutaj załączyłem do tych dwóch plików, które są, ale to jeszcze sobie też omówimy.

### Wprowadzenie teoretyczne

Kilka słów wstępu teoretycznych. Co to jest ten graf wiedzy i po co nam jest tak naprawdę? Więc graf wiedzy to jest sposób prezentowania, porządkowania danych, które już mamy. Możemy to zrobić w różny sposób. Ja robię to za pomocą tablicy JSON. Możecie też zrobić za pomocą pliku CSV, gdzie w danych kolumnach będą dane kolejne dane. Natomiast JSON pozwala też na zagnieżdżenie tablic. Dzięki temu możemy zbudować sobie siatkę tych połączeń. W CSV będzie to trochę trudniejsze.

Co zawiera graf wiedzy? W naszym przypadku będzie zawierać encje, relacje tych encji. To już mamy zrobione, więc tutaj będziemy to podawać jako input. I reszta rzeczy, które też mamy zebrane, czyli fakty, dane mierzalne, pomysły. Tutaj też piszę o fan-oucie, natomiast to jest kwestia waszego podejścia. Ja fan-out robię osobno i fan-out nie jest, w moim rozumieniu, nie jest bazą wiedzy. Fan-out jest rozbiciem na obszary tematyczne, które mają być wykorzystane w tym danym naszym artykule. Więc ja go nie wrzucam do tego grafu wiedzy, ale wy możecie to zrobić jak najbardziej. To zależy od waszego podejścia.

### Po co robimy graf wiedzy

Po co robimy ten graf wiedzy? Mamy jedno źródło, które możemy później wykorzystywać i na różnych krokach. To jest też istotne, dlatego że będziemy później budować różne kroki, różne te cegiełki, o których mówiłem, które generują content i za każdym razem będziemy mogli sobie dodać jako kontekst ten plik nasz z tym grafem wiedzy. Nie trzeba będzie tego w żaden sposób inny podawać modelowi, uploadować i zawsze mamy tą samą strukturę. Więc już mamy uproszczenie, że w tych naszych promptach zawsze wykorzystujemy tą samą strukturę, więc odchodzi nam bardzo dużo roboty zastanawiania się co gdzie jest. Na pewno łatwiej też jest zarządzać.

Tutaj też załączyłem Wam informacje, łatwe cięcie kontekstu. Mówimy o zagnieżdżeniach, możemy znaleźć podzbiory, wykorzystać. Też następna lekcja będzie dotyczyła panowania nad długością kontentu, nad tak naprawdę wiedzą, która jest tam wykorzystana. Więc mając postać w JSON grafu wiedzy, możecie to robić w bardzo łatwy sposób.

I na koniec jeszcze jedna rzecz. Jeżeli możemy wszystkie te elementy grafu wiedzy zembedingować, a możemy, to zobaczcie, już to niesie, przychodzi dużo pomysłu do głowy, jak można by było z tym zarządzać. Moglibyśmy sobie zbadać na przykład similarity score pomiędzy elementami, zobaczyć, czy nie mamy jakichś tak zwanych outlierów, czyli czegoś, co nie jest nam potrzebne do tego grafu wiedzy i to po prostu z niego wyrzucić.

### Dobre praktyki

Jakie są dobre praktyki, jeżeli chodzi o graf wiedzy? Pamiętajcie, im mniej schematu rozbudowanego, tym lepiej, bo my to wysyłamy do modelu językowego. Później, jeżeli będziemy generować oczywiście te treści. Więc tutaj nie przesadzajcie ze strukturą. Łatwo, dobrze jest tak naprawdę uprościć sam schemat.

Dodawajcie opisy — to jest bardzo ważne, dlatego że w wielu systemach, w wielu jakby podejściach spotykamy, że relacje które są podawane w tablicach są pomiędzy ID jednej encji i ID drugiej. Nie zawsze model językowy będzie sobie mógł z tego ID wyciągnąć nazwę tej encji. Więc ja podaję tutaj, to jest bardzo ważne, punkt numer dwa. Podajcie opisy, podajcie jak najwięcej, czyli jeszcze też kontekst, którym jest na przykład dana encja. Więc ja to stosuję do encji i do opisu, do relacji tych encji. To jest najważniejsze, bo fakty, ideations, one same w sobie są już opisane.

Relacje tylko do encji. No to już mamy te encje zrobione, także widzieliście w poprzednich lekcjach, że tutaj encja bez relacji nie jest dla mnie encją. Nie jest nam do niczego przydatne. No i jeszcze jest bardzo ważna weryfikacja na sam koniec.

Podsumowując, nasze składowe grafu to są encje i relacje. Mamy fakty. Mamy ideations i dane mierzalne. Ideations — pomysły na sekcję.

### Praktyczna analiza struktury grafu wiedzy

Przyjrzyjmy się teraz grafowi wiedzy w praktyce. Jak widzicie, to jest plik JSON. To są tablice, które są również zagnieżdżone. Mamy tu oprócz `meta`, który jest naszym wprowadzeniem, mamy pięć elementów. Meta nie jest do niczego, nie będzie przez nas używane, ale dobrze zostawić w takim pliku ślad. Gdybyście kiedyś chcieli do takiego pliku wrócić, to będziecie wiedzieli, czego ten graf wiedzy dotyczy, a możecie zbudować sobie tak naprawdę bazę tysiąca takich plików i wtedy sięgając bezpośrednio do pliku będziecie mogli zobaczyć, jakie to było słowo kluczowe, czy zrobić jakiś prosty mechanizm wyszukiwania.

Więc mamy encję, ID — dobrze by było, żeby każda encja miała swoje ID, aczkolwiek tutaj my nie będziemy znowu tego ID używać, bo my będziemy się posługiwać nazwą tej encji. I jakiś tam opis. To, co mówiłem na początku w teorii, dajemy `description`. Będziemy tworzyć te opisy przez LLM, dlatego, że sama nazwa encji niewiele nam daje i sama jakby sama struktura encji w jej relacji jest spoko, ale lepiej jest jak wszystko opiszemy. Czyli opisujemy i encje, i tutaj mamy `description` do relacji, czyli kontekst w jakim encje łączą się między sobą — opis ich powiązania. Bo jak widzicie, to jest entity name 1, entity name 2 i tutaj predicate, czyli jakie jest powiązanie pomiędzy jedną encją a drugą. I to już nam sporo daje, ale lepiej jak będziemy mieli i opis tego powiązania (kontekst) i opis każdej encji osobno. I to już gwarantuję Wam, że każdy model językowy sobie z tym poradzi.

Fakty, dane mierzalne, pomysły — to są rzeczy, które są po prostu w prostych tablicach, tu jest dużo łatwiej, są po prostu wylistowane. I tak, moi drodzy, wygląda nasz graf wiedzy. Będzie rozbudowany, oczywiście tych elementów będzie N.

### Pierwszy prompt — tekstowy graf wiedzy

Przechodzimy do promptu pierwszego z naszej lekcji dotyczącej grafu wiedzy. Jak wiecie, w każdej lekcji staram się podzielić konspekt tej lekcji na dwie części. Jedną to taką, którą ktoś nie do końca techniczny będzie mógł wykorzystać i korzystać z czatu GPT. Teraz zajmiemy się generowaniem grafu wiedzy w czacie GPT, a później przejdziemy już do tej części bardziej skomplikowanej, zaawansowanej, gdzie użyjemy Pythona.

Jeszcze jedna ważna informacja: do tej pory tworzyliśmy tak zwany pipeline, czyli taki flow, w którym po kolei dochodziliśmy do kroków, w których przetwarzaliśmy treść. Możecie graf wiedzy zrobić bez wyciągania na przykład encji — możecie encje budować również bezpośrednio w tym grafie wiedzy. I co tutaj będzie naszym inputem? Naszym inputem będzie tutaj po prostu tekst. To może być to, co pobraliście ze strony internetowej, wasz tekst albo treść jakiegoś artykułu, który macie i uważacie za wartościowy. Dlatego też przygotowałem te pierwsze dwa, bo jeden jest w formie tekstowej, a drugi w formie JSON-a — tak, żeby były uniwersalne, żebyście nie musieli podpinać całego tego pipeline'u.

Przypomnę pipeline:

1. Pobraliśmy dla słowa kluczowego "jak obniżyć kortyzol po 40" URL z top 10 (Google) i parę URL z Binga.
2. Później wyciągnęliśmy z tych URL content — bloki tekstu pobrane z każdej z tych stron.
3. Wyczyściliśmy sobie content przy użyciu embeddingów.
4. Wyekstraktowaliśmy dane: fakty, dane mierzalne (np. zalecana ilość snu dla dorosłych: 7–9 godzin na dobę), ideations, encje.

Te dane w postaci strukturalnej — fakty, dane mierzalne, relations i encje — będą potrzebne nam do skryptu Pythona.

#### Konstrukcja promptu

- **Rola:** "Jesteś ekspertem semantycznym, zajmującym się analizą danych leksykalnych i tekstowych." Pamiętacie, że rolę sami możecie nadać, nie upierajcie się przy tej, którą ja używam.
- **Cel:** "Uporządkuj dostarczone informacje w czytelny, tekstowy graf wiedzy możliwy do bezpośredniego użycia w czacie GPT, który będzie reprezentacją wiedzy dla podanego słowa kluczowego."
- **Reguły:**
  - Nie dodawaj żadnych informacji poza tymi, które znajdują się w dodanych blokach tekstowych.
  - Opieraj się tylko na poniższych tekstach.
- **Input:** słowo kluczowe + bloki tekstu.

To powoduje, że ograniczamy ten model, żeby nie halucynował, żeby nie brał niczego ze swojej bazy wiedzy. I tutaj macie rzecz, którą możecie oczywiście zakazać — pobierania cen, danych wrażliwych. Możecie sobie taką listę zrobić.

#### Test w czacie GPT

Wkleiłem cały prompt i dorzuciłem oczyszczone bloki tekstu. Wynik:

- Meta — opisana.
- Encje są bardzo fajnie zrobione, świetnie powiązany kontekst.
- Relacje encji — np. "kortyzol jest wytwarzany przez nadnercza, a dokładniej przez korę nadnerczy".
- Fakty — graf wiedzy może być briefem do napisania artykułu nie tylko przez model językowy, ale przez copywritera.
- Dane mierzalne — wyglądają świetnie.
- Pomysły (ideations) — narracja, jak uatrakcyjnić artykuł, porady.

### Drugi prompt — graf wiedzy w formacie JSON

Zasada jest ta sama. Prompt jest niemalże identyczny poza outputem. Tutaj prosimy, żeby już te opisy zrobił we wszystkich relacjach i żeby to był JSON. Wyślemy to bezpośrednio do API. Możecie też użyć Pythona, żeby to wysłać.

Wynik:

- Świetne opisy do każdej encji.
- ID encji (E1, E2, E3...) i nazwy encji: kortyzol, kora nadnerczy, zaburzenia snu, testosteron itp.
- Relacje: np. "kortyzol jest produkowany w nadnerczach" — pierwsza encja, druga encja, w jaki sposób są powiązane, plus description (dodatkowy kontekst).

Macie zatem dwa prompty: jeden Wam wygeneruje tekstowy graf wiedzy (taką bazową bazę wiedzy, którą również możecie wysłać do modelu językowego przez API). Drugi możecie zastosować w swoich systemach przez Pythona. **Najważniejsza rzecz:** te dwa prompty robią nam graf z bloków tekstów, nie z już wyekstraktowanych danych. To jest tylko różnica dwóch kroków.

### Część zaawansowana — skrypt Pythona

Inputem są dwa pliki:

- `entities.json` — encje
- `extracted_data.txt` — fakty, dane mierzalne, ideations

Outputem jest `kg_output.json` w strukturze pokazanej na początku. Skrypt:

1. Wczytuje encje i relacje z `entities.json`.
2. Wczytuje fakty i dane z `extracted_data.txt`.
3. Parsuje (bardzo szybko — sekunda).
4. Output zawiera podsumowanie: ile jest encji, relacji, faktów, topików.

### Wizualizacja grafu wiedzy (2D / 3D)

Załączyłem skrypt do wizualizacji grafów wiedzy w dwóch częściach: 2D i 3D. Skrypt uruchamia się błyskawicznie. Generuje trzy pliki: wizualizacja samych encji, całego grafu wiedzy w 2D i całego grafu wiedzy w 3D. Trzeba je zapisać na dysku i otworzyć.

**Co widać na wizualizacji 2D:**

- Główny temat (main keyword) — "jak obniżyć kortyzol po 40".
- Fakty — pokazane jako ID (długie identyfikatory, dlatego nie pełna treść na grafie, tylko po najechaniu).
- Measurable (dane mierzalne).
- Ideations (pomysły).
- Encje i ich powiązania — np. "kortyzol" jako główna encja z relacjami.
- Można przybliżać, oddalać, sprawdzać outliery (np. encje, które nie pasują — "męska klinika u pacjenta") i je wyciąć z grafu.

**Wizualizacja 3D:**

To zabawa, ale robi wrażenie. Można obracać, przybliżać, oddalać.

### Podsumowanie

Od samego słowa kluczowego dotarliśmy do graficznej reprezentacji danego tematu, gdzie mamy:

- wszystkie tematy, pomysły, fakty wokół słowa kluczowego,
- spore zbiory encji.

Dzięki temu, jeżeli jesteście w stanie sobie wyobrazić jak taki graf wiedzy wygląda i jak się go generuje, wiecie, że to wcale nie jest takie trudne. Na koniec warto przejrzeć daną tematykę — szczególnie na 2D widać wizualnie, czy zagospodarowanie tematu jest dobrze zrobione, czy czegoś brakuje, czy coś trzeba wyciąć.

---

**Nawigacja:**

- Poprzednia strona: 2.8 Query Fan-Out
- Następna strona: 2.10 Sterowanie treścią
