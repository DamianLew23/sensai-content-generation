# 2.6 Ekstrakcja encji i relacji

**Kurs:** AI Content Expert — Blok 2, Lekcja 6
**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 5.0 (5 ocen)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-6/

---

## 🎯 Cel lekcji

Nauczenie się ekstrakcji encji (podmiotów, obiektów, koncepcji) oraz relacji między nimi za pomocą promptów.

---

## 📒 Notatka z lekcji

W poprzednich lekcjach nauczyliśmy się pobierać URL-e, ekstraktować z nich treść oraz wyciągać fakty i dane mierzalne. Teraz przechodzimy do poziomu wyżej — zajmiemy się **encjami (entities)** i ich **relacjami**. To właśnie te elementy tworzą strukturę, którą algorytmy (takie jak Google czy LLM) rozumieją najlepiej. Budujemy w ten sposób właściwy graf wiedzy, który posłuży nam do generowania treści najwyższej jakości.

### Czym są encje? (To nie są słowa kluczowe!)

Dla algorytmu „ładny język" to tylko ciąg tokenów bez znaczenia. Encje nadają temu szumowi strukturę.

- **Definicja:** Encja to byt, węzeł w sieci, który można zdefiniować. To obiekt, pojęcie, osoba lub miejsce.
- **Różnica:** Encja to sens i kontekst, a nie tylko ciąg znaków (słowo kluczowe). Na przykład „Kortyzol" to dla modelu nie tylko słowo, ale „hormon steroidowy wpływający na stres".

**Przykładowe typy encji:**

- **Person:** Osoba (np. Marcin Iwiński)
- **Organization:** Firma, instytucja (np. CD Projekt SA)
- **Location:** Miejsce (np. Warszawa, Polska)
- **Product:** Produkt (np. gra Wiedźmin)
- **Concept:** Idea, pojęcie abstrakcyjne (np. stres, sen) — tu należy uważać na halucynacje modeli

### Czym są relacje?

Sama lista encji to za mało. Aby zbudować graf wiedzy, musimy wiedzieć, jak te byty na siebie oddziałują.

**Przykład:** Kortyzol (Encja 1) → wpływa na (Relacja) → Sen (Encja 2)

**Typy relacji:** „jest częścią", „zlokalizowany w", „stworzony przez", „pracuje dla".

### Metoda 1: Ekstrakcja za pomocą LLM (Prompting)

Najprostszym, a zarazem bardzo skutecznym sposobem jest wykorzystanie modelu językowego (np. GPT-4). Model ten „rozumie" tekst semantycznie i potrafi zwrócić wynik w ustrukturyzowanej formie (JSON).

**Struktura Promptu:**

- **Rola:** „Jesteś analitykiem semantycznym".
- **Zadanie:** Wyekstraktuj encje i przypisz im relacje na podstawie tekstu.
- **Format:** Wymuszamy format JSON (ułatwia to dalszą automatyzację).
- **Ograniczenia:** Ekstraktuj tylko z podanego tekstu (zakaz wymyślania/halucynowania). Używaj tylko zdefiniowanych typów encji (Person, Org, Loc, etc.).

**Zaleta:** Wysoka jakość zrozumienia kontekstu, świetne opisy (evidence).
**Wada:** Wyższy koszt (tokeny) i wolniejsze działanie przy masowej skali.

### 📥 Sekcja Pobierania: Metoda LLM

W tym miejscu możesz pobrać gotowy prompt omawiany w lekcji, służący do ekstrakcji encji wraz z relacjami do formatu JSON.

📥 **Pobierz Prompt:** Ekstrakcja Encji i Relacji (MD)

### Metoda 2: Ekstrakcja za pomocą Pythona (NLP)

Dla większej skali i oszczędności kosztów używamy bibliotek Pythonowych. W lekcji testowaliśmy dwa podejścia w środowisku Google Colab:

