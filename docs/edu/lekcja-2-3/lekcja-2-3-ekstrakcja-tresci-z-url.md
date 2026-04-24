# 2.3 Ekstrakcja treści z URL

**Kurs:** AI Content Expert — Blok 2, Lekcja 3
**Mentor:** Maciej Chmurkowski
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-3/

---

## 🎯 Cel lekcji

Masz już listę adresów URL (z poprzedniej lekcji). Teraz czas na pobranie z nich „mięsa", czyli samej treści merytorycznej. To krytyczny moment — jeśli na tym etapie do Twojego systemu trafią śmieci, Twój finalny model będzie halucynował.

---

## 📒 Notatka z lekcji

### Dlaczego „Ctrl+C, Ctrl+V" to za mało?

Strony internetowe są pełne elementów, które nie są treścią właściwą artykułu. Są to:

- Paski boczne (sidebary) i reklamy
- Stopki, nagłówki (headery)
- Polityki prywatności i zgody RODO
- Linki nawigacyjne

Jeśli nie oczyścisz danych przed podaniem ich do modelu (RAG), te przypadkowe fragmenty tekstu zakłócą działanie grafu wiedzy.

### Narzędzie: Crawl4AI

Do pobierania treści wykorzystujemy bibliotekę Pythonową **Crawl4AI**.

Dlaczego to narzędzie?

- **Imitacja przeglądarki:** Crawl4AI udaje prawdziwą przeglądarkę (może zmieniać User Agent), co pozwala ominąć wiele blokad, które zatrzymałyby proste boty.
- **Wbudowane filtry:** Posiada algorytmy pomagające automatycznie oddzielić treść od szumu.

> [!CAUTION]
> **Ostrzeżenie: Pułapka „Lenistwa" z ChatGPT**
>
> Zanim przejdziesz do kodu, ważna lekcja. Możesz pomyśleć: „Po co mi kod, poproszę ChatGPT, żeby wszedł na link i streścił artykuł".
>
> **UWAGA:** ChatGPT często halucynuje, twierdząc, że wszedł na stronę. W lekcji przeprowadziliśmy test: poprosiliśmy czat o wyciągnięcie treści z konkretnego URL-a. Model wygenerował piękne, sensowne streszczenie. Po ręcznym sprawdzeniu okazało się, że wymyślił treść, która nie miała nic wspólnego z rzeczywistym tekstem na stronie.
>
> **Wniosek:** Do precyzyjnej pracy na danych musisz używać kodu (Pythona), a nie polegać na deklaracjach czatu w trybie konwersacyjnym.

### Metody filtrowania treści w Crawl4AI

Aby pobrać tylko to, co istotne, Crawl4AI oferuje różne strategie. W lekcji przetestowaliśmy dwie:

#### 1. Algorytm BM25 (Podejście oparte na zapytaniu)

Wykorzystuje ranking treści względem Twojego zapytania (keywordu) lub nagłówka H1.

