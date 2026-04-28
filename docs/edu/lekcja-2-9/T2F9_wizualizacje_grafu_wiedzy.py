#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================
KNOWLEDGE GRAPH VISUALIZER v3.0
=====================================================
Wizualizacja Knowledge Graph w 2D (PyVis) i 3D (Plotly).

Input: kg_output.json
Output:
  - kg_entities.html (2D - tylko encje i relacje)
  - kg_full.html (2D - pełny graf)
  - kg_3d.html (3D - interaktywna wizualizacja)

Requirements:
  pip install pyvis networkx plotly
=====================================================
"""

import json
import math
import random
from typing import Dict, List, Tuple
from collections import Counter

# ===== CONFIG =====
INPUT_FILE = "kg_output.json"

# Colors
COLORS = {
    "main_entity": "#e74c3c",    # Red
    "entity": "#3498db",          # Blue
    "PERSON": "#9b59b6",          # Purple
    "ORGANIZATION": "#2ecc71",    # Green
    "LOCATION": "#f1c40f",        # Yellow
    "PRODUCT": "#e67e22",         # Orange
    "TOPIC": "#3498db",           # Blue
    "PROCESS": "#1abc9c",         # Teal
    "SYMPTOM": "#e91e63",         # Pink
    "fact": "#f39c12",            # Orange
    "measurable": "#2ecc71",      # Green
    "ideation": "#e91e63",        # Pink
}

print("=" * 60)
print("🎨 KNOWLEDGE GRAPH VISUALIZER v3.0")
print(f"   Input: {INPUT_FILE}")
print("   Outputs: kg_entities.html, kg_full.html, kg_3d.html")
print("=" * 60)


# ===== LOAD DATA =====

def load_knowledge_graph(filepath: str) -> Dict:
    """Load knowledge graph from JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ Loaded: {filepath}")
        return data
    except Exception as e:
        print(f"❌ Error loading: {e}")
        return None


# ===== 2D VISUALIZATION (PyVis) =====

def visualize_entities_2d(kg: Dict, output_file: str = "kg_entities.html"):
    """2D visualization of entities and relationships only."""
    from pyvis.network import Network
    
    print(f"\n🎨 Generating 2D ENTITIES visualization...")
    
    net = Network(
        height="800px",
        width="100%",
        bgcolor="#1a1a2e",
        font_color="white",
        directed=True,
        notebook=True,
        cdn_resources='remote'
    )
    
    net.set_options("""
    {
        "nodes": {
            "font": {"size": 14, "face": "arial"}
        },
        "edges": {
            "color": {"inherit": true},
            "smooth": {"type": "continuous"}
        },
        "physics": {
            "forceAtlas2Based": {
                "gravitationalConstant": -50,
                "centralGravity": 0.01,
                "springLength": 150,
                "springConstant": 0.08
            },
            "solver": "forceAtlas2Based",
            "stabilization": {"iterations": 150}
        },
        "interaction": {
            "hover": true,
            "navigationButtons": true,
            "keyboard": true
        }
    }
    """)
    
    meta = kg.get("meta", {})
    main_entity = meta.get("main_entity", "").lower()
    
    # Add entities
    entities = kg.get("entities", [])
    entity_map = {}
    
    for e in entities:
        eid = e.get("entity_id", "")
        name = e.get("entity_name", "")
        etype = e.get("type", "TOPIC")
        desc = e.get("description", "")
        
        entity_map[name.lower()] = eid
        
        is_main = name.lower() == main_entity
        color = COLORS["main_entity"] if is_main else COLORS.get(etype, COLORS["entity"])
        size = 40 if is_main else 25
        
        net.add_node(
            eid,
            label=name[:25],
            title=f"🔷 {etype}\n{name}\n\n{desc}",
            color=color,
            size=size,
            font={"size": 16 if is_main else 12, "color": "white"}
        )
    
    # Add relationships
    relationships = kg.get("entities_relationships", [])
    for rel in relationships:
        e2t = rel.get("entity_id2text", [])
        if len(e2t) < 2:
            continue
        
        source_name = e2t[0]
        target_name = e2t[1]
        predicate = rel.get("predicate", "RELATED_TO")
        desc = rel.get("description", "")
        
        source_id = entity_map.get(source_name.lower())
        target_id = entity_map.get(target_name.lower())
        
        if source_id and target_id:
            net.add_edge(
                source_id,
                target_id,
                title=f"{predicate}\n{desc}",
                label=predicate[:15],
                arrows="to",
                color={"color": "#95a5a6", "highlight": "#e74c3c"}
            )
    
    net.save_graph(output_file)
    print(f"   ✅ Saved: {output_file}")
    print(f"      Nodes: {len(entities)} | Edges: {len(relationships)}")
    
    return output_file


