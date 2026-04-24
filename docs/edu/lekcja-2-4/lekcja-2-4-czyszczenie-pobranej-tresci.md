# 2.4 Czyszczenie pobranej treści

**Kurs:** AI Content Expert — Blok 2, Lekcja 4
**Mentor:** Maciej Chmurkowski
**Ocena:** ★★★★★ 4.9 (9 ocen)
**Źródło:** https://materials.sensai.io/kursy/ai-content-expert/blok-2/lekcja-4/

---

## 🎯 Cel lekcji

Celem tej lekcji jest stworzenie skryptu, który wyczyści pobrane dane, wykorzystując zaawansowaną technologię embeddingów (wektoryzacji tekstu).

---

## 📒 Notatka z lekcji

W poprzednim kroku nauczyliśmy się pobierać treść stron internetowych (tzw. *content scraping*) przy użyciu biblioteki Crawl4AI. Mimo użycia filtrów (takich jak BM25 czy Pruning), pobrane dane często wciąż zawierają „śmieci":

- Zduplikowane fragmenty
- Pozostałości menu, stopek czy sekcji „Czytaj także"
- Kod HTML lub niepożądane znaki
- Treści ucięte lub niekompletne

### Dlaczego musimy to robić?

- **Oszczędność pieniędzy i zasobów:** Modele językowe (LLM) rozliczane są za tokeny. Przesyłanie zduplikowanych lub bezwartościowych fragmentów tekstu to marnowanie budżetu.
- **Jakość grafu wiedzy:** Jeśli do Twojego RAG-a (Retrieval Augmented Generation) trafią śmieci, model będzie halucynował. Czysty wsad = czysty wynik.
- **Redukcja szumu:** W lekcji udało nam się zredukować objętość tekstu o **43%**, usuwając duplikaty i zbędne elementy, zachowując jednocześnie kluczowe informacje.

### Jak działa nasz proces czyszczenia?

Zamiast polegać tylko na prostych filtrach słów kluczowych, wykorzystamy modele embeddingowe (np. OpenAI `text-embedding-3-small` lub `text-embedding-ada-002`).

**Zasada działania:**

1. Skrypt dzieli pobrany tekst na mniejsze bloki (paragrafy).
2. Każdy blok jest zamieniany na wektor (ciąg liczb reprezentujący jego znaczenie semantyczne).
3. Porównujemy wektory między sobą, obliczając tzw. **Cosine Similarity** (podobieństwo kosinusowe).
4. Jeśli dwa bloki są zbyt podobne (np. similarity > 0.9), usuwamy jeden z nich.
5. Jeśli blok ma zbyt niskie powiązanie z naszym tematem głównym (np. similarity < 0.3), traktujemy go jako szum i usuwamy.

### Tworzenie skryptu w Google Colab (Vibe Coding)

Twoim zadaniem jest stworzenie skryptu Pythonowego, który wykona tę pracę. Poniżej znajduje się instrukcja, jak wygenerować taki kod przy pomocy AI (Claude/ChatGPT).

**Wymagania wstępne:**

- Plik tekstowy z pobranymi artykułami (oddzielonymi separatorem, np. `---`).
- Klucz API do OpenAI (dla modelu embeddingowego).

**Prompt do wygenerowania skryptu:**

> „Napisz skrypt w Pythonie dla środowiska Google Colab, który:
>
> 1. Wczyta treść z pliku tekstowego `[NAZWA_PLIKU.txt]`, gdzie artykuły są oddzielone separatorem `---`.
> 2. Oczyści tekst z pozostałości HTML i zbędnych znaków.
> 3. Wykorzysta embeddingi OpenAI do analizy semantycznej.
> 4. Porówna bloki tekstu między sobą i usunie te, które są zbyt podobne (duplikaty treści).
> 5. Wewnątrz każdego artykułu usunie paragrafy, które mają niski similarity score (np. poniżej 0.3) względem naszego słowa kluczowego `[TWOJE_SŁOWO_KLUCZOWE]`.
> 6. Zapisze oczyszczone bloki do nowego pliku, zachowując strukturę oddzieloną separatorem `---`.
> 7. Wyświetli w logach statystyki: ile bloków było na początku, ile usunięto i o ile procent zredukowano treść."

### Praca z kodem i Debugging (Lekcje z boju)

Podczas tworzenia skryptu możesz napotkać problemy. Oto jak sobie z nimi radzić (na podstawie doświadczeń z lekcji):

