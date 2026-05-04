import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { draftGeneratePrompt } from "../../prompts/draft-generate.prompt";
import { detectPassageFormat } from "./draft-generator.headings";
import { splitIdeations } from "./draft-generator.ideations";
import type {
  DistributionResult,
  DraftBlockStats,
  DraftImagePrompt,
  DraftWarning,
} from "@sensai/shared";
import type { EnrichedSection } from "./draft-generator.types";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  | "DRAFT_GENERATE_MODEL"
  | "DRAFT_GENERATE_USE_REASONING"
  | "DRAFT_GENERATE_REASONING_EFFORT"
  | "DRAFT_GENERATE_VERBOSITY"
  | "DRAFT_GENERATE_BLOCK_DELAY_MS"
>;

interface CallCtx { runId: string; stepId: string; attempt: number }

interface GenerateArgs {
  ctx: CallCtx;
  distribution: DistributionResult;
}

export interface GenerateResult {
  htmlChunks: string[];
  blocks: DraftBlockStats[];
  imagePrompts: DraftImagePrompt[];
  warnings: DraftWarning[];
}

const SHORT_BLOCK_THRESHOLD = 200; // chars

@Injectable()
export class DraftGeneratorClient {
  private readonly logger = new Logger(DraftGeneratorClient.name);

  constructor(
    private readonly openai: OpenAIResponsesClient,
    @Inject("DRAFT_GENERATOR_ENV") private readonly env: ClientEnv,
  ) {}

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const { distribution, ctx } = args;
    const lang = distribution.meta.language;
    const useReasoning = this.env.DRAFT_GENERATE_USE_REASONING;

    // 1. Enrich sections (passage format + ideation split)
    const allImagePrompts: DraftImagePrompt[] = [];
    const enriched: EnrichedSection[] = distribution.sections.map((s) => {
      const passageFormat = detectPassageFormat(
        s.type === "intro" ? null : s.header,
        (s as any).sourceIntent,
        lang,
      );

      const h3sEnriched = s.h3s.map((h3) => ({
        header: h3.header,
        passageFormat: detectPassageFormat(h3.header, undefined, lang),
      }));

      const sectionHeader = (s as any).header ?? "Introduction";
      const ideations = (s as any).ideations ?? [];
      const split = splitIdeations(ideations, sectionHeader);
      allImagePrompts.push(...split.external);

      return {
        ...s,
        _passageFormat: passageFormat,
        _h3sEnriched: h3sEnriched,
        _inlineIdeations: split.inline,
        _externalIdeations: split.external,
      } as EnrichedSection;
    });

    // 2. Sequential LLM calls with chaining
    const warnings: DraftWarning[] = [];
    const blocks: DraftBlockStats[] = [];
    const htmlChunks: string[] = [];
    let prevResponseId: string | undefined;

    if (!useReasoning) {
      warnings.push({
        kind: "draft_chaining_disabled",
        message:
          "DRAFT_GENERATE_USE_REASONING=false — calling without previous_response_id chaining and without reasoning/verbosity params.",
        context: { model: this.env.DRAFT_GENERATE_MODEL },
      });
    }

    for (let i = 0; i < enriched.length; i++) {
      const section = enriched[i];

      const userPrompt = draftGeneratePrompt.user({
        blockNumber: i + 1,
        currentSectionIndex: i,
        allSections: enriched,
        block: section,
        keyword: distribution.meta.keyword,
        h1Title: distribution.meta.h1Title,
        language: lang,
      });

      const callArgs = {
        ctx,
        model: this.env.DRAFT_GENERATE_MODEL,
        system: draftGeneratePrompt.system,
        input: userPrompt,
        previousResponseId: useReasoning ? prevResponseId : undefined,
        reasoning: useReasoning
          ? { effort: this.env.DRAFT_GENERATE_REASONING_EFFORT }
          : undefined,
        verbosity: useReasoning ? this.env.DRAFT_GENERATE_VERBOSITY : undefined,
      };

      const res = await this.openai.createBlock(callArgs);
      const cleaned = res.outputText.replace(/<p>\s*<\/p>/g, "");
      htmlChunks.push(cleaned);
      prevResponseId = res.id;

      blocks.push({
        sectionOrder: section.order,
        sectionType: section.type,
        sectionVariant: section.type === "h2" ? section.sectionVariant : null,
        header: section.type === "intro" ? null : section.header,
        passageTrigger: section._passageFormat.trigger,
        charCount: cleaned.length,
        responseId: res.id,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
      });

      if (cleaned.length < SHORT_BLOCK_THRESHOLD) {
        warnings.push({
          kind: "draft_short_block",
          message: `Block ${i + 1} produced only ${cleaned.length} chars`,
          blockOrder: section.order,
          context: { responseId: res.id },
        });
      }

      // Rate-limit pause (skip after last block)
      if (i < enriched.length - 1 && this.env.DRAFT_GENERATE_BLOCK_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, this.env.DRAFT_GENERATE_BLOCK_DELAY_MS));
      }
    }

    if (allImagePrompts.length === 0) {
      warnings.push({
        kind: "draft_no_image_prompts",
        message: "No infografika/wykres ideations were present in the distribution.",
        context: {},
      });
    }

    this.logger.log(
      {
        call: "draft.generate",
        blockCount: blocks.length,
        totalChars: htmlChunks.reduce((s, c) => s + c.length, 0),
        warningCount: warnings.length,
        imagePromptCount: allImagePrompts.length,
      },
      "draft generator finished",
    );

    return {
      htmlChunks,
      blocks,
      imagePrompts: allImagePrompts,
      warnings,
    };
  }
}