- **spaCy:** Działa szybko i „sztywno". Jest restrykcyjna — znajduje mniej encji, ale są one zazwyczaj pewniejsze. Wymaga odpowiedniego modelu językowego (np. `pl_core_news_sm` dla języka polskiego).
- **Transformers:** Podejście eksperymentalne. Znajduje bardzo dużo encji, ale generuje sporo szumu (np. całe zdania jako encje).

**Problem „Sierot" (Orphan Nodes):** Często algorytmy NLP znajdują encję (np. „Gra Cyberpunk"), ale nie potrafią przypisać jej relacji do głównego wątku. Takie „osierocone" węzły należy albo usunąć, albo naprawić w kolejnym kroku.

### 📥 Sekcja Pobierania: Metoda Python

Tutaj znajdziesz skrypt do Google Colab, który wykorzystuje biblioteki spaCy oraz Transformers do automatycznej analizy tekstu.

📥 **Pobierz Skrypt Python:** Python Entity Extractor (PY)

### Wnioski i rekomendowana strategia (Hybrid Pipeline)

Ekstrakcja encji jest trudna i żadna metoda nie jest idealna. Najlepsze rezultaty daje połączenie obu światów:

1. **Ekstrakcja wstępna:** Użyj Pythona (spaCy/Transformers), aby szybko wyciągnąć kandydatów na encje z dużej ilości tekstu.
2. **Deduplikacja i łączenie:** Usuń powtórzenia i połącz podobne byty.
3. **Weryfikacja LLM:** Przepuść wynikowy JSON przez model językowy (np. GPT-4o mini), aby:
   - Usunąć błędy i szum
   - Naprawić relacje (połączyć „sieroty")
   - Dodać brakujące konteksty

Tak przygotowany wsad (JSON z faktami, danymi i encjami) jest gotowy do użycia w procesie generowania ostatecznego artykułu.

---

## 📝 Transkrypcja wideo

Postaram się podsumować, do czego doszliśmy już w naszym pipeline, w całej strukturze nagrywania naszych filmików. Jak widzicie tutaj na spisie treści, doszliśmy do **ekstrakcji encji i relacji**, a to, co zrobiliśmy wcześniej, to ekstrakcja faktów i danych z bloku tekstu, a blok tekstu pozyskaliśmy wcześniej z URL, a URL pozyskaliśmy z SERP-ów na dane słowo kluczowe, na które też piszemy nasz artykuł.

Chciałem nagrywać ten film, ale nagraliśmy z Mateuszem świetny webinar, w którym po pierwsze mamy całą teorię — czym są encje — po drugie pokazałem podczas webinaru, jak wygląda prompt i jak wygląda pozyskiwanie tych encji za pomocą modeli językowych. Stworzyliśmy też skrypt, który pozyskuje encje za pomocą Pythona. Dlatego też tutaj mam pusto. Myślę, że nie ma sensu powtarzania tego wszystkiego i nagrywania ponownie. Zapraszam Was do obejrzenia webinaru, a wszystkie pliki, skrypty i prompty, które są w webinarze, będą dostępne oczywiście w ramach tego kursu w odpowiednich miejscach — w katalogu „Prompty" i w katalogu „Skrypty".

Jak już wspomniałem: śmierć, podatki, encje — to trzy pewne rzeczy w życiu. To jest parafraza pewnego żartu, ale my się skupimy na encjach.

Musicie zrozumieć przede wszystkim, jak NLP widzi tekst. Ja to powtarzam na wielu moich prezentacjach, na konferencjach. Ostatnio też w Gdańsku mówiłem o tym samym temacie. Nie będę wchodził w szczegóły, ale musicie zrozumieć, że bardzo ważne jest zrozumienie tego, jak z analogowego tekstu przechodzimy do cyfrowego jego przetwarzania, ale przede wszystkim — rozumienia w kontekście semantyki.

Tekst to jest ciąg z tokenów. Jeżeli są tokeny, to nie ma hierarchii, nie ma jeszcze oznaczenia, który token jest najważniejszy. Później następuje warstwa NLP, warstwa zrozumienia, i tutaj w pewnym momencie też ekstraktowane są, rozpoznawane są encje. Zrobiłem takie podsumowanie: **dla algorytmu „ładny język" to tylko szum bez struktury**.

**Czym są encje?** Encje to są byty. Ja wielokrotnie próbowałem to zdefiniować. Ja to nazywam **węzłem** — czyli coś, co może być zdefiniowane i coś, co może mieć relacje. A encje też mają relacje przede wszystkim do głównego tematu, ale też encje mają relacje między sobą.

Będziemy dzisiaj się posługiwać w wielu przykładach tematyką kortyzolu. To jest mój ulubiony temat: „jak obniżyć kortyzol po 40". Mamy fragment tekstu: „Badania wykazały, że kortyzol i sen mają znaczący wpływ na układ nerwowy". Szukamy bytów, szukamy pojęć i szukamy obiektów. Tutaj zdefiniowałem to jako: **kortyzol**, **sen**, **układ nerwowy** — czyli coś, co może być zdefiniowane i coś, co może mieć relacje pomiędzy sobą. Możemy powiedzieć, że to są takie nasze punkty odniesienia w morzu tekstu.

Musicie wiedzieć, że **encje to nie są słowa kluczowe**. Będziemy to pokazywać na podstawie ekstrakcji encji z modeli językowych, ponieważ model językowy tak naprawdę trochę zgaduje, czym są encje. Próbuje to zrobić dobrze — zależy od promptu, ten prompt dostaniecie. Ale musicie wiedzieć jedno: to nie jest słowo kluczowe. **Encja to jest sens**, to nie jest fraza, to nie jest słowo kluczowe, które będziecie wrzucać do tekstu. To coś, co ma kontekst — tak jak tutaj widzicie: „kortyzol", a nie „hormon stresu".

Encje mają swoje typy i mają pewną klasyfikację. W zależności od systemu czy modelu NLP, który te encje rozpoznaje albo tworzy, są różne typy i klasyfikacje. Jeżeli poczytacie sobie w internecie, to będziecie wiedzieli, że jest paru głównych. Tutaj przykładowo dałem: **osoba, organizacja, location (czyli Polska, lokalizacja), produkt, koncept**. Koncept będzie nam dawał dość dużo, zwłaszcza w obrębie LLM-ów, halucynacji, więc ja bym też bardzo mocno z tym uważał. Takie typy możecie sami definiować, albo możecie dotrzeć do bibliotek, które je zdefiniowały, i taką bibliotekę tych typów sobie ułożyć i jej używać. Ja zazwyczaj układam między innymi te, które są tutaj, po to, żeby je stosować we wszystkich miejscach, w których albo rozpoznaję encje, albo ich szukam.

Sama lista encji to jest za mało. Encja musi mieć **relacje**. Są różne relacje: encja do encji, encja do głównej tematyki. Na przykładzie kortyzolu: „kortyzol wpływa na sen". Relacje możecie ustawiać. Wcześniej robiłem to na poziomie numerycznym (np. od 0 do 100 — jak bardzo kortyzol jest powiązany ze snem). To nie dawało takich efektów, jak teraz daje mi relacja zdefiniowana tekstowo. Jest też dużo łatwiejsza do interpretacji w grafie wiedzy przez modele językowe.

Typy relacji jeszcze są kolejne: „coś zostało stworzone przez coś", „ktoś pracuje dla kogoś". Tu też możecie je zdefiniować na twardo, nie musicie tego robić. Nie musicie tworzyć tej biblioteki w locie, bo możecie mieć tych typów bardzo dużo. Czy coś jest relacją do czegoś, czy coś jest powiązane, czy coś wymaga — to są rzeczy, które też świetnie opisują encję.

### Praktyka — dwa sposoby ekstrakcji

Zajmiemy się dzisiaj na praktycznej części dwiema ekstrakcjami i porównamy, jak to wygląda:

1. Pierwsza — **ekstrakcja przez LLM**: mamy tekst i wyciągamy z niego encje za pomocą jednego promptu.
2. Druga — **ekstrakcja przez Python NLP**: za pomocą bibliotek.

Zobaczycie sami — może na tym przykładzie uda się wywołać, że ten pierwszy sposób daje nam dość dużo halucynacji. Ważne: te relacje muszą wynikać **nie z wiedzy modelu**, tylko z danego tekstu. Im mniejszy tekst, tym trudniej te encje wydobyć.

Jak to będzie wyglądało w praktyce? Mamy czysty tekst, później następuje ekstrakcja encji, budujemy relacje (czyli mapujemy te relacje), i z tego, co można zbudować? Można zbudować **knowledge graph**. Dla mnie graf wiedzy to nie jest tylko coś opartego na encjach. Graf wiedzy to są również fakty, są również ideacje (czyli pomysły na napisanie danego tekstu) i oczywiście wspomniane encje.

### Praktyka — Prompt LLM

Przejdźmy teraz do praktyki. Będziemy posługiwać się Colabem, ale na początek zaczniemy od samego promptu, który zapisałem w Google Colab. To jest notatnik — środowisko, w którym możecie wywołać skrypt Pythonowy bez posiadania serwera i bez wielkiej wiedzy na temat programowania. Umieściłem tam sam prompt, żebyście zrozumieli, jak on wygląda. Prompt zostanie przesłany do Was mailowo również po tym webinarze.

Zaczynamy oczywiście — będziecie widzieli, jaki schemat stosuję do promptowania. Wejście w rolę:

> „Jesteś analitykiem semantykiem"

— czyli zacieśniamy rolę modelu językowego.

**Zadanie:**

> „Musisz wyekstraktować encje oraz przypisać dla nich relacje na podstawie tekstu."

Nasz prompt wymusza zadanie struktury JSON-owej, czyli te odpowiedzi — to nie będą tylko encje wymienione, w tym JSON-ie będą też relacje. Może to się wydać Wam skomplikowane, ale wystarczy, że w tym promcie zmienicie sposób outputu i może Wam wyświetlić odpowiedź w postaci CSV-ki bądź po prostu w postaci listy. Trudniej się pracuje z JSON-em, ja jestem do tego przyzwyczajony. Jeżeli ktoś jest copywriterem, to chciałby pewnie mieć listę encji z samymi relacjami — co byłoby dużo prostsze.

Następnie następuje **lista reguł**. Oczywiście prosimy go (bo model językowy zacznie halucynować), żeby wyekstraktował tylko encje, które znajdą się w tym tekście. Przede wszystkim, żeby nie tworzył nowych encji, które są może w obszarze tematycznym, ale nie ma ich w tym tekście. Wiadomo, że pewne rzeczy trzeba wiele razy powtarzać modelowi — żeby nie umieszczał żadnego tekstu na zewnątrz JSON-a, żadnego markdowna, żadnego komentarza. To jest standard.

Wymieniam od razu w prompcie, jakie są dozwolone typy encji: **Person, Organization, Location, Product, Concept, Event**. I on już w tym momencie nie wyjdzie i nie stworzy nam żadnego dodatkowego typu. Jeżeli tego nie zrobicie, to macie szansę, że on będzie w nieskończoność te typy wymyślał.

Później jakie są **typy relacji**: `part_of` (jest częścią czegoś), `located_in` (jest zlokalizowany w), `created_by` (stworzony przez), `works_for` (pracuje dla kogoś). Końcówka to **JSON-schema** — wskazujemy modelowi, jaki ma być output.

Jak to wygląda w praktyce? Przełączymy się na Playground OpenAI. Zaczniemy od modelu **GPT-4.1**. Dlaczego model językowy, a nie reasoningowy? Tokeny, koszty. GPT-4.1 jest chyba ostatnim z modeli stricte językowych w OpenAI. Zmniejszymy temperaturę — według mnie do ekstrakcji nie jest potrzebna. Jedynka to jest model bardzo z rozbudowaną wyobraźnią. Jeżeli mamy tekst i wyciągamy coś z niego, to nawet nie wiem, czy 0.5 nie jest za dużo. Zwiększamy liczbę tokenów. To są standardowe ustawienia.

Tekst celowo został wygenerowany tak, żebyśmy mogli wygenerować z niego bardzo dużo encji. Jest to tekst na temat **CD Projekt** — firmy, która wydała Wiedźmina. Jeżeli przeczytacie ten tekst, to będziecie wiedzieli, że jest naszpikowany encjami. Odpalamy.

Mamy analizę samego contentu — to nas na razie mało interesuje, ale zaczynamy od **encji, które znalazł**. Każda encja będzie miała swoje ID. Encja: **CD Projekt SA**, typ: **Organization**, evidence (czyli taki opis): „polska firma deweloperska i wydawnicza gier komputerowych". Świetny opis encji — przekazana w ten sposób informacja do Waszego systemu, który na przykład generuje teksty, bardzo dużo daje, czy nawet dla copywritera.

Dalej dla przykładu: **Marcin Iwiński**, Person, „współzałożyciel CD Projekt". Następnie: **Wiedźmin**, Product (tak naprawdę powinna być chyba „gra Wiedźmin"). **Sapkowski** itd. Ale nie ma sensu czytać wszystkiego.