**Problem 1: Wynik w jednej linii**
AI może „spłaszczyć" wynik do jednej linii tekstu, usuwając znaki nowej linii.
*Rozwiązanie:* Wskaż w prompcie:
> „Zachowaj oryginalną konstrukcję bloków i paragrafów. Nie usuwaj znaków nowej linii (`\n`) wewnątrz treści."

**Problem 2: Puste bloki w tablicy**
Skrypt może usunąć treść, ale zostawić puste miejsce w tablicy wyników.
*Rozwiązanie:* Doprecyzuj:
> „Usuwaj całkowicie puste bloki z tablicy wyjściowej, nie zostawiaj pustych stringów."

**Problem 3: Konfiguracja API**
AI może hardkodować klucz API lub prosić o niego w inputach.
*Rozwiązanie:* Używaj zmiennych środowiskowych (`os.environ`) lub wczytuj klucz z bezpiecznego miejsca w Colabie (Secrets).

### Analiza wyników (Logi)

Dobry skrypt powinien generować logi, które pozwolą Ci ocenić jego skuteczność. Szukaj informacji takich jak:

- Bloków wejściowych: np. 8
- Par zbyt podobnych bloków: np. 2 (to oznacza wykryte duplikaty)
- Redukcja treści: np. 43% (świetny wynik!)

Nie przejmuj się, jeśli w wynikowym tekście pojawią się drobne ucięcia zdań. Na potrzeby RAG i tak będziemy ekstraktować z tego konkretne fakty i encje, a nie kopiować tekst 1:1.

### Następny krok

Masz teraz plik z czystym, skondensowanym „mięsem" wiedzy. To jest Twój fundament. W kolejnych lekcjach użyjemy tych danych do budowy właściwego grafu wiedzy, ekstraktując z nich fakty i encje.

### Co możesz zrobić teraz?

1. Pobierz gotowy skrypt z sekcji „Skrypty" (lub spróbuj napisać własny z promptem powyżej).
2. Wgraj swój plik z treścią do Colaba.
3. Uruchom czyszczenie i sprawdź, o ile procent udało Ci się „odchudzić" tekst.

---

## 📚 Materiały dodatkowe

- 📂 **Content Cleaner** — Skrypt do czyszczenia treści z duplikatów i szumu za pomocą embeddingów OpenAI

---

## 📝 Transkrypcja wideo

W poprzednim filmie pokazywałem Wam, jak pobierać treść z danego adresu URL, tak naprawdę z danej strony internetowej. Przypominam — pokazywałem też, jak oszukuje nasz ChatGPT, który mówi, że pobrał treść z tej strony, natomiast ją shalucynował.

Cofnę się jeszcze na chwilę, bo myślę, że jest jeszcze jedna ważna rzecz, którą chcę Wam pokazać. Chodzi o same ustawienia. Używaliśmy biblioteki Crawl4AI do crawlowania tych stron i pobrania treści. Jedna rzecz, której nie zdążyłem omówić, ale możemy to zrobić teraz, jest odnośnie konfiguracji samego tego filtra — **Pruning Filter**. Pamiętacie, mówiłem o tym, że on porównuje similarity score pomiędzy blokami tekstów. Jest jeszcze jedna rzecz, która jest istotna — możecie poziom tego similarity score ustawiać.

Tak jak teraz widzicie, to jest tak zwany **threshold**. To jest kosinus, który przyjmuje, dobrze już wiecie, od -1 do 1. Jeżeli pójdziecie w górę do jedynki, to będzie odrzucał wszystko, co nie jest identyczne z danym zapytaniem. W tej chwili mamy tutaj 0.40 — czyli dość nisko, powiedziałbym, że przepuszczamy sporo kontentu. Poczytajcie sobie jeszcze o ustawieniach. Tu też chodzi o ilość słów w blokach, żebyśmy przepuszczali również bloki, które zawierają jedno słowo. Dlaczego? Bo często na stronach internetowych mamy listy — w tych listach, jeżeli chodzi nawet o artykuły medyczne, są na przykład wylistowane składniki. Szkoda by było to zostawiać.