def visualize_full_2d(kg: Dict, output_file: str = "kg_full.html"):
    """2D visualization with all elements (entities, facts, measurables, ideations)."""
    from pyvis.network import Network
    
    print(f"\n🎨 Generating 2D FULL visualization...")
    
    net = Network(
        height="900px",
        width="100%",
        bgcolor="#0f0f23",
        font_color="white",
        directed=True,
        notebook=True,
        cdn_resources='remote'
    )
    
    net.set_options("""
    {
        "nodes": {
            "font": {"size": 12, "face": "arial"}
        },
        "edges": {
            "smooth": {"type": "continuous"},
            "arrows": {"to": {"scaleFactor": 0.5}}
        },
        "physics": {
            "forceAtlas2Based": {
                "gravitationalConstant": -80,
                "centralGravity": 0.005,
                "springLength": 200,
                "springConstant": 0.05
            },
            "solver": "forceAtlas2Based",
            "stabilization": {"iterations": 200}
        },
        "interaction": {
            "hover": true,
            "navigationButtons": true
        }
    }
    """)
    
    meta = kg.get("meta", {})
    main_keyword = meta.get("main_keyword", "Knowledge Graph")
    main_entity = meta.get("main_entity", "").lower()
    
    # Central node (main keyword)
    net.add_node(
        "MAIN",
        label=main_keyword[:30],
        title=f"🎯 MAIN KEYWORD\n{main_keyword}",
        color="#e74c3c",
        size=50,
        font={"size": 18, "color": "white"},
        shape="star"
    )
    
    # Entities
    entities = kg.get("entities", [])
    entity_map = {}
    
    for e in entities:
        eid = e.get("entity_id", "")
        name = e.get("entity_name", "")
        etype = e.get("type", "TOPIC")
        desc = e.get("description", "")
        
        entity_map[name.lower()] = eid
        
        is_main = name.lower() == main_entity
        color = COLORS["main_entity"] if is_main else COLORS.get(etype, COLORS["entity"])
        
        net.add_node(
            eid,
            label=name[:20],
            title=f"📦 {etype}\n{name}\n\n{desc}",
            color=color,
            size=35 if is_main else 22
        )
        
        if is_main:
            net.add_edge("MAIN", eid, color="#e74c3c", width=3)
    
    # Entity relationships
    relationships = kg.get("entities_relationships", [])
    for rel in relationships:
        e2t = rel.get("entity_id2text", [])
        if len(e2t) < 2:
            continue
        
        source_id = entity_map.get(e2t[0].lower())
        target_id = entity_map.get(e2t[1].lower())
        predicate = rel.get("predicate", "")
        
        if source_id and target_id:
            net.add_edge(
                source_id, target_id,
                title=predicate,
                color={"color": "#5dade2", "highlight": "#3498db"},
                width=1.5
            )
    
    # Facts (limit for readability)
    facts = kg.get("facts", [])[:15]
    for f in facts:
        fid = f.get("fact_id", "")
        fact_text = f.get("fact", "")
        
        net.add_node(
            fid,
            label=f"F{fid[-2:]}",
            title=f"📝 FACT\n{fact_text}",
            color=COLORS["fact"],
            size=12,
            shape="diamond"
        )
        net.add_edge("MAIN", fid, color="#f39c12", width=0.5, dashes=True)
    
    # Measurables
    measurables = kg.get("measurables", [])[:10]
    for m in measurables:
        mid = m.get("measurable_id", "")
        meas_text = m.get("measurable", "")
        
        net.add_node(
            mid,
            label=f"M{mid[-2:]}",
            title=f"📊 MEASURABLE\n{meas_text}",
            color=COLORS["measurable"],
            size=12,
            shape="triangle"
        )
        net.add_edge("MAIN", mid, color="#2ecc71", width=0.5, dashes=True)
    
    # Ideations
    ideations = kg.get("ideations", [])[:10]
    for i in ideations:
        iid = i.get("ideation_id", "")
        idea_text = i.get("ideation", "")
        
        net.add_node(
            iid,
            label=f"I{iid[-2:]}",
            title=f"💡 IDEATION\n{idea_text}",
            color=COLORS["ideation"],
            size=12,
            shape="square"
        )
        net.add_edge("MAIN", iid, color="#e91e63", width=0.5, dashes=True)
    
    net.save_graph(output_file)
    
    total_nodes = 1 + len(entities) + len(facts) + len(measurables) + len(ideations)
    print(f"   ✅ Saved: {output_file}")
    print(f"      Total nodes: {total_nodes}")
    
    return output_file


