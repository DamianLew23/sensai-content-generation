# =========================
# 2) CRAWL + PRUNING FIT MARKDOWN
# =========================
import asyncio
import nest_asyncio
nest_asyncio.apply()

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

URL = "https://www.aptekarosa.pl/blog/article/1303-jak-obnizyc-poziom-kortyzolu-czyli-czego-nie-lubi-ten-wyjatkowo-destrukcyjny-hormon-stresu.html"  # <-- podmień na swój adres

async def main():
    browser_config = BrowserConfig(headless=True)

    # Pruning filter (heurystyczne odcinanie boilerplate)
    pruning_filter = PruningContentFilter(
        # Najczęściej używane gałki:
        threshold=0.4,            # jak za dużo treści zostaje -> zwiększ; jak za mało -> zmniejsz
        threshold_type="fixed",  # często najlepsze "na start"
        min_word_threshold=1      # nie przepuszcza mikro-bloków
    )

    md_generator = DefaultMarkdownGenerator(content_filter=pruning_filter)

    run_config = CrawlerRunConfig(
        markdown_generator=md_generator,
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=URL, config=run_config)

        raw_md = result.markdown.raw_markdown or ""
        fit_md = result.markdown.fit_markdown or ""

        print("RAW markdown chars:", len(raw_md))
        print("FIT markdown chars:", len(fit_md))
        print("\n--- FIT MARKDOWN (preview) ---\n")
        print(fit_md)

        with open("raw_markdown.md", "w", encoding="utf-8") as f:
            f.write(raw_md)

        with open("fit_markdown_pruning.md", "w", encoding="utf-8") as f:
            f.write(fit_md)

        print("\n✅ Zapisano: raw_markdown.md oraz fit_markdown_pruning.md")

await main()