Przechodzę do dzisiejszej lekcji. Nie przejmujcie się tym, jeżeli ta funkcja czy jakikolwiek inny sposób przepuści Wam tak zwane szumy (a niektórzy to nazywają żwirem). Zobaczcie, jak wygląda. Ja już sobie przygotowałem treść pobraną z około pięciu stron za pomocą Crawl4AI. Oczywiście możecie się silić na czyszczenie tej treści już od razu przy pobieraniu, żeby ją wgrywać do bazy danych czy zapisywać do pliku tak, żeby ona była czysta i pozbawiona tych szumów czy też duplikatów, czyli rzeczy niezwiązanych z daną tematyką.

Tak jak tutaj — zaczynamy od duplikatu. Tu jest coś ucięte. Niestety będziecie się z tym spotykali bardzo dużo i zaraz powiem, dlaczego to nie jest takie najważniejsze. Bardzo dużo adresów URL, jakieś elementy menu się zdarzają. Nie przejmujcie się tym. To nie musi być idealne i nigdy nie będzie. W moim mniemaniu, jeżeli mamy bardzo dużo bloków tekstów, które już na pierwszy rzut oka opowiadają o danym temacie, wystarczy.

Mówiłem też w poprzednim filmie, że będziemy te treści między sobą oddzielać. Możecie zrobić sobie tak zwany separator. Ja tutaj, jak widzicie, to oznaczyłem — to są trzy myślniki. Chodzi o to, że jak będziemy ten plik później przetwarzać, to używając tego separatora, będziemy mogli tekst jeden po drugim odtworzyć.

Widzimy tutaj również „Czytaj także" — czyli jak strona ma sekcje polecane i też jest o zdrowiu, to przy tak małym similarity score, tym thresholdzie (tym progu naszym ustawionym), będziemy też pobierać części leadów innych artykułów. Jest tego sporo.

Co trzeba zrobić z takim blokiem tekstów, które nie nadają się absolutnie do użycia do stworzenia naszego grafu wiedzy? Musimy to wyczyścić. Ja już to robiłem wiele razy, więc podpowiem Wam. Stworzymy razem od początku skrypt, który to zrobi.

Pobrana przez nas treść może być zduplikowana. Tak jak będziecie mieli to w plikach Markdown, które są do każdej lekcji. Jest pełna zakłóceń, tych szumów. Może też zawierać szczątki HTML lub innego kodu i nie być związana z tematem.

Naszym zadaniem dzisiejszym na tej lekcji (i Waszym też mam nadzieję w domu) będzie stworzenie skryptu, który za pomocą embeddingów — pierwszy raz będziemy robić embeddingi sami — porówna bloki. Zobaczcie, wykorzystujemy zupełnie inne technologie. Embeddingi wysyłamy też do modeli, ale do modeli wektoryzacyjnych, embeddingowych — zupełnie innych niż modele językowe. Zaraz to też zrobimy. I usunie niepotrzebne bloki.

To jest mój autorski pomysł, pewnie ktoś inny też to robi. Chodzi o to, żebyśmy mniej więcej to co robi funkcja w Crawl4AI, tylko mieli na tym już dużo większą kontrolę, żebyśmy wykorzystali to w naszym skrypcie. Naszym zadaniem jest zamiana tego szumu, tego chaosu, który tu jest, w bloki oddzielone, które będą się różnić między sobą treścią (bo to też jest ważne, zaraz do tego dojdziemy) i będą oczyszczone — będą się nadawały do dalszej obróbki, czyli do generowania grafów wiedzy.

**Od czego zaczynamy?**

Zaczynamy od tego, że udajemy się do wybranego przez Was czatu, w którym wypiszemy zadanie.

Ważne jest też, żebyśmy używając tak dużej ilości tekstów… to też jest input. Jeżeli oglądaliście pierwszy odcinek, wiecie, że ten pseudo-RAG, który robimy, to też jest część promptu i to wszystko będzie wysyłane do LLM-ów.

Jeżeli będziecie produkować takich artykułów 100, 200, 1000 dziennie, to ta różnica w tych tokenach — jeżeli będziecie przesyłać 5 bloków tekstów z 5 różnych stron, ale to będzie o tym samym, mimo że jest inaczej napisane — nie ma sensu. To jest zduplikowana treść tylko w inny sposób. Nie da się tego dostrzec gołym okiem — to jest ta sama treść tylko przepisana przez kogoś innego. Szkoda, to są bardzo duże pieniądze. Zajmujemy też na długo model.