- **Jak działa:** Szuka bloków tekstu, które są matematycznie (kosinusowo) zbliżone do Twojego tematu (np. „jak obniżyć kortyzol").
- **Zaleta:** Bardzo wysoka precyzja (dostajesz tylko to, co dotyczy tematu).
- **Wada:** Może wyciąć zbyt dużo. Jeśli artykuł ma dygresje lub szeroki kontekst oddalony od słowa kluczowego, BM25 może to pominąć.

#### 2. Pruning Content Filter (Podejście heurystyczne)

Analizuje strukturę strony, aby odciąć szum.

- **Jak działa:** Oblicza „score" dla każdego bloku tekstu, biorąc pod uwagę gęstość tekstu, liczbę linków i znaczenie tagów HTML.
- **Zaleta:** Skutecznie usuwa menu, stopki i nawigację, zachowując większość artykułu.
- **Wynik testu:** W naszej lekcji ta metoda dała lepsze rezultaty (więcej użytecznej treści) niż restrykcyjny BM25.

### Proces Krok po Kroku (Prototypowanie)

Pracujemy w Google Colab. Zamiast pisać kod ręcznie, wykorzystujemy LLM (ChatGPT/Claude) do wygenerowania skryptu.

**Krok 1: Przygotowanie Prompta**

Wklej do czatu dokumentację Crawl4AI (szczególnie sekcje o BM25 lub Pruning Content Filter) i poproś:

> „Stwórz skrypt w Pythonie dla Google Colab, który użyje biblioteki Crawl4AI do pobrania treści z danego adresu URL [WSTAW URL]. Wykorzystaj [NAZWA FILTRA] do oczyszczenia treści."

**Krok 2: Instalacja Bibliotek**

Skrypt wygenerowany przez AI będzie wymagał instalacji. W Colabie uruchom komendy (zazwyczaj zaczynające się od `!pip install ...`), które poda Ci model.

**Krok 3: Test na jednym URL-u**

Nie uruchamiaj od razu pętli dla 100 stron:

- Wybierz jeden URL (np. Top 1 z Google).
- Uruchom skrypt z filtrem BM25. Sprawdź wynik. (W lekcji wynik był zbyt okrojony).
- Uruchom skrypt z filtrem Pruning Content Filter. Sprawdź wynik. (Ten wynik był satysfakcjonujący).

**Krok 4: Weryfikacja**

Przeczytaj pobrany tekst. Sprawdź, czy nie ma tam stopek, zgód na pliki cookie czy nawigacji.

### Wskazówki Eksperta (Pro Tips)

- **Ile treści potrzebujesz?** Mając 10 URLi, zazwyczaj wystarczy skutecznie pobrać dane z 4-5 z nich, aby zbudować solidny graf wiedzy.
- **Zaawansowane czyszczenie (Metoda Mateusza):** W profesjonalnych zastosowaniach można pisać własne skrypty (Regex), które „na sztywno" wycinają sekcje Head, Footer, skrypty JS i porównują bloki tekstu między sobą. Jednak na potrzeby tego kursu biblioteka Crawl4AI jest wystarczająca.
- **Zapisywanie:** Pobrane treści warto oddzielać od siebie wyraźnym separatorem (np. `---`), co ułatwi ich późniejsze przetwarzanie jako tablicy danych (Array).

### Zadanie Domowe (Next Step)

Twoim zadaniem jest przekształcenie prototypu w działający automat:

1. Weź listę URLi wygenerowaną w poprzedniej lekcji.
2. Poproś AI o zmodyfikowanie skryptu tak, aby działał w pętli.
3. Skrypt ma wejść na każdy URL z listy, pobrać treść (używając sprawdzonego filtra, np. Pruning) i zapisać wyniki w jednym pliku/zmiennej, oddzielając artykuły trzema myślnikami (`---`).

W następnym kroku z tych „klocków" będziemy budować graf wiedzy.

---

## 📚 Materiały dodatkowe

- 📂 **Content Extractor - BM25** — Skrypt Crawl4AI z filtrem BM25 do ekstrakcji treści na podstawie zapytania
- 📂 **Content Extractor - Pruning Filter** — Skrypt Crawl4AI z filtrem heurystycznym do usuwania szumu ze stron
- 📂 **Content Extractor - wersja zaawansowana** — Zaawansowany skrypt z metodą MCH do porównywania bloków tekstu

---

## 📝 Transkrypcja wideo

W poprzednim filmie dość zabawnym pokazałem wam jak pobierać listę URL dla danego zapytania. W tym momencie przechodzimy do kolejnego kroku w naszym pipeline — już z tej listy URL, dla poszczególnych URL, będziemy pobierać treść danej strony internetowej.

Na co tu trzeba uważać? Trzeba uważać, żeby do tego naszego RAG-a, z którego będziemy robić graf wiedzy, nie trafiły śmieci. Bo taka strona, jeżeli będziemy z niej pobierać — a różne są sposoby pobierania, zaraz to omówimy — żeby pobrać sam content, który dotyczy danego zapytania, nigdy to nie jest tak proste, jak się wydaje. Jeżeli pobierzemy skrawki jakiegoś sidebara, polityki prywatności, to później, jeżeli nie oczyścimy tego przed podaniem do następnego kroku, możemy mieć dość sporo halucynacji bądź zakłóceń finalnego grafu wiedzy.

Ja używam do tego i polecam Wam z całego serca takiej biblioteki w Pythonie, która nazywa się **Crawl4AI**. Ta biblioteka jest dość duża, teraz sobie ją przejrzymy.

Na czym polega różnica? Przede wszystkim na tym, że Crawl4AI imituje przeglądarkę. Defaultowo jest skonfigurowana, nie pamiętam jaka przeglądarka, ale może się to zmieniać albo wrzucać losowo. Crawl4AI dzięki temu — to jest najważniejsza dla mnie funkcja, bo poza tym to chyba niewiele używam — powoduje, że jestem w stanie dojść do wielu stron, mój crawler nie jest blokowany.

Jeżeli mam 10 adresów URL do przekrawlowania, staram się wyciągnąć treść przynajmniej z 4-5 stron. Więcej moim zdaniem nie trzeba. Na początku skupimy się tylko na pojedynczym adresie URL, czyli weźmiemy sobie pierwszy adres URL i spróbujemy z tego adresu za pomocą Pythona, Crawl4AI i jeszcze — uwaga — weryfikacji albo odpytania do LLM-a. Tu są naprawdę różne metody. Wybrać tylko tą część treści, która dotyczy naszego zapytania, czyli czego? Kortyzolu. Jak obniżyć kortyzol po 40?

Jeżeli przyjrzycie się dokumentacji Crawl4AI, jest ona bardzo mocno rozbudowana. Crawl4AI też ma w sobie taką funkcję: jeżeli podpinacie klucz danego LLM-a, to razem z konfiguracją Crawlera w kodzie możecie też wysłać prompt, który może mówić: „wyciągnij mi z danej strony tylko informacje dotyczące, na przykład, cen". Więc ten crawler, który ustawicie, jednocześnie crawluje stronę, ale sam ma silnik kontaktowania się przez API do wybranego LLM-a i oczyszczania tych danych. Ja tego nie używam, bo nie mam na tym kontroli. Ten prompt jest bardzo prosty, pewnie można go rozbudować, ale wolę to zrobić osobno.

Jest parę funkcji, które ułatwiają pobieranie tych treści. Przypominam — my chcemy pobrać tak naprawdę tylko treści, które dotyczą danego zapytania, pozbyć się wszystkiego innego. Była tu taka funkcja, nazywała się **BM25**. Zaraz ją odnajdę. Jest i **Pruning Content Filter**, i będzie BM25. To są zbliżone funkcje, które wykorzystują embeddingi. Jedna z nich używa H1 jako punktu odniesienia w szukaniu zbliżonych kosinusem innych bloków treści na tej stronie. To ma swoje minusy i plusy, dlatego że niektóre bloki, które są zbyt oddalone od tej H1 — a takie też się zdarzają, czyli mamy rozwinięcie jakiegoś wątku — są pomijane. Więc to nie jest tak, że jesteśmy w stanie w 100% dostać całą tą treść, która nas interesuje, ale to już jest bardzo, bardzo, bardzo dużo.

Ja nie będę się wczytywał — oczywiście mógłbym, ale po co? Wykorzystamy ChatGPT, którego poprosimy, żeby zbadał nam, jakie są różnice. Podaję dokumentację Crawl4AI, dokładnie do tego miejsca:

> „Wskaż różnice pomiędzy BM25 i Pruning Content Filter."

- **Pruning Content Filter** — heurystyczne odcinanie szumu. Cel: usunąć treść o małej wartości informacyjnej niezależnie od tematu. Jak działa: analizuje elementy strony i oblicza score dla każdego bloku tekstu — brana pod uwagę jest między innymi gęstość tekstu, gęstość linków, znaczenie tagów.
- **BM25** — ranking treści względem zapytania użytkownika. Może wybierać tylko te fragmenty zawartości, które są najbardziej relewantne względem konkretnego zapytania. Czyli tu też musimy wskazać, na przykład wyekstrahować sobie H1, albo jeżeli mamy nasze słowo kluczowe, to też możemy je wrzucić. Jak wrzucę „kortyzol po 40", BM25 wyszuka nam po kosinusie — wiecie dobrze, co to jest kosinus — tylko te bloki tekstu, które są z tym związane.

Na potrzeby dzisiejsze będziemy wykorzystywać BM25. Wiemy już, co będziemy robić. Teraz musimy zrobić prototyp. Zrobimy prototyp tylko na podstawie jednego adresu URL i będziemy chcieli BM25 wykorzystać, żeby zobaczyć, co nam z tego wyjdzie. Oczywiście użyjemy ChatGPT do napisania tej funkcji.

Jeżeli jesteśmy już w wątku czatu, on już się zapoznał z dokumentacją, więc dużo łatwiej nam też będzie od razu napisać ten skrypt. Piszę prompt — proszę go o stworzenie takiego skryptu, który używając Crawl4AI i BM25 pobierze nam content z danego adresu URL. Na razie tylko z jednego. Dlaczego? Dużo łatwiej jest zrobić prototyp na podstawie jednego adresu URL. Później poprosić go znowu, zostawiając ten prototyp — bo tam łatwo jest testować — poprosić o kolejny skrypt, który wykorzysta ten już istniejący i w pętli odpyta wszystkie adresy URL z listy, którą mamy z poprzedniego kroku, i wygeneruje nam ten content.

Piszemy prompt:

> „Stwórz skrypt w Pythonie (Google Colab), który pobierze treść z danego adresu URL i wykorzysta nasze słowo kluczowe »jak obniżyć kortyzol po 40« w ramach funkcji BM25."

Oczywiście najważniejsza rzecz — nie wspomniałem, że mamy użyć biblioteki Crawl4AI. Zobaczymy, co teraz nam odpowie.

Czat od razu też zaznaczył, że to jest Google Colab, bo te będą się różnić, jeżeli będziecie pisali na potrzeby nie notatnika, tylko plików wykonywanych na serwerze.

Myślałem, że czat będzie mądrzejszy, bo na górze miał wczytaną dokumentację BM25, ale przeszukiwał jeszcze internet i znalazł Docs Crawl4AI — więc robił jeszcze raz tę robotę, której nie musiał wykonywać. Jednak warto w każdym zapytaniu dodać tą dokumentację.

Pierwsza rzecz, którą mamy, to instalacje do Colab. Kopiujemy i wrzucamy do naszego okienka instalacyjnego. Tych instalacji będzie sporo, ale jak mówiłem, Crawl4AI emuluje przeglądarkę.

Wracamy do naszego ChatGPT i nasz kod wygląda mniej więcej w ten sposób. Wprowadzamy adres URL, nasz query jest już podany. Skrypt nie jest zbyt duży, ale spodziewam się — znając Crawl4AI i znając dostępność stron internetowych przeładowanych JavaScriptami — jakichś fajerwerków, więc najwyżej będziemy to poprawiać na bieżąco.

Stworzymy nową sekcję, przesuniemy ją na dół, nazwiemy ją **Content Extractor - jeden URL**, poniżej kod, i w tym kodzie wprowadzimy już nasz Top 1 z wyników wyszukiwania.

Nie wiem, jak to wygląda, jeżeli chodzi o pobieranie treści stron internetowych w orkiestratorach typu Make i n8n. Być może też znajdziecie gdzieś w sieci jakieś API, które wam na to pozwoli. Ja jednak jestem za tym Pythonem. Zdaję sobie sprawę, że nie każdy z Was też będzie chciał budować ten pipeline. Możecie też wykorzystać ChatGPT — zaraz wypróbujemy w nowym wątku sam czat i zapytamy się, czy jest on w stanie wyekstrahować nam treść. Dla osób, które by chciały zrobić mniejszej ilości artykułów, a chciałyby to zrobić bardzo dobrze. Sprawdzimy, czy da się to zrobić, czy będzie w jakiś sposób nas blokował.

> „Czy jesteś w stanie wyekstraktować treść dotyczącą zapytania »jak dobrze obniżyć kortyzol po 40« z tej strony internetowej?" — i podałem ten adres URL, który jest Top 1.

Odpowiedź: „Tak, wyekstraktowałem dla Ciebie kluczową treść z artykułu na temat tego, jak realnie obniżyć kortyzol po 40 z podanej strony — Klinika Mańska". Ej, sprawdzę to. Coś mi to wygląda na halucynację. „Oto streszczenie najważniejszych wskazówek..." — i tutaj już mamy treść, która by się nadawała. Świetnie jest wyekstrahowana, jest streszczona, poukładana, nadawałaby się do budowy naszego grafu wiedzy.

Ale zaraz, porównamy to. „Krótko to robi w Twoim organizmie, męski stres pracy po czterdziestce..." — ciężko mi będzie w tej chwili to dobrze porównać, ale zrobimy jeszcze inaczej. Zaznaczę sobie tą treść — tak też możecie robić, też możecie ją kopiować bezpośrednio, zapisywać do plików. Ja nienawidzę tego, ja automatyzuję wszystko, ale jeżeli chcecie zrobić sobie to w ChatGPT, to nie musicie tak naprawdę robić tego w Pythonie.

Skopiuję. Mówię: „To jest treść skopiowana z tej strony, czy to jest na pewno to samo?" **Nie. Bingo.** Także uważajcie na takie rzeczy. ChatGPT „powiedział", że przekrawlował tą stronę, coś sobie poszukał niby w internecie — prawdopodobnie to zmyślił. Lepiej już jest skopiować tą treść nawet w tej chwili, moglibyśmy sobie ją gdzieś na boku zapisać do jakiegoś notatnika, żebyśmy mogli później ją wykorzystywać.

Wrócimy najpierw do naszego Pythona. Biblioteki się zainstalowały. **Content Extractor** — spróbujemy go uruchomić. Inicjacja Crawl4AI, w tej chwili przeszedł. Zobaczcie, co się stało. Jest tej treści, tak jak mówiłem, dużo mniej. Bo on działa na wykorzystaniu funkcji BM25, czyli porównuje — wyciągnął tylko te bloki tekstu, które są bardzo bliskie kosinusem do naszego zapytania.

Żeby zamknąć jeszcze ten wątek pobierania tych treści, możemy jeszcze wykorzystać jedną funkcję, czyli **Content Pruning**. Przejdźmy sobie do naszego wątku w czacie.

W międzyczasie, kiedy ChatGPT tworzy tą treść — jak ja to robię. Dam Wam trochę podpowiedzi. Nie chodzi o to, że nie chcę się dzielić. Myślę, że zostawię skrypt Pythonowy, w którym będziecie mieli bardzo mocno rozbudowany. Ciężko było nam by tutaj to stworzyć — siedzielibyśmy pewnie pół godziny, bo to jest skrypt, który ja tworzyłem parę dni.

Co ja robię? Ja wycinam. Oczywiście z Crawl4AI nie korzystam z tych funkcji, dlatego że one wycinają zbyt dużo, nie dostarczają tej treści, którą chcę. Wycinam wszystko, co niepotrzebne — wycinam Head (jeżeli znacie się na HTML, to wiecie, że to jest bardzo dużo w nagłówku), wycinam wszystkie niepotrzebne sidebary, stopki, polityki prywatności. To jest wycinanie regexem, czyli trzeba też wczytać w Pythonie. Wyciągam tylko bloki tekstów i oczywiście te bloki tekstów porównuję nie tylko do zapytania, ale też do H1, i też porównuję ich similarity score pomiędzy sobą, nie tylko względem głównego zapytania. W ten sposób jestem w stanie wyciągnąć naprawdę duże bloki tekstów, i jeżeli coś zostanie pominięte, to i tak pamiętajcie, że ściągamy z tych stron, nie wiem, pięć, dziesięć, wyciągamy z nich tylko później najważniejsze informacje, encje, które pomogą nam zbudować graf wiedzy.

Mamy już ten drugi skrypt, chcemy to porównać. Wstawimy to sobie jako kolejny skrypt — możecie też zwijać te komórki i bezpośrednio otworzyć sekcje pod nimi. Dodajemy kod **Extractor 2**, za chwilę uruchomimy. Zobaczmy, jak dużo mamy tej treści. Odpalamy.

**Jest lepiej. Jest dużo lepiej.** I taki tekst już się nadaje. To jest tekst — nie ma żadnych licencji, tylko teksty, które zostały pobrane z tej strony. Oczywiście są duplikacje. Możecie to na każdym poziomie wrzucić czy do LLM-a, a nawet Python jest w stanie Wam sprawdzić, czy nie ma duplikacji w linijkach, i to wyciąć.

### Waszym zadaniem domowym jest:

Stworzenie podobnego skryptu, ale też jeszcze druga część — wykorzystanie listy URL-i. Możecie nawet, jeżeli nie macie z poprzedniego kroku, to sobie taką listę URL-i wrzucić (bo pamiętacie, to są klocki, możecie sobie składać, możecie te listy mieć z innych źródeł). I tą treść napisać skrypt za pomocą jakiegoś czata, który pobierze wszystkie te treści i zapisze oddzielone na przykład trzema myślnikami.

Dlaczego trzema myślnikami? Bo później będziemy to wykorzystywać — uznamy to jako array, czyli tablicę. Otworzymy to sobie w kolejnym kroku i z każdego tekstu będziemy ekstrahować dane.

---

**Poprzednia strona:** 2.2 Pobieranie z SERP
**Następna strona:** 2.4 Czyszczenie treści
