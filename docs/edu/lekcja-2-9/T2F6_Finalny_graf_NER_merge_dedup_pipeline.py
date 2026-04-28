#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
BLOK 5 / FILM 5.10
MERGE, DEDUPLIKACJA I FINALNY GRAF NER (FINAL PIPELINE)
============================================================
Cel:
- połączyć zwalidowane encje z wielu źródeł
- usunąć duplikaty
- oczyścić i ustawić kierunek relacji
- zwrócić gotowy graf NER (entities + relations)

UWAGA:
- skrypt NICZEGO nie generuje
- operuje wyłącznie na dostarczonych danych
"""

from collections import defaultdict, Counter
import re
import json

# ---------------- CONFIG ----------------
MAIN_PHRASE = "seo audit"
FORCE_MAIN_AS_CONCEPT = True

ORPHAN_SCORE_MIN = 70
ORPHAN_FREQ_MIN = 2
ORPHAN_LIMIT = 5

ALLOWED_ENTITY_TYPES = {
    "PERSON", "ORGANIZATION", "LOCATION",
    "PRODUCT", "CONCEPT", "EVENT"
}

ALLOWED_REL_TYPES = {
    "PART_OF", "RELATED_TO", "HAS_FEATURE",
    "USED_BY", "REQUIRES", "CONNECTED_TO"
}

# ---------------- HELPERS ----------------
def clean_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)", "", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip().lower()

def normalize_type(t: str) -> str:
    t = (t or "").upper()
    return t if t in ALLOWED_ENTITY_TYPES else "CONCEPT"

def normalize_rel_type(t: str) -> str:
    t = (t or "").upper().replace(" ", "_")
    return t if t in ALLOWED_REL_TYPES else "RELATED_TO"

# ---------------- MERGE ENTITIES ----------------
def merge_entities(entities, main_phrase=None):
    merged = {}
    key_main = clean_name(main_phrase) if main_phrase else None

    for e in entities:
        name = e["entity"]
        key = clean_name(name)

        etype = normalize_type(e.get("type"))
        if key == key_main and FORCE_MAIN_AS_CONCEPT:
            etype = "CONCEPT"

        if key not in merged:
            merged[key] = {
                "entity": name,
                "type": etype,
                "frequency": 1,
                "sources": set(e.get("sources", [])),
                "score": e.get("score", 50)
            }
        else:
            merged[key]["frequency"] += 1
            merged[key]["sources"].update(e.get("sources", []))
            merged[key]["score"] = max(
                merged[key]["score"],
                e.get("score", 50)
            )

    return list(merged.values())

# ---------------- RELATIONS ----------------
def dedup_relations(relations, entity_names):
    seen = set()
    out = []

    for r in relations:
        s = r["source"]
        t = r["target"]
        if s == t:
            continue
        if s not in entity_names or t not in entity_names:
            continue

        rel_type = normalize_rel_type(r.get("type"))
        key = tuple(sorted([s.lower(), t.lower()]) + [rel_type])
        if key in seen:
            continue
        seen.add(key)

        out.append({
            "source": s,
            "target": t,
            "type": rel_type,
            "strength": int(r.get("strength", 80))
        })
    return out

# ---------------- ORPHAN PATCH ----------------
def patch_orphans(entities, relations, central):
    degree = Counter()
    for r in relations:
        degree[r["source"]] += 1
        degree[r["target"]] += 1

    patched = 0
    for e in entities:
        if patched >= ORPHAN_LIMIT:
            break
        if e["entity"] == central:
            continue
        if degree[e["entity"]] > 0:
            continue
        if e["score"] < ORPHAN_SCORE_MIN:
            continue
        if e["frequency"] < ORPHAN_FREQ_MIN:
            continue

        relations.append({
            "source": e["entity"],
            "target": central,
            "type": "RELATED_TO",
            "strength": e["score"]
        })
        patched += 1

    return relations

# ---------------- DEMO RUN ----------------
if __name__ == "__main__":
    # przykładowy input (już po walidacji LLM)
    entities_in = [
        {"entity": "SEO Audit", "type": "CONCEPT", "sources": [1,2], "score": 95},
        {"entity": "Technical SEO", "type": "CONCEPT", "sources": [1], "score": 80},
        {"entity": "Google Search Console", "type": "PRODUCT", "sources": [2], "score": 85},
        {"entity": "SEO audit", "type": "CONCEPT", "sources": [3], "score": 90},
    ]

    relations_in = [
        {"source": "Technical SEO", "target": "SEO Audit", "type": "PART_OF", "strength": 90},
        {"source": "Google Search Console", "target": "SEO Audit", "type": "USED_BY", "strength": 85},
    ]

    merged_entities = merge_entities(entities_in, MAIN_PHRASE)
    names = {e["entity"] for e in merged_entities}

    final_relations = dedup_relations(relations_in, names)
    final_relations = patch_orphans(merged_entities, final_relations, "SEO Audit")

    graph = {
        "ner_entities": merged_entities,
        "ner_relations": final_relations
    }

    print(json.dumps(graph, indent=2))