Więc to czyszczenie to jest nie tylko czyszczenie śmieci, tych rzeczy, które nie są potrzebne w tych tekstach, ale też porównamy między sobą wszystkie te strony, bloki tekstów i zobaczymy, jak można wykorzystać wektoryzację do tego, żeby takich bloków się pozbywać. Pamiętacie, że był hałas przed — zobaczymy na koniec filmu, co uda nam się zrobić.

Zaczynam pisać prompt, zaraz wam go przeczytam. Czytam:

> „Napisz skrypt w Pythonie, w środowisku Google Colab, który:
> 1. Wczyta bloki tekstu z pliku (podaję nazwę pliku, który wgram do Colaba), oddzielone separatorem `---`.
> 2. Oczyści z elementów HTML (czyli z różnych śmieci), zostawiając zawartość treści linka.
> 3. Wykorzysta wektoryzację embeddingów OpenAI do porównania między sobą bloków tekstu.
> 4. Wskaże główne bloki oddzielone, które są do siebie zbyt podobne, oraz w ramach każdego z tych bloków usunie paragrafy, pełne linie itp., które mają similarity score niższy niż 0.3.
> 5. Zapisz, wyświetl oczyszczone bloki do pliku.
> 6. Dodaj konfigurację słowa kluczowego oraz thresholdów (tych progów similarity)."

Wysyłamy. Teraz dzieje się magia.

W tym czasie, kiedy Claude nam to tworzy, pokażę Wam, jak przesłać plik. Jest bardzo proste — wchodzimy w ikonkę folderu, tutaj możemy sobie wgrać plik. Ja już go sobie przygotowałem w naszym „kortyzolowym" pipeline — to jest ten content nieoczyszczony, który wam pokazywałem na samym początku. Mamy go wgranego. Ja podałem nazwę tego pliku — prawdopodobnie będziemy musieli jeszcze się odnieść do całej ścieżki, zobaczymy, jak on to zrobi.

Wracamy do Clouda. Na bank będzie potrzebne nam wczytanie klucza. OpenAI mamy. Nie chciałem robić Gemini, żeby znowu nie musieć kopiować kolejnego klucza. Tak naprawdę modele embeddingowe bardzo dobrze — czy w OpenAI, czy w Gemini — się sprawują. Nie sprawdzałem tych z Clouda — nie ma. W tej chwili dla takiego zadania nie ma żadnego znaczenia. Wykorzystajmy już to, co mamy. Jeszcze raz upewniam się, że został wczytany ten klucz.

Dodamy sobie sekcję kolejną naszą — oczywiście nazwę ją sami. Teraz mamy „Oczyszczenie kontentu" i czekamy na to, co nam zaproponuje Claude. Nazwa: **Content Similarity Cleaner** — bardzo ładna nazwa. Opisał nam tutaj dokładnie, o co chodzi. Mamy konfigurację: keyword, threshold między blokami, paragraf z naszym keywordem, nazwa pliku wchodzącego i model. Zobaczymy, jak to się sprawdzi.

Oczywiście zaraz musimy też się przyjrzeć, gdzie zdefiniowany jest ten klucz nasz. To są te ustawienia, o których mówiłem. Dodał minimalny rozmiar paragrafów w znakach do analizy. Bardzo dobrze — nie chcemy analizować każdego pojedynczego słowa. API key tutaj jest — `config API key`. Musimy to podmienić dokładnie z tej nazwy, jaką mamy w konfiguracji. Oczywiście jeżeli będziemy zaraz zmieniać ten skrypt i coś nie będzie działać, to wgramy od razu tą nazwę, poprosimy ChatGPT albo Clouda, żeby używał już tej nazwy.

Podmieniamy sobie ten nasz API key. Zobaczymy, co nam tu wyszło. O, widzicie — to jest konfiguracja, także można to jeszcze wczytywać. To nie to. Nie sprecyzowałem znowu tego. Cloud na nowym wątku stworzył możliwość konfiguracji. To będzie bardzo upierdliwe. Zaraz to pewnie zmienimy, chyba że zadziała nam skrypt i więcej do niego nie wrócimy. Ale tak, to muszę skopiować cały klucz.

Zobaczmy, co się tu dzieje w logach. Trwało 40 sekund. Już wiemy, że zapisał nam plik. Ale sobie przyjrzymy się, jak to weszło. Podsumowanie: bloków wejściowych — 8, par zbyt podobnych bloków — 2, widzicie, znalazł nam. Wyczyszczone bloki: blok pierwszy, blok drugi, pusty blok, blok trzeci. Wszystko oczywiście w jednej linii. Możemy na tym popracować. Przyjrzymy się, jak wygląda ten nasz plik wyjściowy.

