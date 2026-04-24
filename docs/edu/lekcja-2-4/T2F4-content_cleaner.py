# ==============================================================================
# Content Deduplication Pre-processor — File Version (based on Colab Clean v4)
#  • Wczytuje bloki z pliku (separator ---)
#  • Czyści HTML, blacklista, deduplikacja linii
#  • Filtruje paragrafy po similarity do keyword
#  • Length protection - długie teksty chronione przed usunięciem
#  • Cosine similarity na OpenAI embeddings (text-embedding-3-small)
# ==============================================================================

# !pip install openai beautifulsoup4 numpy pandas scikit-learn tqdm -q

import os
import re
import time
import numpy as np
import pandas as pd
from bs4 import BeautifulSoup
from openai import OpenAI
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm
from typing import List, Tuple

# ======================
# KONFIGURACJA
# ======================

CONFIG = {
    # Pliki
    "input_file": "kortyzol_content.txt",
    "output_file": "kortyzol_content_cleaned.txt",

    # Słowo kluczowe do filtrowania paragrafów
    "keyword": "jak obniżyć kortyzol po 40tce",

    # Model embeddings
    "embedding_model": "text-embedding-3-small",

    # Threshold podobieństwa MIĘDZY blokami (powyżej = duplikat)
    "block_similarity_threshold": 0.85,

    # Threshold podobieństwa paragrafów DO KEYWORD (poniżej = usunięcie)
    "paragraph_keyword_threshold": 0.4,

    # Length protection - różnica długości chroniąca przed usunięciem
    "length_difference_threshold": 0.30,  # 30%

    # Limity
    "target_char_limit": 50_000,  # Max znaków w output
    "min_paragraph_length": 60,   # Min długość paragrafu do analizy

    # Wagi dla combined score
    "similarity_weight": 0.7,
    "length_weight": 0.3,

    # Deduplikacja paragrafów między blokami
    "deduplicate_paragraphs_across_blocks": True,
}

# Blacklista fraz - paragrafy zawierające te frazy zostaną usunięte bezwarunkowo
BLACKLIST_PHRASES = [
    # Nawigacja / UI
    "koszyk", "menu:", "filters", "loading", "show results", "czytaj dalej",
    "zobacz więcej", "pokaż więcej", "rozwiń", "zwiń", "wróć", "przejdź do",

    # E-commerce
    "dodaj do koszyka", "kup teraz", "zamów", "cena:", "zł z kodem",
    "rabat", "promocja", "darmowa dostawa", "bezpłatna dostawa",

    # Cookies / RODO
    "cookies", "ciasteczka", "polityka prywatności", "rodo", "zgoda na",
    "akceptuję", "ustawienia cookie", "pliki cookie",

    # Formularze / Logowanie
    "zaloguj", "zarejestruj", "newsletter", "zapisz się", "subskrybuj",
    "podaj email", "podaj e-mail", "wyślij formularz",

    # Kontakt / Social
    "zadzwoń", "infolinia", "kontakt", "napisz do nas", "czat",
    "facebook", "instagram", "twitter", "udostępnij", "polub",

    # Aplikacje
    "zainstaluj aplikację", "pobierz aplikację", "app store", "google play",

    # Inne śmieci
    "something went wrong", "brak produktów", "wyszukiwarka",
    "kontynuuj zakupy", "potwierdź płatność", "blik",
]

def now():
    return time.strftime("%H:%M:%S")

# ======================
# Funkcje pomocnicze - czyszczenie
# ======================

def clean_html(text: str) -> str:
    """Czyści HTML, zachowuje treść linków i strukturę."""
    if not text or not text.strip():
        return ""

    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    soup = BeautifulSoup(text, 'html.parser')

    for a_tag in soup.find_all('a'):
        a_tag.replace_with(a_tag.get_text())

    clean_text = soup.get_text()
    clean_text = re.sub(r'https?://\S+', '', clean_text)
    clean_text = re.sub(r'www\.\S+', '', clean_text)
    clean_text = re.sub(r'[^\S\n]+', ' ', clean_text)
    clean_text = re.sub(r' +\n', '\n', clean_text)
    clean_text = re.sub(r'\n +', '\n', clean_text)
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text)

    return clean_text.strip()


