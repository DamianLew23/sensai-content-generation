import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  DEFAULT_MODEL: z.string().default("openai/gpt-5-mini"),
  API_BEARER_TOKEN: z.string().min(1),
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  FIRECRAWL_API_KEY: z.string().min(1),
  FIRECRAWL_BASE_URL: z.string().url().default("https://api.firecrawl.dev"),
  CRAWL4AI_BASE_URL: z.string().url(),
  CRAWL4AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  YOUCOM_API_KEY: z.string().min(1),
  YOUCOM_BASE_URL: z.string().url().default("https://api.you.com"),
  YOUCOM_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  YOUCOM_DEFAULT_EFFORT: z.enum(["lite", "standard", "deep", "exhaustive"]).default("deep"),
  YOUCOM_COST_LITE: z.coerce.number().nonnegative().default(0.02),
  YOUCOM_COST_STANDARD: z.coerce.number().nonnegative().default(0.05),
  YOUCOM_COST_DEEP: z.coerce.number().nonnegative().default(0.15),
  YOUCOM_COST_EXHAUSTIVE: z.coerce.number().nonnegative().default(0.40),
  OPENAI_API_KEY: z.string().min(1),
  CLEANING_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  CLEANING_BLOCK_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  CLEANING_PARAGRAPH_KEYWORD_THRESHOLD: z.coerce.number().min(0).max(1).default(0.4),
  CLEANING_LENGTH_DIFF_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  CLEANING_TARGET_CHAR_LIMIT: z.coerce.number().int().positive().default(50_000),
  CLEANING_MIN_PARAGRAPH_LENGTH: z.coerce.number().int().positive().default(60),
  CLEANING_COST_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.02),
  MAX_COST_PER_RUN_USD: z.string().default("5"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = result.data;
  return cached;
}
