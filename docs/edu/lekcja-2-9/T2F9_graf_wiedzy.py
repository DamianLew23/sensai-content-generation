#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
KNOWLEDGE GRAPH ASSEMBLER v3.0
=====================================================
Scala dane z różnych źródeł w jeden Knowledge Graph.

Inputs:
  - entities.json (z NER Builder) - encje + relacje
  - extracted_data.txt (z Data Extractor) - fakty, measurables, ideations

Output:
  - kg_output.json (kompletny Knowledge Graph)

Pipeline:
  1. Wczytaj encje i relacje z entities.json
  2. Wczytaj fakty/measurables/ideations z extracted_data.txt
  3. Parsuj i formatuj dane
  4. Scal w jeden spójny KG
  5. Zapisz do JSON
=====================================================
"""

import json
import re
from datetime import datetime
from typing import Dict, List, Optional
from collections import Counter

# ===== CONFIG =====
ENTITIES_FILE = "entities.json"
EXTRACTED_DATA_FILE = "extracted_data.txt"
OUTPUT_FILE = "kg_output.json"

KEYWORD = "jak obniżyć kortyzol po 40tce?"
LANG = "pl"

print("=" * 60)
print("🔧 KNOWLEDGE GRAPH ASSEMBLER v3.0")
print(f"   Input 1: {ENTITIES_FILE} (encje + relacje)")
print(f"   Input 2: {EXTRACTED_DATA_FILE} (fakty, measurables, ideations)")
print(f"   Output: {OUTPUT_FILE}")
print("=" * 60)


# ===== FILE OPERATIONS =====

def load_json_file(filepath: str) -> Optional[Dict]:
    """Load JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ Loaded JSON: {filepath}")
        return data
    except FileNotFoundError:
        print(f"❌ File not found: {filepath}")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error in {filepath}: {e}")
        return None
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None