Następnie **relacje**. Tutaj akurat output jest tak skrolowany, że nie widzimy dokładnie, która encja z nazwy, ale mamy ID. Pod jedynką był CD Projekt, pod jedenastką pewnie Giełda Papierów Wartościowych. I to jest ta relacja zapisana w JSON-ie. To nam robi strukturę drzewa, którą można wykorzystać w danych w następnych projektach.

### Praktyka — Python (spaCy + Transformers)

Kończymy z OpenAI. Przejdźmy teraz do Pythona. Instalujemy biblioteki **spaCy** i **Transformers**. To są biblioteki NLP, które pomogą nam ekstraktować ten tekst. Po użyciu tego prostego skryptu zrobimy jeszcze jedną prezentację, która podsumuje wszystkie wyniki Pythonowe.

Instalujemy biblioteki — to poniżej minuty. Konfiguracja, klucz do OpenAI (w sumie nie potrzebny, bo będziemy ekstraktować bibliotekami).

Pokażę, że ten sam tekst jest tutaj. Mamy zdefiniowane typy. Język: PL. **Jedna ważna rzecz:** te biblioteki nie zawsze będą działać dla wszystkich języków, bo każda biblioteka musiała być na czymś trenowana. Używamy `spacy.pl_core_news_sm` — została wytrenowana na newsach. Wiele bibliotek jest też trenowanych na Wikipedii.

