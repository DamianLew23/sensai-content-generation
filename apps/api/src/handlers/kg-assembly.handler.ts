import { Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  EntityExtractionResult,
  ExtractionResult,
  type RunInput,
} from "@sensai/shared";
import { assemble } from "../tools/kg-assembler/kg-assembler";

@Injectable()
export class KGAssemblyHandler implements StepHandler {
  readonly type = "tool.kg.assemble";
  private readonly logger = new Logger(KGAssemblyHandler.name);

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevEntities = ctx.previousOutputs.entities;
    if (prevEntities === undefined || prevEntities === null) {
      throw new Error("kg.assemble requires previousOutputs.entities");
    }
    const prevExtract = ctx.previousOutputs.extract;
    if (prevExtract === undefined || prevExtract === null) {
      throw new Error("kg.assemble requires previousOutputs.extract");
    }

    const entities = EntityExtractionResult.parse(prevEntities);
    const extract = ExtractionResult.parse(prevExtract);

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = entities.metadata.language;

    const kg = assemble({ keyword, language, entities, extract });

    if (kg.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: kg.warnings },
        `kg.assemble: ${kg.warnings.length} warnings during assembly`,
      );
    }

    this.logger.log(
      {
        entities: kg.meta.counts.entities,
        relationships: kg.meta.counts.relationships,
        facts: kg.meta.counts.facts,
        measurables: kg.meta.counts.measurables,
        ideations: kg.meta.counts.ideations,
        warnings: kg.warnings.length,
      },
      "kg-assemble done",
    );

    return { output: kg };
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