def remove_duplicate_lines(text: str) -> str:
    """Usuwa zduplikowane linie, zachowuje puste dla struktury."""
    lines = text.split('\n')
    seen = set()
    result = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append(line)
            continue
        if stripped not in seen:
            seen.add(stripped)
            result.append(line)

    return '\n'.join(result)


def contains_blacklisted_phrase(text: str) -> bool:
    """Sprawdza czy tekst zawiera frazę z blacklisty."""
    text_lower = text.lower()
    return any(phrase.lower() in text_lower for phrase in BLACKLIST_PHRASES)


def remove_blacklisted_paragraphs(text: str) -> Tuple[str, int]:
    """Usuwa paragrafy z blacklisty. Zwraca (tekst, liczba_usuniętych)."""
    paragraphs = re.split(r'\n\n+', text)
    removed_count = 0
    kept = []

    for para in paragraphs:
        para_stripped = para.strip()
        if len(para_stripped) < CONFIG['min_paragraph_length']:
            kept.append(para)
            continue
        if contains_blacklisted_phrase(para_stripped):
            removed_count += 1
        else:
            kept.append(para)

    return '\n\n'.join(kept), removed_count


# ======================
# Embeddings (OpenAI)
# ======================

def get_openai_client():
    """Inicjalizuje klienta OpenAI."""
    return OpenAI(api_key=API_OPENAI_KEY)


def generate_embeddings(client, texts: List[str]) -> np.ndarray:
    """Generuje embeddingi dla listy tekstów."""
    if not texts:
        return np.array([])

    valid_texts = [t if t.strip() else " " for t in texts]

    print(now(), f"Generating embeddings for {len(valid_texts)} texts...")
    resp = client.embeddings.create(
        input=valid_texts,
        model=CONFIG['embedding_model']
    )
    emb = np.array([item.embedding for item in resp.data], dtype=float)
    print(now(), f"Embeddings OK: {emb.shape}")
    return emb


# ======================
# Funkcje length protection (z Twojego skryptu)
# ======================

def calculate_length_difference_ratio(len1: int, len2: int) -> float:
    """Oblicza stosunek różnicy długości do większej długości."""
    max_len = max(len1, len2)
    if max_len == 0:
        return 0
    return (max_len - min(len1, len2)) / max_len


def should_keep_despite_similarity(current_len: int, existing_len: int, similarity: float) -> bool:
    """
    Decyduje czy zachować dokument mimo wysokiego podobieństwa,
    jeśli różnica długości jest znacząca.
    """
    length_diff_ratio = calculate_length_difference_ratio(current_len, existing_len)

    # Jeśli różnica długości > 30% i podobieństwo < 0.95, zachowaj
    if length_diff_ratio > CONFIG['length_difference_threshold'] and similarity < 0.95:
        return True

    # Dla bardzo wysokiego podobieństwa (>0.95), wymagamy większej różnicy długości
    if similarity >= 0.95 and length_diff_ratio > 0.5:
        return True

    return False


# ======================
# Deduplikacja bloków z length protection
# ======================