Zobaczcie, co się stało. Mamy wyczyszczone bloki, mamy plik i wszystko jest w jednej linijce. Ja bym to chyba zapisał i skopiował, i pokazał znowu do Clouda. To nie do końca nam o to chodziło. Musimy wskazać teraz wszystko, co nam się tu nie podoba. Ale dobra, najpierw ja mu to napiszę.

Musimy też pokazać ten output z tego skryptu. Pamiętajmy też o tym kluczu:

> „1. OpenAI API key znajduje się w zmiennej. Nie muszę więcej podmieniać tej zmiennej — już więcej nie będziemy musieli do tego wracać.
> 2. Czy puste bloki to te usunięte?
> 3. Zachowaj oryginalną konstrukcję bloków z przeniesieniami do nowej linii.
> 4. Nie koduj — odpowiedz najpierw na pytanie."

Cloud, wspominałem to w którymś filmie, jest nadgorliwy. Zamiast odpowiedzieć na pytanie, zaczyna kodować. Później od tego pytania zależy, co Wy chcecie. Poprosicie go jeszcze raz, trzeba będzie wszystko przepisywać.

API key podmienię. Puste bloki: „Niepuste bloki to nie są usunięte bloki w obecnej logice". OK, czyli on dobrze to zrobił, tylko nie zrozumiał, że w ogóle chcemy się pozbyć bloków z tej tablicy oddzielonej myślnikami. Czytam: „Jeżeli chcesz, mogę dodać opcję faktycznego usuwania duplikatów bloków". Dobrze. Odpowiem mu teraz na pytanie, które on mi zadał odnośnie całego skryptu:

> „Usuwać paragrafy. Zachować konstrukcję z oryginałów oprócz usuniętych."

Widzicie, wcześniej też już odnotował, że ten API key będzie już czytany ze zmiennej. I co jeszcze chciałem — usuwać z tablicy całkowicie podobne bloki, nie zostawiając pustych przestrzeni. I dodam mu, sprecyzuję, że tablica to bloki oddzielone tym naszym separatorem, czyli trzema myślnikami. Dla bezpieczeństwa możecie dać z pięć myślników albo dać jeszcze jakiś nawias kwadratowy.

Zobaczymy, co on nam teraz na to. Prawdopodobnie zacznie nam kodować. Jeżeli korzystacie z Clouda, to wszystkie artefakty (czyli wszystkie te skrypty, które on tworzy i różne wersje) są po kliknięciu w tą ikonkę w prawym górnym rogu. Teraz poprawi skrypt.

To nie jest prosty skrypt. Muszę Wam powiedzieć, że dojście do takiego momentu, w którym naprawdę będziemy zadowoleni, zajmuje trochę czasu. Natomiast moim zdaniem osobiście warto się tym pobawić, żebyście widzieli, z czym czasami trzeba się zmierzyć. Jeżeli nie, to czy na kohorcie, czy w zajęciach grupowych dostarczę Wam swoje rozwiązanie gotowe, ale wolałbym tego nie robić jeszcze na tym etapie, żebyście nie chodzili drogą na skróty.

**20 minut później.**

Słuchajcie, tego można było się spodziewać. Trochę musiałem powalczyć tutaj z tym skryptem. Wy też pewnie będziecie musieli, albo nie, bo przy tej lekcji dostanie się gotowe rozwiązanie.

Co robiłem? Cały czas nie mogłem się dogadać z Cloudem, który mi nie do końca realizował to, co ja chciałem, a jeżeli to realizował, to wymyślał jeszcze jakieś dodatkowe rzeczy. Później zacząłem pracować na zasadzie pokazania mu dokładnie jeszcze raz, jaki był output, jakie były zanieczyszczenia, jaki był jego output. Napisałem, że to nie dokładnie o to mi chodziło, że to zupełnie inaczej powinno wyglądać. On wtedy zrozumiał, zaczął przebudowywać ten skrypt. Po paru takich iteracjach udało się to zrobić.

Ten skrypt pokażę Wam — ma też dość dużo logów. Będzie widać po prostu, co zostało wyczyszczone, jak zostało wyczyszczone. Pokażę Wam finalny skrypt, finalny output, bloki tekstów. Tu są nasze ustawienia. Jak wiadomo, było 8 bloków. Tutaj widać, jak zamienione embeddingi porównywał między sobą.