def load_text_file(filepath: str) -> Optional[str]:
    """Load text file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"✅ Loaded TXT: {filepath} ({len(content):,} chars)")
        return content
    except FileNotFoundError:
        print(f"❌ File not found: {filepath}")
        return None
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None


def save_json_file(filepath: str, data: Dict) -> bool:
    """Save JSON file."""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, ensure_ascii=False, indent=2, fp=f)
        print(f"✅ Saved: {filepath}")
        return True
    except Exception as e:
        print(f"❌ Error saving {filepath}: {e}")
        return False


# ===== PARSE EXTRACTED DATA =====

def parse_extracted_data(text: str) -> Dict[str, List[str]]:
    """
    Parse extracted_data.txt into sections.
    
    Expected format:
    #Facts
    - fact 1
    - fact 2
    
    #Measurable data
    - measurable 1
    
    #Ideations
    - ideation 1
    """
    result = {
        "facts": [],
        "measurables": [],
        "ideations": []
    }
    
    current_section = None
    
    for line in text.split('\n'):
        line = line.strip()
        
        # Detect section headers
        line_lower = line.lower()
        if line_lower.startswith('#fact'):
            current_section = 'facts'
            continue
        elif line_lower.startswith('#measurable') or line_lower.startswith('#dane mierzalne'):
            current_section = 'measurables'
            continue
        elif line_lower.startswith('#ideation') or line_lower.startswith('#pomysł'):
            current_section = 'ideations'
            continue
        elif line.startswith('#'):
            # Other header - skip
            continue
        
        # Parse items (lines starting with -)
        if current_section and line.startswith('-'):
            item = line[1:].strip()
            if item and len(item) > 3:
                result[current_section].append(item)
    
    print(f"   📋 Parsed: {len(result['facts'])} facts, {len(result['measurables'])} measurables, {len(result['ideations'])} ideations")
    
    return result


# ===== FORMAT DATA =====

def format_facts(raw_facts: List[str]) -> List[Dict]:
    """Format facts with IDs."""
    facts = []
    
    for idx, fact in enumerate(raw_facts, 1):
        fact = fact.strip()
        if not fact:
            continue
        
        facts.append({
            "fact_id": f"F{idx:03d}",
            "fact": fact
        })
    
    return facts


def format_measurables(raw_measurables: List[str]) -> List[Dict]:
    """Format measurables with IDs."""
    measurables = []
    
    for idx, meas in enumerate(raw_measurables, 1):
        meas = meas.strip()
        if not meas:
            continue
        
        # Try to extract value and unit: "Description - [Value][unit]"
        match = re.search(r'\[([^\]]+)\]\s*\[([^\]]+)\]', meas)
        
        if match:
            value = match.group(1)
            unit = match.group(2)
            description = meas[:match.start()].strip(' -')
            
            measurables.append({
                "measurable_id": f"M{idx:03d}",
                "measurable": meas,
                "description": description,
                "value": value,
                "unit": unit
            })
        else:
            measurables.append({
                "measurable_id": f"M{idx:03d}",
                "measurable": meas
            })
    
    return measurables


def format_ideations(raw_ideations: List[str]) -> List[Dict]:
    """Format ideations with IDs."""
    ideations = []
    
    for idx, idea in enumerate(raw_ideations, 1):
        idea = idea.strip()
        if not idea:
            continue
        
        ideations.append({
            "ideation_id": f"I{idx:03d}",
            "ideation": idea
        })
    
    return ideations


# ===== MAIN ASSEMBLY =====

def assemble_knowledge_graph():
    """Main function to assemble Knowledge Graph."""
    
    print("\n" + "=" * 60)
    print("🚀 ASSEMBLING KNOWLEDGE GRAPH")
    print("=" * 60)
    
    # 1. Load entities.json (from NER Builder)
    print("\n📥 Loading NER data...")
    ner_data = load_json_file(ENTITIES_FILE)
    
    if not ner_data:
        print("❌ Cannot proceed without entities.json")
        return None
    
    entities = ner_data.get("entities", [])
    relationships = ner_data.get("entities_relationships", [])
    ner_meta = ner_data.get("meta", {})
    
    print(f"   Entities: {len(entities)}")
    print(f"   Relationships: {len(relationships)}")
    
    # 2. Load extracted_data.txt (from Data Extractor)
    print("\n📥 Loading extracted data...")
    extracted_text = load_text_file(EXTRACTED_DATA_FILE)
    
    if not extracted_text:
        print("⚠️ No extracted data file, continuing with entities only")
        parsed_data = {"facts": [], "measurables": [], "ideations": []}
    else:
        parsed_data = parse_extracted_data(extracted_text)
    
    # 3. Format data
    print("\n🔧 Formatting data...")
    
    facts = format_facts(parsed_data["facts"])
    measurables = format_measurables(parsed_data["measurables"])
    ideations = format_ideations(parsed_data["ideations"])
    
    print(f"   Facts: {len(facts)}")
    print(f"   Measurables: {len(measurables)}")
    print(f"   Ideations: {len(ideations)}")
    
    # 4. Determine main entity (most connected)
    main_entity = ""
    if entities:
        entity_rel_count = {}
        for rel in relationships:
            e2t = rel.get("entity_id2text", [])
            for name in e2t:
                entity_rel_count[name.lower()] = entity_rel_count.get(name.lower(), 0) + 1
        
        if entity_rel_count:
            main_entity_lower = max(entity_rel_count, key=entity_rel_count.get)
            for e in entities:
                if e.get("entity_name", "").lower() == main_entity_lower:
                    main_entity = e.get("entity_name", "")
                    break
    
    if not main_entity:
        main_entity = "Kortyzol"
    
    # 5. Build Knowledge Graph
    print("\n📦 Building Knowledge Graph...")
    
    kg = {
        "meta": {
            "main_keyword": ner_meta.get("keyword", KEYWORD),
            "main_entity": main_entity,
            "category": "health",
            "language": ner_meta.get("language", LANG),
            "generated_at": datetime.now().isoformat(),
            "sources": {
                "ner_file": ENTITIES_FILE,
                "extracted_file": EXTRACTED_DATA_FILE
            },
            "counts": {
                "entities": len(entities),
                "relationships": len(relationships),
                "facts": len(facts),
                "measurables": len(measurables),
                "ideations": len(ideations)
            }
        },
        "entities": entities,
        "entities_relationships": relationships,
        "facts": facts,
        "measurables": measurables,
        "ideations": ideations
    }
    
    # 6. Save
    print(f"\n💾 Saving to {OUTPUT_FILE}...")
    if save_json_file(OUTPUT_FILE, kg):
        print_statistics(kg)
        return kg
    
    return None


# ===== STATISTICS =====

def print_statistics(kg: Dict):
    """Print KG statistics."""
    print("\n" + "=" * 60)
    print("📊 KNOWLEDGE GRAPH STATISTICS")
    print("=" * 60)
    
    meta = kg.get("meta", {})
    counts = meta.get("counts", {})
    
    print(f"\n📋 META:")
    print(f"   Main keyword: {meta.get('main_keyword', 'N/A')}")
    print(f"   Main entity:  {meta.get('main_entity', 'N/A')}")
    print(f"   Language:     {meta.get('language', 'N/A')}")
    
    # Entities
    entities = kg.get("entities", [])
    print(f"\n🔷 ENTITIES: {len(entities)}")
    if entities:
        type_counts = Counter(e.get("type", "?") for e in entities)
        for t, c in type_counts.most_common(5):
            print(f"   {t:<15} {c:>3}")
        
        print(f"\n   Sample:")
        for e in entities[:5]:
            print(f"   • {e.get('entity_name', 'N/A')[:40]}")
    
    # Relationships
    relationships = kg.get("entities_relationships", [])
    print(f"\n🔗 RELATIONSHIPS: {len(relationships)}")
    if relationships:
        for r in relationships[:3]:
            print(f"   • {r.get('full_relationship', 'N/A')[:50]}")
    
    # Facts
    facts = kg.get("facts", [])
    print(f"\n📝 FACTS: {len(facts)}")
    for f in facts[:3]:
        print(f"   • {f.get('fact', 'N/A')[:60]}...")
    
    # Measurables
    measurables = kg.get("measurables", [])
    print(f"\n📈 MEASURABLES: {len(measurables)}")
    for m in measurables[:3]:
        print(f"   • {m.get('measurable', 'N/A')[:60]}...")
    
    # Ideations
    ideations = kg.get("ideations", [])
    print(f"\n💡 IDEATIONS: {len(ideations)}")
    for i in ideations[:3]:
        print(f"   • {i.get('ideation', 'N/A')[:60]}...")
    
    # Summary
    total = sum(counts.values())
    print("\n" + "-" * 60)
    print("📊 SUMMARY:")
    print(f"   {'Entities:':<20} {counts.get('entities', 0):>5}")
    print(f"   {'Relationships:':<20} {counts.get('relationships', 0):>5}")
    print(f"   {'Facts:':<20} {counts.get('facts', 0):>5}")
    print(f"   {'Measurables:':<20} {counts.get('measurables', 0):>5}")
    print(f"   {'Ideations:':<20} {counts.get('ideations', 0):>5}")
    print("-" * 60)
    print(f"   {'TOTAL ITEMS:':<20} {total:>5}")
    print("=" * 60)


# ===== RUN =====

if __name__ == "__main__":
    result = assemble_knowledge_graph()
    
    if result:
        print("\n✅ DONE!")
    else:
        print("\n❌ FAILED")