def find_diverse_blocks_with_stats(blocks: List[str], embeddings: np.ndarray) -> List[dict]:
    """
    Deduplikacja bloków z ochroną długości.
    Sortuje po długości (najdłuższe pierwsze), zachowuje unikalne.
    """
    if not blocks or embeddings.shape[0] == 0:
        return []

    # Przygotuj DataFrame
    df = pd.DataFrame({
        'idx': range(len(blocks)),
        'content': blocks,
        'embedding': list(embeddings),
        'length': [len(b) for b in blocks]
    })
    df = df.sort_values('length', ascending=False).reset_index(drop=True)

    results = []
    kept_docs = []
    total_chars = 0

    print(now(), "Selecting blocks with length protection...")

    for _, row in df.iterrows():
        doc_idx = row['idx']
        doc_len = int(row['length'])
        doc_emb = row['embedding']
        doc_snip = (row['content'] or "").replace("\n", " ")[:80] + "..."

        entry = {
            "OrigIdx": doc_idx,
            "Status": "",
            "Length": doc_len,
            "Similarity": 0.0,
            "LengthDiff": 0.0,
            "Reason": "",
            "Snippet": doc_snip,
            "Content": row['content'],
        }

        if not kept_docs:
            # Pierwszy (najdłuższy) dokument zawsze zachowujemy
            kept_docs.append({'idx': doc_idx, 'embedding': doc_emb, 'length': doc_len})
            total_chars += doc_len
            entry.update({"Status": "Kept", "Reason": "First (longest) block"})
        else:
            # Sprawdź podobieństwo do zachowanych
            kept_embeddings = np.asarray([d['embedding'] for d in kept_docs])
            similarities = cosine_similarity(
                np.asarray(doc_emb).reshape(1, -1),
                kept_embeddings
            )[0]

            max_sim_idx = np.argmax(similarities)
            max_sim = float(similarities[max_sim_idx])
            most_similar_doc = kept_docs[max_sim_idx]

            length_diff = calculate_length_difference_ratio(doc_len, most_similar_doc['length'])

            entry["Similarity"] = round(max_sim, 4)
            entry["LengthDiff"] = round(length_diff, 3)

            # Logika decyzyjna
            if max_sim > CONFIG['block_similarity_threshold']:
                if should_keep_despite_similarity(doc_len, most_similar_doc['length'], max_sim):
                    if total_chars < CONFIG['target_char_limit']:
                        kept_docs.append({'idx': doc_idx, 'embedding': doc_emb, 'length': doc_len})
                        total_chars += doc_len
                        entry.update({
                            "Status": "Kept",
                            "Reason": f"Length protection (diff={length_diff:.1%})"
                        })
                    else:
                        entry.update({
                            "Status": "Discarded",
                            "Reason": "Char limit (protected but over)"
                        })
                else:
                    entry.update({
                        "Status": "Discarded",
                        "Reason": f"Too similar (sim={max_sim:.3f})"
                    })
            else:
                if total_chars < CONFIG['target_char_limit']:
                    kept_docs.append({'idx': doc_idx, 'embedding': doc_emb, 'length': doc_len})
                    total_chars += doc_len
                    entry.update({"Status": "Kept", "Reason": "Unique enough"})
                else:
                    entry.update({"Status": "Discarded", "Reason": "Char limit reached"})

        results.append(entry)

    return results


# ======================
# Filtrowanie paragrafów po keyword
# ======================

def filter_paragraphs_by_keyword(
    client,
    text: str,
    keyword_embedding: np.ndarray
) -> Tuple[str, List[Tuple[str, float]]]:
    """
    Filtruje paragrafy na podstawie podobieństwa do keyword.
    Zwraca (oczyszczony_tekst, lista_usuniętych_z_score).
    """
    paragraphs = re.split(r'\n\n+', text)
    valid_paragraphs = [p.strip() for p in paragraphs if len(p.strip()) >= CONFIG['min_paragraph_length']]

    if not valid_paragraphs:
        return text, []

    # Embeddingi paragrafów
    para_embeddings = generate_embeddings(client, valid_paragraphs)

    if para_embeddings.size == 0:
        return text, []

    # Similarity do keyword
    similarities = cosine_similarity(para_embeddings, keyword_embedding.reshape(1, -1)).flatten()

    # Filtruj
    to_remove = []
    removed_with_scores = []

    for para, sim in zip(valid_paragraphs, similarities):
        if sim < CONFIG['paragraph_keyword_threshold']:
            to_remove.append(para)
            removed_with_scores.append((para, sim))

    # Usuń z tekstu
    result = text
    for para in to_remove:
        escaped = re.escape(para)
        patterns = [
            (r'\n\n' + escaped + r'\n\n', '\n\n'),
            (r'\n\n' + escaped + r'\n', '\n\n'),
            (r'\n' + escaped + r'\n\n', '\n\n'),
            (r'\n' + escaped + r'\n', '\n'),
            (r'^' + escaped + r'\n', ''),
            (r'\n' + escaped + r'$', ''),
            (escaped, ''),
        ]
        for pattern, replacement in patterns:
            new_result, count = re.subn(pattern, replacement, result, count=1)
            if count > 0:
                result = new_result
                break

    result = re.sub(r'\n{3,}', '\n\n', result).strip()
    return result, removed_with_scores