Odpalamy. To nie powinno zająć długo. **Biblioteki załadowane, kod tekstu: 996 znaków.** Encje. Pamiętajcie, że używam **dwóch bibliotek**, więc będzie dwa razy taka analiza. A nawet używam trzech. Dlaczego? **spaCy czasami jest bardzo uboga i nie widzi wszystkich encji. Transformers jest z kolei przerysowany — widzi ich za dużo.** Możemy to wszystko zmergeować i usunąć niepotrzebne.

Wyniki:

- **spaCy:** 17 encji. Polska — Location, Warszawa — Location. „Gone" — Person (nie wiem, może to jest źle). „Rok" — Date (zostało rozpoznane). Typów: Location 6, Person 5, Organization 4, Concept 2.
- **Transformers:** 26 encji, czyli dużo więcej. Jak widzicie, to też jest trochę zabawa — nie zawsze te encje będą takie, jakich oczekujemy.

Możemy zrobić **graf encji**, gdzie mamy relacje pomiędzy nimi. Są też encje tak zwane **Orphan** (jak Orphan Pages w SEO) — encje samotne, których nie udało się powiązać. Np. „gra Cyberpunk" — nie udało się powiązać z CD Projektem. Ja zazwyczaj takie orphan encje albo sprawdzam jeszcze raz, czy one leżą w tym tekście, albo całość po ekstrakcji NLP jeszcze wrzucam do LLM-a razem z tekstem, żeby je zweryfikować i poprawić. To jest chyba najlepszy sposób.

