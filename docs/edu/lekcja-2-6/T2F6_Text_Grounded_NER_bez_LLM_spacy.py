#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BLOK 5 / FILM 5.6
Text-grounded NER bez LLM: spaCy (baseline)

Cel:
- pokazać ekstrakcję encji, które faktycznie występują w tekście (span-based),
- zrobić proste mapowanie etykiet spaCy -> kontrakt systemowy (PERSON/ORGANIZATION/LOCATION/PRODUCT/CONCEPT/EVENT),
- wygenerować czytelny preview + statystyki.

Użycie (lokalnie):
  python B5_F5_6_Text_Grounded_NER_bez_LLM_spacy.py --lang en --text-file sample.txt

Użycie (Colab):
- uruchom komórkę instalacyjną (na dole w komentarzu),
- wklej tekst do zmiennej TEXT albo wgraj plik i użyj --text-file.

Ważne:
- To jest baseline: bez heurystyk, bez deduplikacji "fuzzy", bez walidacji LLM.
"""

import argparse
import re
from collections import Counter
from typing import Dict, List, Any, Tuple

TYPE_WHITELIST = {"PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"}


def clean_merge_key(text: str) -> str:
    """Prosty klucz do deduplikacji (exact-match, case-insensitive)."""
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = re.sub(r"\s*\([^)]*\)\s*", " ", t)  # usuń dopiski w nawiasach
    return re.sub(r"\s+", " ", t).strip().lower()


def map_spacy_label_to_contract(label: str) -> str:
    """
    Minimalne mapowanie spaCy -> kontrakt systemowy.
    Jeśli nie pasuje: CONCEPT.
    """
    lab = (label or "").upper().strip()

    if lab == "PERSON":
        return "PERSON"

    if lab in {"ORG", "NORP"}:
        return "ORGANIZATION"

    if lab in {"GPE", "LOC", "FAC"}:
        return "LOCATION"

    if lab in {"PRODUCT", "WORK_OF_ART"}:
        return "PRODUCT"

    if lab == "EVENT":
        return "EVENT"

    return "CONCEPT"


def load_spacy_model(lang: str):
    """
    Ładuje sensowny model dla EN/PL.
    W Colab możesz mieć tylko en_core_web_sm, chyba że dociągniesz PL.
    """
    import spacy

    if lang.startswith("pl"):
        candidates = ["pl_core_news_md", "pl_core_news_lg", "pl_core_news_sm"]
    else:
        candidates = ["en_core_web_sm", "en_core_web_md", "en_core_web_lg"]

    for m in candidates:
        try:
            nlp = spacy.load(m)
            return nlp, m
        except Exception:
            continue

    raise RuntimeError(
        f"Nie mogę załadować modelu spaCy dla lang='{lang}'. "
        f"Zainstaluj model (np. python -m spacy download en_core_web_sm)."
    )


def extract_spacy_entities(text: str, lang: str) -> List[Dict[str, Any]]:
    """
    Zwraca listę encji w formacie:
    {surface, start, end, spacy_label, domain_type}
    """
    nlp, model_name = load_spacy_model(lang)
    doc = nlp(text)

    entities: List[Dict[str, Any]] = []
    for ent in doc.ents:
        surface = ent.text.strip()
        if not surface:
            continue
        domain_type = map_spacy_label_to_contract(ent.label_)
        entities.append(
            {
                "surface": surface,
                "start": ent.start_char,
                "end": ent.end_char,
                "spacy_label": ent.label_,
                "domain_type": domain_type,
                "model": model_name,
            }
        )
    return entities


def dedup_entities_exact(entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deduplikacja exact po nazwie (merge key) + typie kontraktowym.
    W baseline to wystarczy do demo.
    """
    seen: set[Tuple[str, str]] = set()
    out: List[Dict[str, Any]] = []
    for e in entities:
        key = (clean_merge_key(e["surface"]), e["domain_type"])
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def preview(entities: List[Dict[str, Any]], top_n: int = 25) -> None:
    print("\n" + "=" * 70)
    print(f"PREVIEW (top {min(top_n, len(entities))}/{len(entities)})")
    print("=" * 70)
    for i, e in enumerate(entities[:top_n], 1):
        print(f"{i:02d}. {e['surface']}  |  {e['domain_type']} (spaCy:{e['spacy_label']})")


def stats(entities: List[Dict[str, Any]]) -> None:
    cnt = Counter([e["domain_type"] for e in entities])
    print("\n" + "-" * 70)
    print("STATS (domain_type)")
    print("-" * 70)
    for k, v in cnt.most_common():
        print(f"{k:14s}  {v}")


def read_text_from_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description="B5/F5.6 spaCy NER baseline (text-grounded).")
    ap.add_argument("--lang", default="en", help="Language hint: en or pl (default: en)")
    ap.add_argument("--text-file", default=None, help="Path to a text file (UTF-8)")
    ap.add_argument("--top-n", type=int, default=25, help="Preview top N entities")
    args = ap.parse_args()

    # Ten sam input co w 5.5/5.6 — w Colab po prostu wklejasz tekst tutaj:
    TEXT = """\
Paste your cleaned SEO article text here.
(Use --text-file if you prefer.)
"""

    text = read_text_from_file(args.text_file) if args.text_file else TEXT
    text = text.strip()

    if len(text) < 50:
        raise SystemExit("Tekst jest zbyt krótki — wklej dłuższy fragment albo użyj --text-file.")

    entities = extract_spacy_entities(text, args.lang)
    entities = dedup_entities_exact(entities)

    print(f"\nLoaded spaCy model: {entities[0]['model'] if entities else '—'}")
    print(f"Entities (dedup): {len(entities)}")

    preview(entities, args.top_n)
    stats(entities)


if __name__ == "__main__":
    main()

# -----------------------------
# COLAB QUICK SETUP (komórka instalacyjna)
# -----------------------------
# !pip -q install spacy
# !python -m spacy download en_core_web_sm
#
# (Opcjonalnie PL — bywa cięższe)
# !python -m spacy download pl_core_news_sm