def deduplicate_paragraphs_across_blocks(blocks: List[str]) -> Tuple[List[str], int]:
    """Usuwa zduplikowane paragrafy między blokami."""
    seen = set()
    result_blocks = []
    total_removed = 0

    for block in blocks:
        paragraphs = re.split(r'\n\n+', block)
        kept = []

        for para in paragraphs:
            para_stripped = para.strip()
            if len(para_stripped) < CONFIG['min_paragraph_length']:
                kept.append(para)
                continue

            normalized = re.sub(r'\s+', ' ', para_stripped.lower())

            if normalized in seen:
                total_removed += 1
            else:
                seen.add(normalized)
                kept.append(para)

        result_blocks.append('\n\n'.join(kept))

    return result_blocks, total_removed


# ======================
# Raport
# ======================

def print_summary_report(results: List[dict], stats: dict):
    """Wyświetla podsumowanie deduplikacji."""
    if not results:
        print("\n[REPORT] Empty results.")
        return

    df = pd.DataFrame(results)
    kept_df = df[df["Status"] == "Kept"]
    disc_df = df[df["Status"] == "Discarded"]

    initial_chars = int(df["Length"].sum())
    final_chars = int(kept_df["Length"].sum())
    red = (1 - final_chars / initial_chars) * 100 if initial_chars > 0 else 0.0

    protected = kept_df[kept_df["Reason"].str.contains("Length protection", na=False)]

    print("\n" + "=" * 60)
    print("📊 RAPORT DEDUPLIKACJI")
    print("=" * 60)
    print(f"Bloków wejściowych:        {stats.get('input_blocks', len(df))}")
    print(f"Zduplikowanych linii:      {stats.get('duplicate_lines', 0)}")
    print(f"Paragrafów (blacklista):   {stats.get('blacklist_removed', 0)}")
    print(f"Paragrafów (similarity):   {stats.get('similarity_removed', 0)}")
    print(f"Paragrafów (cross-block):  {stats.get('cross_block_removed', 0)}")
    print("-" * 60)
    print(f"Bloków zachowanych:        {len(kept_df)}")
    print(f"  - chronionych długością: {len(protected)}")
    print(f"Bloków odrzuconych:        {len(disc_df)}")
    print("-" * 60)
    print(f"Znaków początkowych:       {initial_chars:,}")
    print(f"Znaków końcowych:          {final_chars:,}")
    print(f"Redukcja:                  {red:.1f}%")
    print("=" * 60)

    # Tabela bloków
    print("\nSzczegóły bloków:")
    display_cols = ["OrigIdx", "Status", "Length", "Similarity", "LengthDiff", "Reason"]
    print(df[display_cols].to_string(index=False))
    print()


# ======================
# MAIN
# ======================

