import { z } from "zod";

export const ScrapeParams = z.object({
  url: z.string().url(),
});
export type ScrapeParams = z.infer<typeof ScrapeParams>;

export const PAGE_MARKDOWN_CAP = 15_000;