Jeżeli chodzi o sam prompt, to przy dużych tekstach macie dużo halucynacji, dużo encji i wytłumaczeń tych encji oraz relacji, które nie są ze sobą powiązane.

**Ekstrakcja encji to co dzisiaj chcę Wam powiedzieć — naprawdę bardzo trudna i nie ma jednego dobrego rozwiązania.** Ja to robię na oba sposoby: merdżuję, czyszczę, a na koniec jeszcze raz wykorzystuję LLM do weryfikacji. Ostateczna liczba encji jest całkiem przyjemna przy takim pipeline, i można ją jeszcze również zawężać/ograniczać, żeby nasz graf wiedzy nie był zbyt rozbudowany.

### Postpraktyka — Case Study CD Projekt

Do czego dążymy z encjami? Tak jak wcześniej wspomniałem, chodzi o stworzenie grafu wiedzy, który będzie nam służył do budowania treści. To jest case study na podstawie tekstu o CD Projekcie:

- **Przetwarzanie:** 996 znaków za pomocą spaCy.
- **Wyniki:** CD Projekt — Organization, Warszawa — Location. Uzyskaliśmy 17 encji, finalnie 8 relacji + wizualizacja po zmerdżowaniu.

**Pipeline:**

1. Czyszczenie tekstu z HTML i innych znaków.
2. Ekstrakcja na różne sposoby (model: `pl_core_news_sm`).
3. Ekstrakcja relacji osobno — można to zrobić za pomocą LLM lub Pythona.
4. Deduplikacja — spaCy daje podobne, model daje podobne, Transformers daje podobne. Deduplikujemy.
5. Łączenie — jeżeli jeden opis jest dużo lepszy niż drugi, mergeujemy.
6. Wizualizacja (opcjonalnie). Wszystko jest zapisane w JSON-ie i przekazywane jako input do kolejnych kroków.