# ===== 3D VISUALIZATION (Plotly) =====

def generate_3d_positions(n: int, spread: float = 10) -> List[Tuple[float, float, float]]:
    """Generate 3D positions using spherical distribution."""
    positions = []
    
    # Golden ratio for even distribution
    phi = (1 + math.sqrt(5)) / 2
    
    for i in range(n):
        y = 1 - (i / (n - 1)) * 2 if n > 1 else 0
        radius = math.sqrt(1 - y * y)
        theta = phi * i * 2 * math.pi
        
        x = math.cos(theta) * radius * spread
        z = math.sin(theta) * radius * spread
        y = y * spread
        
        # Add some randomness
        x += random.uniform(-1, 1)
        y += random.uniform(-1, 1)
        z += random.uniform(-1, 1)
        
        positions.append((x, y, z))
    
    return positions


def visualize_3d(kg: Dict, output_file: str = "kg_3d.html"):
    """3D interactive visualization using Plotly."""
    import plotly.graph_objects as go
    
    print(f"\n🎨 Generating 3D visualization...")
    
    meta = kg.get("meta", {})
    main_keyword = meta.get("main_keyword", "Knowledge Graph")
    main_entity = meta.get("main_entity", "").lower()
    
    entities = kg.get("entities", [])
    relationships = kg.get("entities_relationships", [])
    
    # Build node data
    node_ids = []
    node_names = []
    node_types = []
    node_colors = []
    node_sizes = []
    node_texts = []
    
    # Add main keyword as central node
    node_ids.append("MAIN")
    node_names.append(main_keyword[:30])
    node_types.append("MAIN")
    node_colors.append("#e74c3c")
    node_sizes.append(30)
    node_texts.append(f"🎯 {main_keyword}")
    
    # Add entities
    entity_map = {}
    for e in entities:
        eid = e.get("entity_id", "")
        name = e.get("entity_name", "")
        etype = e.get("type", "TOPIC")
        desc = e.get("description", "")
        
        entity_map[name.lower()] = len(node_ids)  # index
        
        is_main = name.lower() == main_entity
        
        node_ids.append(eid)
        node_names.append(name[:25])
        node_types.append(etype)
        node_colors.append(COLORS["main_entity"] if is_main else COLORS.get(etype, COLORS["entity"]))
        node_sizes.append(25 if is_main else 15)
        node_texts.append(f"📦 {etype}<br>{name}<br><br>{desc[:100]}")
    
    # Generate 3D positions
    n_nodes = len(node_ids)
    positions = generate_3d_positions(n_nodes, spread=15)
    
    # Center the main node
    positions[0] = (0, 0, 0)
    
    # Extract coordinates
    x_nodes = [p[0] for p in positions]
    y_nodes = [p[1] for p in positions]
    z_nodes = [p[2] for p in positions]
    
    # Build edge data
    x_edges = []
    y_edges = []
    z_edges = []
    edge_texts = []
    
    for rel in relationships:
        e2t = rel.get("entity_id2text", [])
        if len(e2t) < 2:
            continue
        
        source_idx = entity_map.get(e2t[0].lower())
        target_idx = entity_map.get(e2t[1].lower())
        
        if source_idx is not None and target_idx is not None:
            x_edges.extend([x_nodes[source_idx], x_nodes[target_idx], None])
            y_edges.extend([y_nodes[source_idx], y_nodes[target_idx], None])
            z_edges.extend([z_nodes[source_idx], z_nodes[target_idx], None])
    
    # Create edge trace
    edge_trace = go.Scatter3d(
        x=x_edges,
        y=y_edges,
        z=z_edges,
        mode='lines',
        line=dict(color='rgba(150, 150, 150, 0.5)', width=1),
        hoverinfo='none',
        name='Relationships'
    )
    
    # Create node trace
    node_trace = go.Scatter3d(
        x=x_nodes,
        y=y_nodes,
        z=z_nodes,
        mode='markers+text',
        marker=dict(
            size=node_sizes,
            color=node_colors,
            opacity=0.9,
            line=dict(color='white', width=1)
        ),
        text=node_names,
        textposition='top center',
        textfont=dict(size=10, color='white'),
        hovertext=node_texts,
        hoverinfo='text',
        name='Entities'
    )
    
    # Create figure
    fig = go.Figure(data=[edge_trace, node_trace])
    
    # Layout
    fig.update_layout(
        title=dict(
            text=f"🧠 Knowledge Graph 3D: {main_keyword}",
            font=dict(size=20, color='white'),
            x=0.5
        ),
        showlegend=False,
        paper_bgcolor='#0f0f23',
        plot_bgcolor='#0f0f23',
        scene=dict(
            xaxis=dict(
                showgrid=False,
                showticklabels=False,
                showaxeslabels=False,
                visible=False
            ),
            yaxis=dict(
                showgrid=False,
                showticklabels=False,
                showaxeslabels=False,
                visible=False
            ),
            zaxis=dict(
                showgrid=False,
                showticklabels=False,
                showaxeslabels=False,
                visible=False
            ),
            bgcolor='#0f0f23',
            camera=dict(
                eye=dict(x=1.5, y=1.5, z=1.5)
            )
        ),
        margin=dict(l=0, r=0, t=50, b=0),
        hoverlabel=dict(
            bgcolor='#1a1a2e',
            font_size=12,
            font_color='white'
        )
    )
    
    # Save
    fig.write_html(output_file, include_plotlyjs='cdn')
    
    print(f"   ✅ Saved: {output_file}")
    print(f"      Nodes: {n_nodes} | Edges: {len(relationships)}")
    
    return output_file


