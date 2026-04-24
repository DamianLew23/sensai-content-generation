# =========================
# 2) CRAWL + BM25 FIT MARKDOWN
# =========================
import asyncio
import nest_asyncio
nest_asyncio.apply()

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.content_filter_strategy import BM25ContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

URL = "https://meskaklinika.pl/meski-stres-w-pracy-techniki-ktore-realnie-obnizaja-kortyzol-po-40-tce/"  # <-- podmień na swój adres
QUERY = "jak obniżyć kortyzol po 40tce"

async def main():
    # BrowserConfig możesz zostawić domyślny; headless=True w Colab jest OK
    browser_config = BrowserConfig(headless=True)

    # 1) BM25 filter (najważniejsze: user_query)
    bm25_filter = BM25ContentFilter(
        user_query=QUERY,
        bm25_threshold=1.2,   # jeśli będzie za mało treści -> obniż np. do 0.8
        # top_k=12,           # (opcjonalnie) w niektórych wersjach bywa dostępne
    )

    # 2) Generator markdown + content filter
    md_generator = DefaultMarkdownGenerator(
        content_filter=bm25_filter
    )

    # 3) Run config
    run_config = CrawlerRunConfig(
        markdown_generator=md_generator,
        # cache_mode="bypass",  # (opcjonalnie) zależnie od wersji
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=URL, config=run_config)

        # raw + fit
        raw_md = result.markdown.raw_markdown or ""
        fit_md = result.markdown.fit_markdown or ""

        print("RAW markdown chars:", len(raw_md))
        print("FIT markdown chars:", len(fit_md))
        print("\n--- FIT MARKDOWN (preview) ---\n")
        print(fit_md[:2000])

        # Zapis do plików
        with open("raw_markdown.md", "w", encoding="utf-8") as f:
            f.write(raw_md)

        with open("fit_markdown_bm25.md", "w", encoding="utf-8") as f:
            f.write(fit_md)

        print("\n✅ Zapisano: raw_markdown.md oraz fit_markdown_bm25.md")

await main()