Jeżeli chcecie zwizualizować — są biblioteki w Pythonie. Ale nie wiem, do czego by to było potrzebne, chyba że dla copywritera, któremu by łatwiej było zobaczyć potencjalne relacje między encjami.

**Porównanie spaCy vs. Transformers:**

- **spaCy** — strict, mało błędów, mniej encji.
- **Transformers** — eksperymentalna, dużo więcej encji, więcej błędów (były fragmenty tekstów oznaczone jako encje).

Skrypt do spaCy/Transformers możecie zrobić **vibe codingiem** — poprosić LLM, żeby stworzył prosty skrypt do ekstrakcji encji. Naprawdę parę linijek promptu wystarczy.

### Ostateczne wnioski — co działa

- Super rozpoznawane są **osoby, firmy i lokalizacje**.
- Jeżeli jest prosta relacja, też jest prosta do wykazania.
- Do poprawy: niektóre koncepty (Wiedźmin był w pewnym momencie oznaczony jako lokalizacja), Orphan encje (9 encji bez relacji — generalnie nie powinno to mieć miejsca, ale po weryfikacji przez LLM można się tego pozbyć).

### Gdzie to można zastosować?

- **Content pisany pod SEO**
- **Research** — jeżeli chcecie zbudować brief dla copywritera w danym temacie
- Analiza rynków
- Budowanie chatbotów na bazie wiedzy z zakresu danego tematu

Najpierw trzeba zdobyć teksty (bazę wiedzy) — my robimy to skanując SERP-y Google'a. Strony w Top 10 mają najlepsze pokrycie encji. Skalowanie tego rozwiązania wymaga stworzenia API bądź Pythonowego rozwiązania, które będzie pobierać teksty z bazy danych, przetwarzać i przekazywać do następnego kroku.

### Kluczowe wnioski

**Postawcie na to, co proste. Nie budujcie, nie szukajcie rozwiązań na siłę.** Macie wszystko pod ręką. Na nasze potrzeby generowania treści to jest wystarczające.

---

**Poprzednia strona:** 2.5 Ekstrakcja faktów
**Następna strona:** 2.7 NER
