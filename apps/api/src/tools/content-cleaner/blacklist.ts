export const BLACKLIST_PHRASES: readonly string[] = [
  // Nawigacja / UI
  "koszyk", "menu:", "filters", "loading", "show results", "czytaj dalej",
  "zobacz więcej", "pokaż więcej", "rozwiń", "zwiń", "wróć", "przejdź do",
  // E-commerce
  "dodaj do koszyka", "kup teraz", "zamów", "cena:", "zł z kodem",
  "rabat", "promocja", "darmowa dostawa", "bezpłatna dostawa",
  // Cookies / RODO
  "cookies", "ciasteczka", "polityka prywatności", "rodo", "zgoda na",
  "akceptuję", "ustawienia cookie", "pliki cookie",
  // Formularze / Logowanie
  "zaloguj", "zarejestruj", "newsletter", "zapisz się", "subskrybuj",
  "podaj email", "podaj e-mail", "wyślij formularz",
  // Kontakt / Social
  "zadzwoń", "infolinia", "kontakt", "napisz do nas", "czat",
  "facebook", "instagram", "twitter", "udostępnij", "polub",
  // Aplikacje
  "zainstaluj aplikację", "pobierz aplikację", "app store", "google play",
  // Inne śmieci
  "something went wrong", "brak produktów", "wyszukiwarka",
  "kontynuuj zakupy", "potwierdź płatność", "blik",
] as const;

export function containsBlacklistedPhrase(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const phrase of BLACKLIST_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

export function removeBlacklistedParagraphs(
  text: string,
  minLen: number,
): { text: string; removed: number } {
  if (!text) return { text: "", removed: 0 };

  const paragraphs = text.split(/\n{2,}/);
  const kept: string[] = [];
  let removed = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length < minLen) {
      kept.push(para);
      continue;
    }
    if (containsBlacklistedPhrase(trimmed)) {
      removed += 1;
    } else {
      kept.push(para);
    }
  }

  return { text: kept.join("\n\n"), removed };
}
