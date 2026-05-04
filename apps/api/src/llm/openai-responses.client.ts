import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { CostTrackerService } from "./cost-tracker.service";
import { calculateCostUsd } from "./pricing";

interface CallCtx {
  runId: string;
  stepId: string;
  attempt: number;
}

interface CreateBlockArgs {
  ctx: CallCtx;
  model: string;
  system: string;
  input: string;
  previousResponseId?: string;
  reasoning?: { effort: "low" | "medium" | "high" };
  verbosity?: "low" | "medium" | "high";
}

export interface CreateBlockResult {
  id: string;
  outputText: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

const CALL_TIMEOUT_MS = 240_000; // 4 min — reasoning calls can be slow

@Injectable()
export class OpenAIResponsesClient {
  private readonly logger = new Logger(OpenAIResponsesClient.name);

  constructor(
    @Inject("OPENAI_RESPONSES_SDK") private readonly sdk: OpenAI,
    private readonly cost: CostTrackerService,
  ) {}

  async createBlock(args: CreateBlockArgs): Promise<CreateBlockResult> {
    const t0 = Date.now();

    const params: ResponseCreateParamsNonStreaming = {
      model: args.model,
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.input },
      ],
    };
    if (args.previousResponseId) params.previous_response_id = args.previousResponseId;
    if (args.reasoning) params.reasoning = args.reasoning;
    if (args.verbosity) params.text = { verbosity: args.verbosity };

    const response: Response = await this.sdk.responses.create(params, {
      timeout: CALL_TIMEOUT_MS,
    });

    const latencyMs = Date.now() - t0;
    const promptTokens = response.usage?.input_tokens ?? 0;
    const completionTokens = response.usage?.output_tokens ?? 0;
    // OpenAI returns date-versioned model names ("gpt-5.2-2025-12-11"); price table
    // is keyed by the requested name, so use args.model for cost lookup. Keep the
    // versioned response.model for audit.
    const model = response.model ?? args.model;
    const costUsd = calculateCostUsd(args.model, promptTokens, completionTokens);
    const outputText = response.output_text ?? "";
    const id = response.id;

    await this.cost.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openai",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });

    this.logger.log(
      {
        call: "draft.responses",
        model,
        responseId: id,
        promptTokens,
        completionTokens,
        costUsd,
        latencyMs,
      },
      "openai responses call",
    );

    return { id, outputText, model, promptTokens, completionTokens, costUsd, latencyMs };
  }
}
