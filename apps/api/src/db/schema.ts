import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineTemplates = pgTable(
  "pipeline_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    stepsDef: jsonb("steps_def").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameVersionUnique: uniqueIndex("pipeline_templates_name_version_unique").on(t.name, t.version),
  }),
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => pipelineTemplates.id, { onDelete: "restrict" }),
    templateVersion: integer("template_version").notNull(),
    input: jsonb("input").notNull(),
    status: text("status").notNull().default("pending"),
    currentStepOrder: integer("current_step_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    byProject: index("pipeline_runs_project_idx").on(t.projectId),
    byStatus: index("pipeline_runs_status_idx").on(t.status),
  }),
);

export const pipelineSteps = pgTable(
  "pipeline_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    stepOrder: integer("step_order").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    retryCount: integer("retry_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    byRunOrder: uniqueIndex("pipeline_steps_run_order_unique").on(t.runId, t.stepOrder),
    byStatus: index("pipeline_steps_status_idx").on(t.status),
  }),
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => pipelineSteps.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull().default(1),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: text("cost_usd").notNull().default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("llm_calls_run_idx").on(t.runId),
    byStep: index("llm_calls_step_idx").on(t.stepId),
  }),
);

// tool_calls and tool_cache stubs — used in Plan 2, schema added now for stable migrations
export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => pipelineSteps.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    method: text("method").notNull(),
    paramsHash: text("params_hash").notNull(),
    fromCache: boolean("from_cache").notNull().default(false),
    costUsd: text("cost_usd").notNull().default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("tool_calls_run_idx").on(t.runId),
  }),
);

export const toolCache = pgTable(
  "tool_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tool: text("tool").notNull(),
    method: text("method").notNull(),
    paramsHash: text("params_hash").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byKey: uniqueIndex("tool_cache_key_unique").on(t.tool, t.method, t.paramsHash),
    byExpiry: index("tool_cache_expiry_idx").on(t.expiresAt),
  }),
);
