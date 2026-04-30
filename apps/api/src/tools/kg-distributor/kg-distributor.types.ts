import { z } from "zod";

export const LLMSectionMapping = z.object({
  entityIds: z.string().array(),
  factIds: z.string().array(),
  relationshipIds: z.string().array(),
  ideationIds: z.string().array(),
  measurableIds: z.string().array(),
});
export type LLMSectionMapping = z.infer<typeof LLMSectionMapping>;

export const LLMDistributionMapping = z.object({
  distribution: z.record(z.string().regex(/^\d+$/), LLMSectionMapping),
});
export type LLMDistributionMapping = z.infer<typeof LLMDistributionMapping>;