def load_blocks_from_file(filepath: str) -> List[str]:
    """Wczytuje bloki z pliku (separator ---)."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        from google.colab import files
        uploaded = files.upload()
        filename = list(uploaded.keys())[0]
        content = uploaded[filename].decode('utf-8')

    blocks = re.split(r'\n*---\n*', content)
    blocks = [b.strip() for b in blocks if b.strip()]
    return blocks


def save_blocks_to_file(blocks: List[str], filepath: str):
    """Zapisuje bloki do pliku."""
    output = "\n\n---\n\n".join(blocks)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(output)


def main():
    print("=" * 60)
    print("Content Deduplication — File Version")
    print("WITH LENGTH PROTECTION + KEYWORD FILTERING")
    print("=" * 60)
    print(f"  Input file:              {CONFIG['input_file']}")
    print(f"  Output file:             {CONFIG['output_file']}")
    print(f"  Keyword:                 {CONFIG['keyword']}")
    print(f"  Block similarity:        {CONFIG['block_similarity_threshold']}")
    print(f"  Paragraph threshold:     {CONFIG['paragraph_keyword_threshold']}")
    print(f"  Length protection:       {CONFIG['length_difference_threshold']:.0%}")
    print("=" * 60)

    stats = {}

    # 1. Wczytaj bloki
    print(f"\n{now()} 📂 Loading blocks...")
    raw_blocks = load_blocks_from_file(CONFIG['input_file'])
    stats['input_blocks'] = len(raw_blocks)
    print(f"{now()} Loaded {len(raw_blocks)} blocks")

    # 2. Oczyść HTML
    print(f"\n{now()} 🧹 Cleaning HTML...")
    blocks = [clean_html(b) for b in raw_blocks]

    # 3. Usuń zduplikowane linie
    print(f"\n{now()} 🔄 Removing duplicate lines...")
    lines_before = sum(len(b.split('\n')) for b in blocks)
    blocks = [remove_duplicate_lines(b) for b in blocks]
    lines_after = sum(len(b.split('\n')) for b in blocks)
    stats['duplicate_lines'] = lines_before - lines_after
    print(f"{now()} Removed {stats['duplicate_lines']} duplicate lines")

    # 4. Usuń paragrafy z blacklisty
    print(f"\n{now()} 🚫 Removing blacklisted paragraphs...")
    blacklist_total = 0
    for i, block in enumerate(blocks):
        blocks[i], removed = remove_blacklisted_paragraphs(block)
        blacklist_total += removed
    stats['blacklist_removed'] = blacklist_total
    print(f"{now()} Removed {blacklist_total} blacklisted paragraphs")

    # 5. Inicjalizuj OpenAI
    print(f"\n{now()} 🔑 Initializing OpenAI...")
    client = get_openai_client()

    # 6. Embedding keyword
    print(f"\n{now()} 🎯 Generating keyword embedding...")
    keyword_embedding = generate_embeddings(client, [CONFIG['keyword']])[0]

    # 7. Filtruj paragrafy po keyword similarity
    print(f"\n{now()} 📝 Filtering paragraphs by keyword similarity...")
    similarity_removed = 0
    for i, block in enumerate(tqdm(blocks, desc="Filtering")):
        blocks[i], removed = filter_paragraphs_by_keyword(client, block, keyword_embedding)
        similarity_removed += len(removed)
        if removed:
            print(f"\n   Block {i+1}: removed {len(removed)} paragraphs")
            for para, score in removed[:2]:
                print(f"      [{score:.3f}] {para[:60]}...")
    stats['similarity_removed'] = similarity_removed

    # Usuń puste bloki
    blocks = [b for b in blocks if b.strip()]

    # 8. Deduplikacja bloków z length protection
    print(f"\n{now()} 🔍 Deduplicating blocks with length protection...")
    block_embeddings = generate_embeddings(client, blocks)
    results = find_diverse_blocks_with_stats(blocks, block_embeddings)

    # Wyciągnij zachowane bloki (w oryginalnej kolejności)
    kept_indices = sorted([r['OrigIdx'] for r in results if r['Status'] == 'Kept'])
    final_blocks = [blocks[i] for i in kept_indices if i < len(blocks)]

    # 9. Deduplikacja paragrafów między blokami
    cross_block_removed = 0
    if CONFIG['deduplicate_paragraphs_across_blocks']:
        print(f"\n{now()} 🔀 Deduplicating paragraphs across blocks...")
        final_blocks, cross_block_removed = deduplicate_paragraphs_across_blocks(final_blocks)
        final_blocks = [b for b in final_blocks if b.strip()]
    stats['cross_block_removed'] = cross_block_removed

    # 10. Zapisz
    print(f"\n{now()} 💾 Saving to {CONFIG['output_file']}...")
    save_blocks_to_file(final_blocks, CONFIG['output_file'])

    # 11. Raport
    print_summary_report(results, stats)

    # 12. Wyświetl bloki
    print("\n" + "=" * 60)
    print("📄 OCZYSZCZONE BLOKI")
    print("=" * 60)
    for i, block in enumerate(final_blocks):
        print(f"\n{'─' * 60}")
        print(f"BLOK {i+1} ({len(block)} znaków)")
        print(f"{'─' * 60}")
        if len(block) > 600:
            print(block[:300])
            print("\n[...]\n")
            print(block[-300:])
        else:
            print(block)

    # Download w Colab
    try:
        from google.colab import files
        files.download(CONFIG['output_file'])
        print(f"\n✅ File {CONFIG['output_file']} ready for download!")
    except ImportError:
        pass

    print(f"\n{now()} --- DONE ---")
    return final_blocks


# ======================
# RUN
# ======================
if __name__ == "__main__":
    final_blocks = main()