# ===== DISPLAY IN COLAB =====

def display_in_colab(html_file: str):
    """Display HTML visualization in Colab."""
    from IPython.display import display, IFrame, HTML
    
    try:
        display(IFrame(html_file, width=1000, height=800))
    except:
        with open(html_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
        display(HTML(html_content))


# ===== MAIN =====

def main():
    print("\n" + "=" * 60)
    print("🚀 STARTING VISUALIZATION")
    print("=" * 60)
    
    # Load data
    kg = load_knowledge_graph(INPUT_FILE)
    if not kg:
        print("❌ Cannot proceed without kg_output.json")
        return
    
    # Print summary
    meta = kg.get("meta", {})
    counts = meta.get("counts", {})
    
    print(f"\n📋 Graph: {meta.get('main_keyword', 'N/A')}")
    print(f"   Entities: {counts.get('entities', 0)}")
    print(f"   Relationships: {counts.get('relationships', 0)}")
    print(f"   Facts: {counts.get('facts', 0)}")
    print(f"   Measurables: {counts.get('measurables', 0)}")
    print(f"   Ideations: {counts.get('ideations', 0)}")
    
    # Generate visualizations
    print("\n" + "-" * 60)
    
    # 1. Entities only (2D)
    viz1 = visualize_entities_2d(kg, "kg_entities.html")
    
    # 2. Full graph (2D)
    viz2 = visualize_full_2d(kg, "kg_full.html")
    
    # 3. 3D visualization
    viz3 = visualize_3d(kg, "kg_3d.html")
    
    print("\n" + "=" * 60)
    print("✅ GENERATED FILES:")
    print("   • kg_entities.html - 2D encje i relacje (PyVis)")
    print("   • kg_full.html     - 2D pełny graf (PyVis)")
    print("   • kg_3d.html       - 3D interaktywny (Plotly)")
    print("=" * 60)
    
    print("\n📌 Aby wyświetlić w Colab:")
    print('   display_in_colab("kg_entities.html")')
    print('   display_in_colab("kg_full.html")')
    print('   display_in_colab("kg_3d.html")')
    
    return viz1, viz2, viz3


# ===== RUN =====

if __name__ == "__main__":
    main()