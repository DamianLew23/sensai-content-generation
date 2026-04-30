import type { DraftImagePrompt } from "@sensai/shared";

const INLINE_TYPES = ["tabela", "checklist", "lista", "porównanie", "porownanie", "schemat"];
const EXTERNAL_TYPES = ["infografika", "wykres", "diagram", "grafika"];

export interface InlineIdeation {
  type: string;
  description: string;
  formatInstruction: string;
}

export interface IdeationSplit {
  inline: InlineIdeation[];
  external: DraftImagePrompt[];
}

function isType(actual: string, candidates: string[]): boolean {
  return candidates.some((c) => actual === c || actual.includes(c));
}

function inlineInstruction(ideaType: string, description: string): string {
  if (ideaType.includes("tabela") || ideaType.includes("porown") || ideaType.includes("porów")) {
    return `Generate as HTML <table> with headers: ${description}`;
  }
  if (ideaType.includes("checklist") || ideaType.includes("lista")) {
    return `Generate as HTML <ul> checklist: ${description}`;
  }
  if (ideaType.includes("schemat")) {
    return `Generate as structured HTML list/steps: ${description}`;
  }
  return `Inline content: ${description}`;
}

export function splitIdeations(
  ideations: Array<{ type?: string; description?: string; title?: string }>,
  sectionHeader: string,
): IdeationSplit {
  const inline: InlineIdeation[] = [];
  const external: DraftImagePrompt[] = [];

  for (const idea of ideations) {
    const ideaType = (idea.type ?? "").toLowerCase();
    const desc = idea.description ?? idea.title ?? "";

    if (isType(ideaType, EXTERNAL_TYPES)) {
      external.push({
        sectionHeader,
        ideationType: ideaType,
        description: desc,
        prompt:
          `Create an infographic: ${desc}. ` +
          `Context: article section '${sectionHeader}'. ` +
          `Style: clean, professional, data-focused.`,
      });
    } else if (isType(ideaType, INLINE_TYPES)) {
      inline.push({ type: ideaType, description: desc, formatInstruction: inlineInstruction(ideaType, desc) });
    } else {
      // unknown → safe default = inline as informational content
      inline.push({ type: ideaType, description: desc, formatInstruction: `Inline content: ${desc}` });
    }
  }

  return { inline, external };
}