Fajnie jest, jak prosicie przy Vibe Codingu o generowanie dużej ilości logów czy debugging — czyli tak zwane pokazywanie wszystkich możliwych rzeczy, żebyście w logach widzieli, co się dzieje.

Wokół wyjściowych, zduplikowanych linii — tu wszystko mamy w raportach. **Redukcja o 43%.** To jest bardzo dużo. I to też, tak jak powiedziałem, my ten blok, te bloki kontentu będziemy wrzucać na szczęście chyba tylko raz albo dwa razy do LLM-a, po to, żeby wyciągnąć tą informację. Nie będziemy musieli tego ponawiać na każdym kroku, ale 43% to daje nam ogromne oszczędności wszystkiego.

Ale przede wszystkim też to, że nie każdy model językowy czy reasoningowy ma takie duże okno dialogowe. Czyli nie każdy przyjmie takiej ilości tekstu. Jeżeli to jest duża fraza, tego kontentu jest dużo, to będziemy mieli problem.

Jak to wygląda w praktyce? Finalny output. Zacznę od góry. Widzimy, że to coś zostało ucięte. Nie do końca jestem pewien, na którym etapie to zostało ucięte — czy na etapie scrapingu, w Crawl4AI (bo też się zdarzają takie rzeczy), czy na innym etapie. Nie przejmujemy się tym absolutnie, bo jeszcze raz — my tej treści nie będziemy używać, a broń Boże nie chcemy też, żeby dostarczać tę treść jako RAG, żeby nie były kopiowane jeden do jednego niektóre zdania.

Jeżeli przyjrzymy się dalej, to ten content wygląda całkiem nieźle i ma już tą treść, która nas interesuje odnośnie samego kortyzolu. Wiadomo, że też ja skrapowałem dużo mniejszą ilość stron — tam chyba było 5. Po wyczyszczeniu zostały nam chyba 4. Tak naprawdę istotne bloki — 2 albo 3.

I to by było na tyle na tym etapie. Jeszcze raz wrócę do tego, dlaczego to robimy. Dlatego, żebyśmy budując graf wiedzy, w tym grafie nie dostali żadnych śmieci czy żadnych zakłóceń, bo to wpływa na jakość naszego kontentu końcowego na tym całym wodospadzie.

Ale jeszcze zanim to nastąpi, poproszę Clouda, żeby podsumował, co robi ten skrypt, i wkleję to do notatnika do Markdowna z tej lekcji. Dopiszę to tam, żebyście wiedzieli i żebyście też mogli wykorzystać, żebyście skorzystali z tego, na czym ja się teraz namęczyłem. Może być może z gotowca, ale jeżeli będziecie z niego korzystać, to żebyście dobrze wiedzieli, czy go zmieniać, przekształcać — żebyście dobrze wiedzieli dokładnie, co robi ten skrypt.

> „Napiszmy README do tego skryptu — co robi, jakie technologie wykorzystuje i co w nim ostatecznie zastosowaliśmy. Oczywiście po polsku."

Ten plik za chwilę już od razu umieszczam tutaj w naszym dokumencie dotyczącym tej danej lekcji. Przypominam — każda lekcja ma moje notatki większe, mniejsze. Tutaj też będziecie mogli sobie zajrzeć do spisu treści. Te pliki są wgrane w folderze „Dokumenty" — lekcja po lekcji. Będę się starał update'ować to też i zrobić tak, żeby jakiekolwiek informacje, które jeszcze wynikły z nagrywek, były w tych plikach.

My jesteśmy przy czyszczeniu pobranej treści i tutaj wstawię Wam to, co mi napisze Claude, a natomiast sam skrypt będzie do pobrania w dziale „Skrypty". Kopiuję zawartość. I tu już macie wszystko.

Możecie to też wziąć, wykorzystać. Jeżeli będziecie się bawić tak, jak ja robiłem od początku, to możecie ten README ze wszystkimi technologiami, wszystko, co zrobiliśmy, wykorzystać, wrócić do Clouda czy do ChatGPT, żeby zobaczyć, jak uda Wam się stworzyć taki skrypt, który będzie czyścił te dane. Trzymam kciuki.

---

**Poprzednia strona:** 2.3 Ekstrakcja treści
**Następna strona:** 2.5 Ekstrakcja faktów
