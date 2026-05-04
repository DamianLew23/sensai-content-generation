import { describe, it, expect } from "vitest";
import { splitIdeations } from "../tools/draft-generator/draft-generator.ideations";

describe("splitIdeations", () => {
  it("classifies tabela/checklist/lista as inline with formatting instructions", () => {
    const { inline, external } = splitIdeations(
      [
        { id: "I1", type: "tabela", title: "Porównanie", description: "Adaptogeny vs SSRI", priority: "high" } as any,
        { id: "I2", type: "checklist", title: "Lista", description: "Codzienna rutyna snu", priority: "medium" } as any,
        { id: "I3", type: "lista", title: "L", description: "Adaptogeny", priority: "low" } as any,
      ],
      "Sekcja testowa",
    );
    expect(inline).toHaveLength(3);
    expect(inline[0].formatInstruction).toContain("<table>");
    expect(inline[1].formatInstruction).toContain("<ul>");
    expect(external).toHaveLength(0);
  });

  it("classifies infografika/wykres/diagram as external image prompts", () => {
    const { inline, external } = splitIdeations(
      [
        { id: "I1", type: "infografika", title: "Mechanizm", description: "Schemat HPA-axis", priority: "high" } as any,
        { id: "I2", type: "wykres", title: "Krzywa kortyzolu", description: "Cortisol over 24h", priority: "high" } as any,
      ],
      "Sekcja kortyzol",
    );
    expect(inline).toHaveLength(0);
    expect(external).toHaveLength(2);
    expect(external[0].sectionHeader).toBe("Sekcja kortyzol");
    expect(external[0].prompt).toContain("Schemat HPA-axis");
    expect(external[0].prompt).toContain("Sekcja kortyzol");
  });

  it("treats unknown types as inline (safe default)", () => {
    const { inline, external } = splitIdeations(
      [{ id: "I1", type: "info_box", title: "T", description: "Custom box", priority: "medium" } as any],
      "Sekcja",
    );
    expect(inline).toHaveLength(1);
    expect(external).toHaveLength(0);
  });
});
