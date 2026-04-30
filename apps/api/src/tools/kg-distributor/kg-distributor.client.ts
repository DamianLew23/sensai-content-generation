import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { outlineDistributePrompt } from "../../prompts/outline-distribute.prompt";
import { LLMDistributionMapping } from "./kg-distributor.types";
import type { OutlineGenerationResult, KnowledgeGraph } from "@sensai/shared";

type ClientEnv = Pick<Env, "OUTLINE_DISTRIBUTE_MODEL">;

interface CallCtx { runId: string; stepId: string; attempt: number }

interface DistributeArgs {
  ctx: CallCtx;
  outline: OutlineGenerationResult;
  kg: KnowledgeGraph;
}

@Injectable()
export class KGDistributorClient {
  private readonly logger = new Logger(KGDistributorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("KG_DISTRIBUTOR_ENV") private readonly env: ClientEnv,
  ) {}

  async distribute(args: DistributeArgs) {
    const outlineForPrompt = args.outline.outline.map((s) => {
      if (s.type === "intro") {
        return { order: 0, type: "intro" as const, header: "INTRO" };
      }
      if (s.sectionVariant === "full") {
        return {
          order: s.order,
          type: "h2" as const,
          sectionVariant: "full" as const,
          sourceIntent: s.sourceIntent,
          header: s.header,
          h3s: s.h3s.map((h) => h.header),
        };
      }
      return {
        order: s.order,
        type: "h2" as const,
        sectionVariant: "context" as const,
        sourceIntent: s.sourceIntent,
        header: s.header,
        groupedAreas: s.groupedAreas,
        contextNote: s.contextNote,
      };
    });

    const entitiesForPrompt = args.kg.entities.map((e) => ({
      id: e.id,
      entity: e.entity,
      domainType: e.domainType,
      evidence: e.evidence,
    }));
    const factsForPrompt = args.kg.facts.map((f) => ({
      id: f.id,
      text: f.text,
      category: f.category,
    }));
    const relsForPrompt = args.kg.relationships.map((r) => ({
      id: r.id,
      sourceName: r.sourceName,
      type: r.type,
      targetName: r.targetName,
    }));
    const ideasForPrompt = args.kg.ideations.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
    }));
    const measurablesForPrompt = args.kg.measurables.map((m) => ({
      id: m.id,
      definition: m.definition,
      value: m.value,
      unit: m.unit,
      formatted: m.formatted,
    }));

    const userPrompt = outlineDistributePrompt.user({
      outlineJson: JSON.stringify(outlineForPrompt, null, 2),
      entitiesJson: JSON.stringify(entitiesForPrompt, null, 2),
      factsJson: JSON.stringify(factsForPrompt, null, 2),
      relationshipsJson: JSON.stringify(relsForPrompt, null, 2),
      ideationsJson: JSON.stringify(ideasForPrompt, null, 2),
      measurablesJson: JSON.stringify(measurablesForPrompt, null, 2),
    });

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.OUTLINE_DISTRIBUTE_MODEL },
      system: outlineDistributePrompt.system,
      prompt: userPrompt,
      schema: LLMDistributionMapping,
    });

    this.logger.log(
      {
        call: "outline-distribute",
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        sectionsMapped: Object.keys((res.object as any).distribution ?? {}).length,
      },
      "kg-distributor LLM call",
    );

    return {
      result: res.object as LLMDistributionMapping,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
