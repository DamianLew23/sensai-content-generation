import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
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
  YOUCOM_DEFAULT_EFFORT: z
    .enum(["lite", "standard", "deep", "exhaustive"])
    .default("deep"),
  YOUCOM_COST_LITE: z.coerce.number().nonnegative().default(0.02),
  YOUCOM_COST_STANDARD: z.coerce.number().nonnegative().default(0.05),
  YOUCOM_COST_DEEP: z.coerce.number().nonnegative().default(0.15),
  YOUCOM_COST_EXHAUSTIVE: z.coerce.number().nonnegative().default(0.4),
  OPENAI_API_KEY: z.string().min(1),
  CLEANING_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  CLEANING_BLOCK_SIMILARITY_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.85),
  CLEANING_PARAGRAPH_KEYWORD_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.4),
  CLEANING_LENGTH_DIFF_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  CLEANING_TARGET_CHAR_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(50_000),
  CLEANING_MIN_PARAGRAPH_LENGTH: z.coerce.number().int().positive().default(60),
  CLEANING_COST_PER_1M_TOKENS: z.coerce.number().nonnegative().default(0.02),
  CONTENT_EXTRACT_MODEL: z.string().default("google/gemini-3-flash-preview"),
  CONTENT_EXTRACT_LANGUAGE: z.string().min(2).max(10).default("pl"),
  CONTENT_EXTRACT_MIN_FACTS: z.coerce.number().int().positive().default(15),
  CONTENT_EXTRACT_MIN_DATA: z.coerce.number().int().positive().default(8),
  CONTENT_EXTRACT_MIN_IDEATIONS: z.coerce.number().int().positive().default(5),
  CONTENT_EXTRACT_MAX_INPUT_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  ENTITY_EXTRACT_MODEL: z.string().default("google/gemini-3-flash-preview"),
  ENTITY_EXTRACT_LANGUAGE: z.string().min(2).max(10).default("pl"),
  ENTITY_EXTRACT_MIN_ENTITIES: z.coerce.number().int().positive().default(10),
  ENTITY_EXTRACT_MIN_RELATIONS: z.coerce.number().int().positive().default(5),
  ENTITY_EXTRACT_MAX_INPUT_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  QUERY_FANOUT_MODEL: z.string().default("openai/gpt-5.4"),
  QUERY_FANOUT_LANGUAGE: z.string().min(2).max(10).default("pl"),
  QUERY_FANOUT_MAX_AREAS_PER_INTENT: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .default(5),
  QUERY_FANOUT_PAA_DEPTH: z.coerce.number().int().min(1).max(4).default(2),
  QUERY_FANOUT_PAA_MAX_QUESTIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  QUERY_FANOUT_PAA_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
    .default(true),
  QUERY_FANOUT_REASONING_INTENTS: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  QUERY_FANOUT_REASONING_CLASSIFY: z
    .enum(["low", "medium", "high"])
    .default("high"),
  QUERY_FANOUT_REASONING_PAA: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  OUTLINE_GENERATE_MODEL: z.string().default("openai/gpt-5.4"),
  OUTLINE_GENERATE_REASONING: z.enum(["low", "medium", "high"]).default("medium"),
  OUTLINE_GENERATE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  OUTLINE_DISTRIBUTE_MODEL: z.string().default("google/gemini-3-flash-preview"),
  OUTLINE_DISTRIBUTE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // ----- Plan 13 — Draft Generation -----
  DRAFT_GENERATE_MODEL: z.string().default("gpt-5.2"),
  DRAFT_GENERATE_USE_REASONING: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
    .default(true),
  DRAFT_GENERATE_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  DRAFT_GENERATE_VERBOSITY: z.enum(["low", "medium", "high"]).default("medium"),
  DRAFT_GENERATE_BLOCK_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(800),
  DRAFT_GENERATE_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  // ----- Plan 14 — Data Enrichment -----
  DATA_ENRICH_VERIFY_MODEL: z.string().default("gpt-5.2"),
  DATA_ENRICH_QUESTION_MODEL: z.string().default("gpt-4.1-mini"),
  DATA_ENRICH_MAX_CLAIMS: z.coerce.number().int().min(1).max(50).default(15),
  DATA_ENRICH_MIN_SCORE: z.coerce.number().int().min(1).max(10).default(2),
  DATA_ENRICH_LOW_CONFIRM_WARNING: z.coerce.number().min(0).max(1).default(0.2),
  DATA_ENRICH_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  // ----- Plan 15 — Article Optimize + Intermediate -----
  ARTICLE_OPTIMIZE_MODEL: z.string().default("gpt-5.2"),
  ARTICLE_OPTIMIZE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
  ARTICLE_INTERMEDIATE_MODEL: z.string().default("gpt-5.2"),
  ARTICLE_INTERMEDIATE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
  ARTICLE_INTERMEDIATE_MAX_GROWTH: z.coerce.number().nonnegative().default(0.10),
  // ----- Plan 16 — Article Humanize -----
  ARTICLE_HUMANIZE_MODEL: z.string().default("gpt-5.2"),
  ARTICLE_HUMANIZE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
  ARTICLE_HUMANIZE_ASL_MIN: z.coerce.number().int().positive().default(12),
  ARTICLE_HUMANIZE_ASL_MAX: z.coerce.number().int().positive().default(20),
  ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: z.coerce.number().int().positive().default(24),
  ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: z.coerce.number().int().nonnegative().default(1),
  ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: z.coerce.number().int().positive().default(4),
  ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: z.coerce.number().int().positive().default(500),
  ARTICLE_HUMANIZE_BOLD_SHARE_MAX: z.coerce.number().nonnegative().default(0.08),
  ARTICLE_HUMANIZE_MIN_LEN_RATIO: z.coerce.number().nonnegative().default(0.80),
  ARTICLE_HUMANIZE_MAX_LEN_RATIO: z.coerce.number().nonnegative().default(1.20),
  ARTICLE_HUMANIZE_RETRY_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
    .default(true),
  ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: z.coerce.number().int().nonnegative().default(8),
  // ----- Plan 17 — Topic Disambiguator -----
  DISAMBIGUATE_MODEL: z.string().default("openai/gpt-5-mini"),
  DISAMBIGUATE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  DISAMBIGUATE_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).default(20_000),
  OUTLINE_COVERAGE_MIN_WARNING: z.coerce.number().min(0).max(100).default(50),
  OUTLINE_COVERAGE_MAX_WARNING: z.coerce.number().min(0).max(100).default(95),
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
