export interface FanoutIntentsUserArgs {
  keyword: string;
  language: string;
  maxAreas: number;
}

export interface FanoutClassifyUserArgs {
  keyword: string;
  intentsJson: string;
}

export interface FanoutPaaUserArgs {
  keyword: string;
  areasJson: string;
  paaQuestions: string[];
}

const intentsSystem = (maxAreas: number) => `Jesteś ekspertem semantyki w języku polskim. Rozbij podane zapytanie na podtematy według zdefiniowanych intencji użytkownika.

# Algorytm

## Krok 1: Normalizacja
- Zapisz zapytanie
- Ustal główną encję (mainEntity)
- Ustal kategorię tematyczną (category)
- Oceń, czy temat należy do YMYL (Your Money, Your Life)

## Krok 2: Intencje
Rozważ KAŻDĄ z poniższych intencji — wybierz tylko te pasujące do głównego słowa kluczowego:
- Definicyjna - czym jest, co to znaczy
- Problemowa - objawy, przyczyny, skutki problemu
- Instrukcyjna - jak zrobić, jak osiągnąć
- Decyzyjna - który wybrać, porównanie opcji
- Diagnostyczna - jak sprawdzić, jak zmierzyć
- Porównawcza - różnice, porównania, plusy i minusy

## Krok 3: Obszary (areas)
Dla każdej wybranej intencji wypisz obszary tematyczne, które:
- mają własną logikę
- są SILNIE POWIĄZANE z głównym słowem kluczowym
- nie są wypełnieniem na siłę
- maks. ${maxAreas} obszarów na intencję

Każdy obszar ma:
- id w formacie A1, A2, ... (numeracja globalna, narastająca, unikalna w całej odpowiedzi)
- topic (2-4 słowa opisujące obszar)
- question (jedno konkretne pytanie pomocnicze)
- ymyl: true tylko gdy błędna informacja może zaszkodzić zdrowiu, finansom lub mieć konsekwencje prawne; false dla zwykłych porad domowych, hobby, rozrywki

# Zasady
- Zwróć poprawny JSON pasujący do dostarczonego schematu.
- Nie używaj na siłę wszystkich 6 intencji — tylko te, które realnie pasują.
- Numeracja id obszarów MUSI być globalnie unikalna (A1, A2, A3 ... niezależnie od intencji).`;

const intentsUser = (args: FanoutIntentsUserArgs): string =>
  `Słowo kluczowe: "${args.keyword}"
Język outputu: ${args.language}
Maksymalna liczba obszarów na intencję: ${args.maxAreas}`;

const classifySystem = `Jesteś ekspertem semantyki w języku polskim. Sklasyfikuj każdy obszar/temat jako MICRO (sekcja w artykule głównym) lub MACRO (osobny artykuł).

# Test samodzielności
Dla każdego obszaru/tematu zadaj pytanie:
"Czy użytkownik mógłby wpisać to jako OSOBNE zapytanie i oczekiwać OSOBNEJ, pełnej odpowiedzi?"
- TAK → MACRO (osobny artykuł, evergreen)
- NIE → MICRO (sekcja w artykule głównym)

# Zasady
- MICRO: zachowaj topic i question 1:1 (puste evergreenTopic / evergreenQuestion).
- MACRO: usuń kontekst specyficzny z zapytania głównego (np. "po 40tce", "dla kobiet", "w ciąży"); wypełnij evergreenTopic i evergreenQuestion ogólnymi wersjami.
- Wybierz dokładnie JEDNĄ intencję jako dominantIntent — to ta, która najlepiej odpowiada na główne zapytanie i będzie strukturą artykułu (BLUF). Nazwa MUSI być jedną z wartości: Definicyjna, Problemowa, Instrukcyjna, Decyzyjna, Diagnostyczna, Porównawcza.
- Wynik to klasyfikacja obszarów według intencji, NIE struktura artykułu.
- Output zawiera classifications[] (po jednym wpisie per areaId z inputu) oraz dominantIntent.`;

const classifyUser = (args: FanoutClassifyUserArgs): string =>
  `Główne zapytanie: "${args.keyword}"

Intencje i obszary do sklasyfikowania:
${args.intentsJson}`;

const paaSystem = `Jesteś ekspertem semantyki w języku polskim. Przypisz pytania PAA (People Also Ask) do odpowiednich obszarów tematycznych.

# Zasady
1. Dla każdego pytania PAA znajdź NAJBARDZIEJ pasujący obszar (po areaId).
2. Pytanie PAA przypisuj TYLKO jeśli jest SPECYFICZNE dla danego obszaru.
3. Ogólne pytania (pasujące do całego zapytania, ale nie do konkretnego obszaru) → unmatched.
4. Jedno pytanie PAA może trafić do TYLKO jednego areaId (lub do unmatched).
5. Używaj DOKŁADNYCH areaId z listy obszarów (np. A1, A2, ...). Nie wymyślaj nowych.
6. Nie modyfikuj treści pytań PAA — kopiuj 1:1.

# Output
{
  "assignments": [{ "areaId": "A1", "question": "..." }, ...],
  "unmatched": ["pytania niepasujące do żadnego obszaru"]
}`;

const paaUser = (args: FanoutPaaUserArgs): string =>
  `Główne zapytanie: "${args.keyword}"

Obszary (areaId + topic + question):
${args.areasJson}

Pytania PAA do przypisania:
${args.paaQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;

export const queryFanoutPrompt = {
  intents: { system: intentsSystem, user: intentsUser },
  classify: { system: classifySystem, user: classifyUser },
  paa: { system: paaSystem, user: paaUser },
};
