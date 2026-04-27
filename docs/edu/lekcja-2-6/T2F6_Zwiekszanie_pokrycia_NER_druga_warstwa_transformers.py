#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BLOK 5 / FILM 5.7
Zwiększanie pokrycia NER: druga warstwa ekstrakcji (Transformers)

Cel:
- pokazać, że dokładamy drugą warstwę ekstrakcji (token-classification),
- porównać pokrycie: spaCy vs transformers na tym samym tekście,
- zbudować "candidate set" pod późniejszą walidację (LLM / reguły / pipeline).

Użycie (lokalnie):
  python B5_F5_7_Zwiekszanie_pokrycia_NER_druga_warstwa_transformers.py --lang en --text-file sample.txt

Użycie (Colab):
- uruchom komórkę instalacyjną (na dole w komentarzu),
- wklej tekst do zmiennej TEXT albo wgraj plik i użyj --text-file.

Uwaga:
- Transformers NER ma różne etykiety zależnie od modelu. Tu robimy pragmatyczne mapowanie
  do kontraktu systemowego (PERSON/ORGANIZATION/LOCATION/PRODUCT/CONCEPT/EVENT) z fallbackiem CONCEPT.
- W 5.7 nie walidujemy jakości — pokazujemy POKRYCIE, a walidację zrobimy później.
"""

import argparse
import re
from collections import Counter
from typing import Dict, List, Any, Tuple, Set

TYPE_WHITELIST = {"PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"}


def clean_merge_key(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = re.sub(r"\s*\([^)]*\)\s*", " ", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def map_spacy_label_to_contract(label: str) -> str:
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
    raise RuntimeError(f"Nie mogę załadować modelu spaCy dla lang='{lang}'.")


def extract_spacy_entities(text: str, lang: str) -> List[Dict[str, Any]]:
    nlp, model_name = load_spacy_model(lang)
    doc = nlp(text)
    out: List[Dict[str, Any]] = []
    for ent in doc.ents:
        surface = ent.text.strip()
        if not surface:
            continue
        out.append({
            "surface": surface,
            "domain_type": map_spacy_label_to_contract(ent.label_),
            "origin": f"spacy:{ent.label_}",
            "model": model_name
        })
    return out


def map_hf_label_to_contract(label: str) -> str:
    """
    Mapowanie etykiet HuggingFace NER -> kontrakt.
    Typowe etykiety to PER/ORG/LOC/MISC lub IOB (B-PER/I-ORG, itd.).
    """
    lab = (label or "").upper().strip()
    if lab.startswith("B-") or lab.startswith("I-"):
        lab = lab[2:]

    if lab in {"PER", "PERSON"}:
        return "PERSON"
    if lab in {"ORG", "ORGANIZATION"}:
        return "ORGANIZATION"
    if lab in {"LOC", "LOCATION", "GPE"}:
        return "LOCATION"
    if lab in {"PROD", "PRODUCT"}:
        return "PRODUCT"
    if lab in {"EVENT"}:
        return "EVENT"
    return "CONCEPT"


def extract_transformers_entities(text: str, model_name: str) -> List[Dict[str, Any]]:
    from transformers import pipeline
    ner = pipeline("token-classification", model=model_name, aggregation_strategy="simple")
    preds = ner(text)

    out: List[Dict[str, Any]] = []
    for p in preds:
        surface = (p.get("word") or "").strip()
        if not surface:
            continue
        label = p.get("entity_group") or p.get("entity") or ""
        out.append({
            "surface": surface,
            "domain_type": map_hf_label_to_contract(label),
            "origin": f"hf:{label}",
            "score": float(p.get("score", 0.0)),
            "model": model_name
        })
    return out


def dedup_exact(entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[Tuple[str, str]] = set()
    out: List[Dict[str, Any]] = []
    for e in entities:
        key = (clean_merge_key(e["surface"]), e["domain_type"])
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def split_sets(spacy_ents: List[Dict[str, Any]], hf_ents: List[Dict[str, Any]]):
    spacy_set = {clean_merge_key(e["surface"]) for e in spacy_ents}
    hf_set = {clean_merge_key(e["surface"]) for e in hf_ents}

    overlap = spacy_set & hf_set
    only_spacy = spacy_set - hf_set
    only_hf = hf_set - spacy_set
    return only_spacy, only_hf, overlap


def preview(title: str, items: List[str], top_n: int = 25):
    print("\n" + "=" * 70)
    print(f"{title} (top {min(top_n, len(items))}/{len(items)})")
    print("=" * 70)
    for i, s in enumerate(items[:top_n], 1):
        print(f"{i:02d}. {s}")


def stats(entities: List[Dict[str, Any]], label: str):
    cnt = Counter([e["domain_type"] for e in entities])
    print("\n" + "-" * 70)
    print(f"STATS ({label})")
    print("-" * 70)
    for k, v in cnt.most_common():
        print(f"{k:14s}  {v}")


def read_text_from_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description="B5/F5.7 Transformers NER layer + coverage comparison vs spaCy.")
    ap.add_argument("--lang", default="en", help="Language hint: en or pl (default: en)")
    ap.add_argument("--text-file", default=None, help="Path to a text file (UTF-8)")
    ap.add_argument("--hf-model", default="dslim/bert-base-NER", help="HF model name for NER (default: dslim/bert-base-NER)")
    ap.add_argument("--top-n", type=int, default=25, help="Preview top N items")
    args = ap.parse_args()

    TEXT = """\
Paste your cleaned SEO article text here.
(Use --text-file if you prefer.)
"""

    text = read_text_from_file(args.text_file) if args.text_file else TEXT
    text = text.strip()
    if len(text) < 50:
        raise SystemExit("Tekst jest zbyt krótki — wklej dłuższy fragment albo użyj --text-file.")

    # 1) spaCy baseline
    spacy_ents = dedup_exact(extract_spacy_entities(text, args.lang))

    # 2) Transformers layer
    hf_ents = dedup_exact(extract_transformers_entities(text, args.hf_model))

    print("\n" + "=" * 70)
    print("MODELS")
    print("=" * 70)
    print(f"spaCy: {spacy_ents[0]['model'] if spacy_ents else '—'}")
    print(f"HF:    {args.hf_model}")

    print("\n" + "=" * 70)
    print("COUNTS")
    print("=" * 70)
    print(f"spaCy entities:        {len(spacy_ents)}")
    print(f"Transformers entities: {len(hf_ents)}")

    stats(spacy_ents, "spaCy (contract types)")
    stats(hf_ents, "Transformers (contract types)")

    only_spacy, only_hf, overlap = split_sets(spacy_ents, hf_ents)

    preview("OVERLAP (both)", sorted(list(overlap)), args.top_n)
    preview("ONLY spaCy", sorted(list(only_spacy)), args.top_n)
    preview("ONLY Transformers", sorted(list(only_hf)), args.top_n)

    merged = sorted(list(
        {clean_merge_key(e["surface"]) for e in spacy_ents} |
        {clean_merge_key(e["surface"]) for e in hf_ents}
    ))
    preview("MERGED CANDIDATE SET (surface keys)", merged, args.top_n)


if __name__ == "__main__":
    main()

# -----------------------------
# COLAB QUICK SETUP (komórka instalacyjna)
# -----------------------------
# !pip -q install spacy transformers torch
# !python -m spacy download en_core_web_sm
#
# (Opcjonalnie PL — bywa cięższe)
# !python -m spacy download pl_core_news_sm
