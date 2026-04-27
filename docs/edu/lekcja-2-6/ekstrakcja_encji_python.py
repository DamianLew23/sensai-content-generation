#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
WEBINAR: Knowledge Graph Extraction - WERSJA POLSKA
============================================================
Ekstrakcja encji i relacji z polskiego tekstu:
- spaCy (pl_core_news)
- Transformers (polskie modele BERT)
- Dependency parsing dla relacji
- Pattern matching dla typowych relacji
- Wizualizacja grafu

============================================================
"""

import re
import json
from collections import Counter, defaultdict
from typing import List, Dict, Any, Tuple

# ===================================================
# SECTION 1: IMPORTS & SETUP
# ===================================================

print("Ładowanie bibliotek...")

import spacy
import networkx as nx
import matplotlib.pyplot as plt

# Ustawienia matplotlib dla polskich znaków
plt.rcParams['font.family'] = 'DejaVu Sans'

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("⚠️  Transformers niedostępne (opcjonalnie)")

print("✅ Biblioteki załadowane!")

# ===================================================
# SECTION 2: KONFIGURACJA
# ===================================================

# Język: zawsze "pl" dla polskiego
LANGUAGE = "pl"

# Typy encji do ekstrakcji
ENTITY_TYPES = {
    "PERSON",
    "ORGANIZATION",
    "LOCATION",
    "PRODUCT",
    "CONCEPT",
    "EVENT"
}

# Minimalna długość encji
MIN_ENTITY_LENGTH = 3

# Maksymalna liczba węzłów na grafie
MAX_VIZ_NODES = 25

# Tryb debug
DEBUG = False

# ===================================================
# SECTION 3: POLSKI TEKST TESTOWY
# ===================================================

SAMPLE_TEXT_PL = """
CD Projekt S.A. to polska firma deweloperska i wydawnicza gier komputerowych z siedzibą w Warszawie.
Marcin Iwiński jest współzałożycielem CD Projektu i pełnił funkcję prezesa zarządu przez wiele lat.
Firma jest znana przede wszystkim z serii gier Wiedźmin, która powstała na podstawie powieści Andrzeja Sapkowskiego.
Gra Wiedźmin 3: Dziki Gon zdobyła ponad 250 nagród i uznana została za jedną z najlepszych gier wszech czasów.
W 2020 roku CD Projekt wydał grę Cyberpunk 2077, której premiera odbyła się po wieloletniej produkcji.
Siedziba firmy mieści się w biurowcu Zebra Tower w centrum Warszawy przy ulicy Mokotowskiej.
CD Projekt prowadzi również platformę dystrybucji cyfrowej GOG.com, która oferuje gry bez DRM.
Michał Kiciński jest drugim współzałożycielem firmy i odpowiada za rozwój technologii.
Firma zatrudnia ponad 1200 pracowników i jest notowana na Giełdzie Papierów Wartościowych w Warszawie.
Studio REDengine to silnik graficzny stworzony przez CD Projekt używany w grach firmy.
"""

TEXT = SAMPLE_TEXT_PL.strip()

# Opcja B: Wczytaj z pliku
# with open("artykul_pl.txt", "r", encoding="utf-8") as f:
#     TEXT = f.read().strip()

print(f"\n📄 Tekst wejściowy: {len(TEXT)} znaków")
print(f"Podgląd: {TEXT[:150]}...\n")

# ===================================================
# SECTION 4: PREPROCESSING
# ===================================================

def clean_text(text: str) -> str:
    """Czyszczenie i normalizacja tekstu"""
    if not text:
        return ""

    # Usuń tagi HTML
    text = re.sub(r"<[^>]+>", " ", text)

    # Normalizuj białe znaki
    text = re.sub(r"\s+", " ", text)

    # Usuń URL-e
    text = re.sub(r"http\S+|www\.\S+", "", text)

    return text.strip()

TEXT_CLEAN = clean_text(TEXT)
print(f"✅ Tekst wyczyszczony: {len(TEXT_CLEAN)} znaków")

# ===================================================
# SECTION 5: LOAD POLISH SPACY MODEL
# ===================================================

def load_spacy_model(lang: str = "pl"):
    """Ładowanie polskiego modelu spaCy"""

    # Próbuj w kolejności: lg > md > sm (jak w Twoim skrypcie)
    models = ["pl_core_news_lg", "pl_core_news_md", "pl_core_news_sm"]

    for model_name in models:
        try:
            nlp = spacy.load(model_name)
            print(f"✅ Załadowano model spaCy: {model_name}")
            return nlp, model_name
        except Exception as e:
            if DEBUG:
                print(f"   Nie udało się załadować {model_name}: {e}")
            continue

    raise RuntimeError(
        "Nie znaleziono polskiego modelu spaCy. "
        "Zainstaluj: python -m spacy download pl_core_news_sm"
    )

nlp, model_name = load_spacy_model(LANGUAGE)

# Przetwarzanie tekstu
doc = nlp(TEXT_CLEAN)
print(f"✅ Tekst przetworzony: {len(doc)} tokenów")

# ===================================================
# SECTION 6: ENTITY EXTRACTION (spaCy)
# ===================================================

def map_entity_type(label: str) -> str:
    """Mapowanie etykiet spaCy na uproszczoną taksonomię"""
    label = (label or "").upper()

    mapping = {
        "PERSNAME": "PERSON",      # Polski model używa PERSNAME
        "PERSON": "PERSON",
        "ORGNAME": "ORGANIZATION",  # Polski model używa ORGNAME
        "ORG": "ORGANIZATION",
        "PLACENAME": "LOCATION",    # Polski model używa PLACENAME
        "GEOGNAME": "LOCATION",
        "GPE": "LOCATION",
        "LOC": "LOCATION",
        "FAC": "LOCATION",
        "PRODUCT": "PRODUCT",
        "WORK_OF_ART": "PRODUCT",
        "EVENT": "EVENT",
        "DATE": "CONCEPT",
        "TIME": "CONCEPT",
    }

    return mapping.get(label, "CONCEPT")

def extract_entities_spacy(doc) -> List[Dict[str, Any]]:
    """Ekstrakcja i deduplikacja encji z spaCy doc"""

    entities = []
    seen = set()

    for ent in doc.ents:
        surface = ent.text.strip()

        # Filtry jakości
        if len(surface) < MIN_ENTITY_LENGTH:
            continue
        if surface.lower() in {"jest", "to", "są", "lub", "oraz"}:
            continue

        entity_type = map_entity_type(ent.label_)

        # Deduplikacja po (lowercase nazwa, typ)
        key = (surface.lower(), entity_type)
        if key in seen:
            continue
        seen.add(key)

        entities.append({
            "entity": surface,
            "type": entity_type,
            "start": ent.start_char,
            "end": ent.end_char,
            "source": "spacy",
            "label_original": ent.label_  # zachowaj oryginalną etykietę
        })

    return entities

entities_spacy = extract_entities_spacy(doc)

print(f"\n{'='*60}")
print("📊 ENCJE WYEKSTRAKTOWANE (spaCy)")
print(f"{'='*60}")
print(f"Łącznie: {len(entities_spacy)}\n")

for ent in entities_spacy[:25]:  # Pokaż wszystkie (zwykle nie będzie więcej)
    print(f"  • {ent['entity']:<35} [{ent['type']}] (spaCy: {ent['label_original']})")

# Podsumowanie typów
type_counts = Counter(e["type"] for e in entities_spacy)
print(f"\n📈 Typy encji:")
for typ, count in type_counts.most_common():
    print(f"  {typ}: {count}")

# ===================================================
# SECTION 7: RELATION EXTRACTION (Dependency Parsing)
# ===================================================

def extract_relations_dependencies(doc, entities: List[Dict]) -> List[Dict[str, Any]]:
    """Ekstrakcja relacji używając dependency parsing"""

    relations = []
    entity_texts = {e["entity"].lower() for e in entities}

    # Buduj mapę entity spans
    entity_spans = {}
    for ent in doc.ents:
        for token in ent:
            entity_spans[token.i] = ent.text

    for token in doc:
        # Wzorzec 1: Podmiot -> Orzeczenie -> Dopełnienie
        if token.dep_ in ("nsubj", "nsubjpass"):
            subject = entity_spans.get(token.i)
            if not subject:
                continue

            verb = token.head

            # Szukaj dopełnienia
            for child in verb.children:
                if child.dep_ in ("obj", "iobj", "attr", "prep", "obl"):
                    obj = entity_spans.get(child.i)
                    if not obj:
                        # Sprawdź poddzieci dla złożonych encji
                        for subchild in child.subtree:
                            obj = entity_spans.get(subchild.i)
                            if obj:
                                break

                    if obj and subject.lower() != obj.lower():
                        relations.append({
                            "source": subject,
                            "target": obj,
                            "type": verb.lemma_.upper().replace(" ", "_"),
                            "pattern": "dependency",
                            "confidence": 0.75
                        })

        # Wzorzec 2: Posiadanie (czyjś/czyjaś X)
        elif token.dep_ == "nmod:poss":
            possessor = entity_spans.get(token.i)
            possessed = entity_spans.get(token.head.i)

            if possessor and possessed:
                relations.append({
                    "source": possessor,
                    "target": possessed,
                    "type": "POSIADA",
                    "pattern": "possessive",
                    "confidence": 0.8
                })

        # Wzorzec 3: Część (compound)
        elif token.dep_ == "flat:name":
            part = entity_spans.get(token.i)
            whole = entity_spans.get(token.head.i)

            if part and whole and part != whole:
                relations.append({
                    "source": part,
                    "target": whole,
                    "type": "CZĘŚĆ_Z",
                    "pattern": "compound",
                    "confidence": 0.7
                })

    return relations

relations_dep = extract_relations_dependencies(doc, entities_spacy)

# ===================================================
# SECTION 8: RELATION EXTRACTION (Pattern Matching)
# ===================================================

def extract_relations_patterns(text: str, entities: List[Dict]) -> List[Dict[str, Any]]:
    """Ekstrakcja relacji używając wzorców regex (POLSKIE WZORCE)"""

    relations = []
    entity_names = {e["entity"] for e in entities}

    # Polskie wzorce (relation_type, regex_pattern, source_group, target_group)
    patterns = [
        ("JEST", r"(.+?)\s+(?:jest|są|to)\s+(?:to\s+)?(.+?)(?:\.|,|;|$)", 1, 2),
        ("PRACUJE_W", r"(.+?)\s+(?:pracuje|pracował|zatrudniony)\s+(?:w|dla)\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("STWORZONY_PRZEZ", r"(.+?)\s+(?:stworzony|utworzony|zbudowany|zaprojektowany)\s+przez\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("STWORZYŁ", r"(.+?)\s+(?:stworzył|utworzył|zbudował|zaprojektował|wydał)\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("ZNAJDUJE_SIĘ_W", r"(.+?)\s+(?:znajduje się|mieści się|zlokalizowany)\s+w\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("CZĘŚĆ_Z", r"(.+?)\s+(?:część|element)\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("PREZES", r"(.+?)\s+(?:jest|był)\s+(?:prezesem|dyrektorem|szefem)\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("WSPÓŁZAŁOŻYCIEL", r"(.+?)\s+(?:jest|był)\s+(?:współzałożycielem|założycielem)\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("POWSTAŁ_NA_PODSTAWIE", r"(.+?)\s+(?:powstała|powstał)\s+na podstawie\s+(.+?)(?:\.|,|;|$)", 1, 2),
        ("ZNANY_Z", r"(.+?)\s+(?:znany|znana)\s+(?:z|przede wszystkim z)\s+(.+?)(?:\.|,|;|$)", 1, 2),
    ]

    for rel_type, pattern, src_grp, tgt_grp in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            try:
                source = match.group(src_grp).strip()
                target = match.group(tgt_grp).strip()

                # Czyszczenie
                source = re.sub(r"^(to|jest|są)\s+", "", source, flags=re.I)
                target = re.sub(r"^(to|jest|są)\s+", "", target, flags=re.I)

                # Sprawdź czy oba są encjami (fuzzy match)
                src_match = None
                tgt_match = None

                for ent_name in entity_names:
                    if ent_name.lower() in source.lower() or source.lower() in ent_name.lower():
                        src_match = ent_name
                    if ent_name.lower() in target.lower() or target.lower() in ent_name.lower():
                        tgt_match = ent_name

                if src_match and tgt_match and src_match != tgt_match:
                    relations.append({
                        "source": src_match,
                        "target": tgt_match,
                        "type": rel_type,
                        "pattern": "regex",
                        "confidence": 0.65
                    })
            except Exception as e:
                if DEBUG:
                    print(f"Błąd dopasowania wzorca: {e}")
                continue

    return relations

relations_pattern = extract_relations_patterns(TEXT_CLEAN, entities_spacy)

# ===================================================
# SECTION 9: MERGE AND DEDUPLICATE RELATIONS
# ===================================================

def deduplicate_relations(relations: List[Dict]) -> List[Dict]:
    """Usuwanie duplikatów relacji"""

    unique = {}

    for rel in relations:
        # Normalizacja
        src = rel["source"].strip()
        tgt = rel["target"].strip()
        typ = rel["type"].upper()

        # Pomiń samoreferujące
        if src.lower() == tgt.lower():
            continue

        # Utwórz klucz (dwukierunkowy)
        key1 = (src.lower(), tgt.lower(), typ)
        key2 = (tgt.lower(), src.lower(), typ)

        if key1 not in unique and key2 not in unique:
            unique[key1] = {
                "source": src,
                "target": tgt,
                "type": typ,
                "pattern": rel.get("pattern", "unknown"),
                "confidence": rel.get("confidence", 0.5)
            }

    return list(unique.values())

# Złącz wszystkie relacje
all_relations = relations_dep + relations_pattern
relations_final = deduplicate_relations(all_relations)

print(f"\n{'='*60}")
print("🔗 RELACJE WYEKSTRAKTOWANE")
print(f"{'='*60}")
print(f"Z dependency parsing: {len(relations_dep)}")
print(f"Z wzorców (pattern): {len(relations_pattern)}")
print(f"Po deduplikacji: {len(relations_final)}\n")

for rel in relations_final[:20]:  # Pokaż więcej dla polskiego
    print(f"  • {rel['source']:<30} → {rel['target']:<30} [{rel['type']}]")

if len(relations_final) > 20:
    print(f"  ... i jeszcze {len(relations_final) - 20}")

# ===================================================
# SECTION 10: TRANSFORMERS NER (Polskie modele)
# ===================================================

if TRANSFORMERS_AVAILABLE:
    print(f"\n{'='*60}")
    print("🤖 BONUS: Transformer NER (Polski BERT)")
    print(f"{'='*60}")

    try:
        # Polskie modele NER (wybierz jeden)
        # Opcja 1: Allegro Herbert (dobry dla polskiego)
        # model_name = "allegro/herbert-base-cased"

        # Opcja 2: dkleczek (często używany dla polskiego NER)
        model_name = "dkleczek/bert-base-polish-cased-v1"

        # Opcja 3: xlm-roberta (multilingual, działa też dla polskiego)
        # model_name = "xlm-roberta-base"

        print(f"Ładowanie modelu: {model_name}")

        ner_transformer = pipeline(
            "ner",
            model=model_name,
            aggregation_strategy="simple"
        )

        # Ekstraktuj (ogranicz długość dla demo)
        text_sample = TEXT_CLEAN[:512]
        transformer_results = ner_transformer(text_sample)

        entities_transformer = []
        for ent in transformer_results:
            entities_transformer.append({
                "entity": ent["word"],
                "type": ent["entity_group"],
                "score": round(ent["score"], 3),
                "source": "transformer"
            })

        print(f"Znaleziono {len(entities_transformer)} encji\n")

        for ent in entities_transformer[:15]:
            print(f"  • {ent['entity']:<30} [{ent['type']}] (pewność: {ent['score']})")

        print(f"\n📊 Porównanie:")
        print(f"  spaCy:        {len(entities_spacy)} encji")
        print(f"  Transformers: {len(entities_transformer)} encji")

    except Exception as e:
        print(f"⚠️  Ekstrakcja Transformer nie powiodła się: {e}")
        print(f"   Spróbuj: pip install transformers torch")

# ===================================================
# SECTION 11: KNOWLEDGE GRAPH VISUALIZATION
# ===================================================

def visualize_knowledge_graph(
    entities: List[Dict],
    relations: List[Dict],
    max_nodes: int = MAX_VIZ_NODES,
    figsize: Tuple[int, int] = (18, 14)
):
    """Wizualizacja grafu wiedzy"""

    # Utwórz graf skierowany
    G = nx.DiGraph()

    # Dodaj węzły (ogranicz dla czytelności)
    entities_subset = entities[:max_nodes]
    for ent in entities_subset:
        G.add_node(ent["entity"], type=ent["type"])

    # Dodaj krawędzie
    for rel in relations:
        if rel["source"] in G.nodes and rel["target"] in G.nodes:
            G.add_edge(
                rel["source"],
                rel["target"],
                label=rel["type"],
                confidence=rel.get("confidence", 0.5)
            )

    # Layout
    pos = nx.spring_layout(G, k=1.8, iterations=50, seed=42)

    # Mapa kolorów według typu encji
    color_map = {
        "PERSON": "#87CEEB",        # Niebieski
        "ORGANIZATION": "#90EE90",  # Zielony
        "LOCATION": "#FFB6C1",      # Różowy
        "PRODUCT": "#FFD700",       # Złoty
        "CONCEPT": "#DDA0DD",       # Fioletowy
        "EVENT": "#FFA07A"          # Pomarańczowy
    }

    node_colors = [
        color_map.get(G.nodes[n].get("type", "CONCEPT"), "#D3D3D3")
        for n in G.nodes
    ]

    # Rysowanie
    plt.figure(figsize=figsize)

    # Węzły
    nx.draw_networkx_nodes(
        G, pos,
        node_color=node_colors,
        node_size=3500,
        alpha=0.9,
        edgecolors="black",
        linewidths=2.5
    )

    # Etykiety węzłów
    nx.draw_networkx_labels(
        G, pos,
        font_size=9,
        font_weight="bold",
        font_family="DejaVu Sans"
    )

    # Krawędzie
    nx.draw_networkx_edges(
        G, pos,
        edge_color="gray",
        arrows=True,
        arrowsize=25,
        arrowstyle="->",
        width=2.5,
        alpha=0.6,
        connectionstyle="arc3,rad=0.15"
    )

    # Etykiety krawędzi
    edge_labels = nx.get_edge_attributes(G, "label")
    nx.draw_networkx_edge_labels(
        G, pos,
        edge_labels,
        font_size=8,
        font_color="red",
        bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8)
    )

    # Legenda
    legend_elements = [
        plt.Line2D([0], [0], marker='o', color='w',
                  markerfacecolor=color, markersize=12, label=typ)
        for typ, color in color_map.items()
    ]
    plt.legend(
        handles=legend_elements,
        loc='upper left',
        fontsize=11,
        framealpha=0.95
    )

    plt.title(
        "Graf Wiedzy - Polskie Encje i Relacje\n(spaCy + Dependency Parsing + Pattern Matching)",
        fontsize=16,
        fontweight="bold",
        pad=20
    )
    plt.axis("off")
    plt.tight_layout()
    plt.show()

    # Statystyki
    print(f"\n{'='*60}")
    print("📈 STATYSTYKI GRAFU")
    print(f"{'='*60}")
    print(f"Węzły (encje): {G.number_of_nodes()}")
    print(f"Krawędzie (relacje): {G.number_of_edges()}")
    print(f"Gęstość grafu: {nx.density(G):.3f}")

    # Najbardziej połączone encje
    degree_dict = dict(G.degree())
    top_nodes = sorted(degree_dict.items(), key=lambda x: x[1], reverse=True)[:5]

    print(f"\n🌟 Najbardziej połączone encje:")
    for node, degree in top_nodes:
        print(f"  • {node}: {degree} połączeń")

print(f"\n{'='*60}")
print("🎨 GENEROWANIE WIZUALIZACJI...")
print(f"{'='*60}\n")

visualize_knowledge_graph(entities_spacy, relations_final)

# ===================================================
# SECTION 12: FINAL SUMMARY & EXPORT
# ===================================================

def generate_summary():
    """Generuj kompleksowe podsumowanie"""

    print(f"\n{'='*60}")
    print("📋 PODSUMOWANIE KOŃCOWE")
    print(f"{'='*60}\n")

    print(f"📄 Wejście:")
    print(f"  Długość tekstu: {len(TEXT_CLEAN)} znaków")
    print(f"  Przetworzonych tokenów: {len(doc)}")
    print(f"  Model spaCy: {model_name}")

    print(f"\n🏷️  Encje:")
    print(f"  Łącznie wyekstraktowanych: {len(entities_spacy)}")
    for typ, count in Counter(e["type"] for e in entities_spacy).most_common():
        print(f"    • {typ}: {count}")

    print(f"\n🔗 Relacje:")
    print(f"  Łącznie wyekstraktowanych: {len(relations_final)}")
    for typ, count in Counter(r["type"] for r in relations_final).most_common():
        print(f"    • {typ}: {count}")

    # Analiza połączeń
    conn_count = Counter()
    for rel in relations_final:
        conn_count[rel["source"]] += 1
        conn_count[rel["target"]] += 1

    print(f"\n🌟 Top 5 najbardziej połączonych encji:")
    for entity, count in conn_count.most_common(5):
        print(f"  • {entity}: {count} połączeń")

    # Osierocone encje
    connected_entities = set(conn_count.keys())
    orphans = [e for e in entities_spacy if e["entity"] not in connected_entities]
    print(f"\n⚠️  Osierocone encje (bez relacji): {len(orphans)}")
    if orphans and len(orphans) <= 5:
        for orph in orphans:
            print(f"    • {orph['entity']}")

    print(f"\n{'='*60}")

generate_summary()

# ===================================================
# SECTION 13: EXPORT TO JSON
# ===================================================

def export_to_json(filename: str = "knowledge_graph_pl.json"):
    """Eksport grafu wiedzy do JSON"""

    output = {
        "metadata": {
            "source": "webinar_demo_pl",
            "model": model_name,
            "language": "pl",
            "text_length": len(TEXT_CLEAN),
            "timestamp": "2025-01-13"
        },
        "entities": entities_spacy,
        "relations": relations_final,
        "statistics": {
            "total_entities": len(entities_spacy),
            "total_relations": len(relations_final),
            "entity_types": dict(Counter(e["type"] for e in entities_spacy)),
            "relation_types": dict(Counter(r["type"] for r in relations_final))
        }
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Graf wiedzy wyeksportowany do: {filename}")

# Eksport
export_to_json()

print("\n✅ WEBINAR DEMO ZAKOŃCZONE!")
print("="*60)