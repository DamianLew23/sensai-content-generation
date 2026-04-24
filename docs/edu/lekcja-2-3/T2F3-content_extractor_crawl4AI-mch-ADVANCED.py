"""
Content Scraper v1.0 - STANDALONE VERSION
=====================================================
Pobiera zawartość strony z podanego URL, ekstrahuje czysty tekst
(nagłówki, paragrafy, listy) i zapisuje do pliku.

Funkcje:
- Usuwanie śmieci (reklamy, menu, stopki, cookie banners)
- Ekstrakcja metadanych (title, meta description, H1)
- Ekstrakcja danych strukturalnych (JSON-LD/Schema.org)
- Obliczanie link density (wykrywanie menu/reklam)
- Zapis w formacie CSV-like oraz czystego tekstu
"""

import asyncio
import json
import gc
from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
import warnings
import logging

# Wyciszenie logów
logging.getLogger('playwright').setLevel(logging.ERROR)
logging.getLogger('asyncio').setLevel(logging.ERROR)
warnings.filterwarnings('ignore')

# ============================================================================
# KONFIGURACJA
# ============================================================================

URL = "https://www.adamed.expert/pacjent/zdrowie-psychiczne/kortyzol-hormon-stresu-jak-obnizyc-poziom-kortyzolu"

OUTPUT_FILE = "scraped_content.txt"      # Plik z czystym tekstem
OUTPUT_FILE_CSV = "scraped_content.csv"  # Plik w formacie CSV (do analizy)

PAGE_TIMEOUT = 60000  # 60 sekund timeout

# ============================================================================
# LOGIKA EKSTRAKCJI
# ============================================================================

def clean_generic_html(soup):
    """
    Usuwa śmieci z HTML: reklamy, menu, stopki, formularze, cookie banners.
    """
    # Tagi do całkowitego usunięcia
    blacklist = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'header', 'footer', 'nav',
        'aside', 'form', 'button', 'input', 'select', 'textarea'
    ]
    
    # Selektory CSS do usunięcia (klasy i ID typowe dla śmieci)
    bad_selectors = [
        '.cookie', '#cookie', '.consent', '.popup', '.modal', '.advert', '.ad-',
        '.sidebar', '.menu', '.navigation', '.social', '.share', '.comments',
        '.related', '.footer', '.header', '#nav', '.nav', '.newsletter',
        '.widget', '.banner', '.promo', '.advertisement', '.sponsored'
    ]

    for tag in blacklist:
        for n in soup.find_all(tag):
            n.decompose()
    
    for selector in bad_selectors:
        for n in soup.select(selector):
            n.decompose()
    
    return soup


def extract_content(html, url):
    """
    Główna funkcja ekstrakcji treści ze strony.
    Zwraca słownik z metadanymi i listą węzłów tekstowych.
    """
    soup = BeautifulSoup(html, 'html.parser')

    # === METADANE ===
    
    # Title
    title = soup.title.get_text(strip=True) if soup.title else ""
    
    # Meta description
    meta_desc = ""
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    if desc_tag:
        meta_desc = desc_tag.get('content', '')

    # H1
    h1 = soup.find('h1')
    h1_text = h1.get_text(strip=True) if h1 else ""

    # === DANE STRUKTURALNE (Schema.org / JSON-LD) ===
    structured_data = []
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            structured_data.append(json.loads(script.string))
        except:
            pass

    # === CZYSZCZENIE HTML ===
    soup = clean_generic_html(soup)
    
    # === EKSTRAKCJA WĘZŁÓW TEKSTOWYCH ===
    nodes = []
    id_counter = 1

    # Dodaj H1 jako pierwszy węzeł
    if h1_text:
        nodes.append({
            'id': id_counter,
            'tag': 'h1',
            'text': h1_text,
            'decision': 'KEEP',
            'notes': 'H1 - główny nagłówek',
            'link_density': 0.0
        })
        id_counter += 1

    # Szukamy tagów z treścią
    tags = soup.find_all(['h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li'])

    for tag in tags:
        text = tag.get_text(" ", strip=True)

        # Filtry jakościowe - pomijamy zbyt krótkie teksty
        if len(text) < 15:
            continue
        if tag.name == 'li' and len(text) < 25:
            continue  # Krótkie elementy list to często menu

        # Link density - stosunek tekstu w linkach do całego tekstu
        # Wysoka wartość = prawdopodobnie menu lub lista linków
        links_len = sum(len(a.get_text()) for a in tag.find_all('a'))
        total_len = len(text)
        link_density = links_len / total_len if total_len > 0 else 0

        # Decyzja: KEEP jeśli link_density <= 60%
        decision = 'KEEP' if link_density <= 0.6 else 'SKIP'
        
        notes = ""
        if tag.name.startswith('h'):
            notes = f"Nagłówek {tag.name.upper()}"
        elif tag.name == 'p':
            notes = "Paragraf"
        elif tag.name == 'li':
            notes = "Element listy"

        nodes.append({
            'id': id_counter,
            'tag': tag.name,
            'text': text,
            'decision': decision,
            'notes': notes,
            'link_density': link_density
        })
        id_counter += 1

    return {
        'url': url,
        'title': title,
        'meta_description': meta_desc,
        'h1': h1_text,
        'structured_data': structured_data,
        'nodes': nodes
    }


# ============================================================================
# ZAPIS DO PLIKÓW
# ============================================================================

def save_as_text(data, filename):
    """
    Zapisuje wyekstrahowaną treść jako czysty tekst.
    """
    keep_nodes = [n for n in data['nodes'] if n['decision'] == 'KEEP']
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("SCRAPED CONTENT\n")
        f.write("=" * 70 + "\n\n")
        
        f.write(f"URL: {data['url']}\n")
        f.write(f"Title: {data['title']}\n")
        f.write(f"Meta Description: {data['meta_description']}\n")
        f.write(f"H1: {data['h1']}\n")
        f.write(f"\nZnaleziono węzłów: {len(data['nodes'])} (zachowano: {len(keep_nodes)})\n")
        
        f.write("\n" + "=" * 70 + "\n")
        f.write("TREŚĆ\n")
        f.write("=" * 70 + "\n\n")
        
        current_section = ""
        for node in keep_nodes:
            # Formatowanie według typu tagu
            if node['tag'] == 'h1':
                f.write(f"\n# {node['text']}\n\n")
            elif node['tag'] == 'h2':
                f.write(f"\n## {node['text']}\n\n")
            elif node['tag'] == 'h3':
                f.write(f"\n### {node['text']}\n\n")
            elif node['tag'] in ['h4', 'h5', 'h6']:
                f.write(f"\n#### {node['text']}\n\n")
            elif node['tag'] == 'li':
                f.write(f"  • {node['text']}\n")
            else:  # p
                f.write(f"{node['text']}\n\n")
        
        # Dane strukturalne
        if data['structured_data']:
            f.write("\n" + "=" * 70 + "\n")
            f.write("DANE STRUKTURALNE (Schema.org)\n")
            f.write("=" * 70 + "\n\n")
            for i, sd in enumerate(data['structured_data'], 1):
                f.write(f"[{i}] {json.dumps(sd, ensure_ascii=False, indent=2)}\n\n")
    
    print(f"   💾 Zapisano czysty tekst: {filename}")


def save_as_csv(data, filename):
    """
    Zapisuje dane w formacie CSV (do analizy/debugowania).
    """
    with open(filename, 'w', encoding='utf-8') as f:
        # Nagłówek
        f.write('"ID";"TAG";"LINK_DENSITY";"DECISION";"NOTES";"TEXT"\n')
        
        for node in data['nodes']:
            text_escaped = node['text'].replace('"', '""').replace('\n', ' ')
            f.write(f'"{node["id"]}";"{node["tag"]}";"{node["link_density"]:.2f}";"{node["decision"]}";"{node["notes"]}";"{text_escaped}"\n')
    
    print(f"   💾 Zapisano CSV: {filename}")


# ============================================================================
# GŁÓWNA FUNKCJA SCRAPOWANIA
# ============================================================================

async def scrape_url(url):
    """
    Pobiera i przetwarza zawartość strony.
    """
    print(f"\n{'='*70}")
    print(f"🌍 Pobieranie: {url}")
    print('='*70)
    
    # Konfiguracja przeglądarki
    browser_config = BrowserConfig(
        headless=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        page_timeout=PAGE_TIMEOUT,
        wait_until="domcontentloaded"
    )
    
    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            print("   ⏳ Ładowanie strony...")
            result = await crawler.arun(url, config=run_config)
            
            if not result.success:
                print(f"   ❌ Błąd pobierania: {result.status_code if hasattr(result, 'status_code') else 'Unknown'}")
                return None
            
            if len(result.html) < 500:
                print(f"   ❌ Za mało treści (tylko {len(result.html)} bajtów)")
                return None
            
            print(f"   ✅ Pobrano {len(result.html)} bajtów HTML")
            
            # Ekstrakcja treści
            print("   ⏳ Ekstrakcja treści...")
            data = extract_content(result.html, url)
            
            keep_nodes = [n for n in data['nodes'] if n['decision'] == 'KEEP']
            skip_nodes = [n for n in data['nodes'] if n['decision'] == 'SKIP']
            
            print(f"   ✅ Wyekstrahowano:")
            print(f"      - Title: {data['title'][:50]}..." if len(data['title']) > 50 else f"      - Title: {data['title']}")
            print(f"      - H1: {data['h1'][:50]}..." if len(data['h1']) > 50 else f"      - H1: {data['h1']}")
            print(f"      - Węzły KEEP: {len(keep_nodes)}")
            print(f"      - Węzły SKIP: {len(skip_nodes)} (wysokie link_density)")
            print(f"      - Schema.org: {len(data['structured_data'])} bloków")
            
            # Statystyki tagów
            tag_stats = {}
            for n in keep_nodes:
                tag_stats[n['tag']] = tag_stats.get(n['tag'], 0) + 1
            print(f"      - Struktura: {', '.join(f'{k}:{v}' for k,v in sorted(tag_stats.items()))}")
            
            return data
            
    except Exception as e:
        print(f"   ❌ Wyjątek: {e}")
        return None


# ============================================================================
# MAIN
# ============================================================================

async def main():
    print("\n" + "="*70)
    print("🤖 CONTENT SCRAPER - Standalone")
    print("="*70)
    print(f"\n📌 URL: {URL}")
    print(f"📄 Output (tekst): {OUTPUT_FILE}")
    print(f"📄 Output (CSV): {OUTPUT_FILE_CSV}")
    
    # Scrapowanie
    data = await scrape_url(URL)
    
    if data:
        # Zapis do plików
        print(f"\n{'='*70}")
        print("💾 ZAPISYWANIE")
        print('='*70)
        
        save_as_text(data, OUTPUT_FILE)
        save_as_csv(data, OUTPUT_FILE_CSV)
        
        print(f"\n{'='*70}")
        print("✅ ZAKOŃCZONO POMYŚLNIE")
        print('='*70)
    else:
        print(f"\n❌ Nie udało się pobrać treści z URL")


# Uruchomienie
if __name__ == "__main__":
    try:
        if 'get_ipython' in globals():
            import nest_asyncio
            nest_asyncio.apply()
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ Błąd krytyczny: {e}")