# Plan 1 — Foundation + First End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować fundamenty aplikacji — monorepo, backend z NestJS+Drizzle+BullMQ, frontend z Next.js — na tyle, żeby pojedynczy pipeline LLM (1 krok: `brief`) uruchamiał się end-to-end przez UI: klik "start" → worker wywołuje OpenRouter → output zapisany w DB → UI pokazuje wynik.

**Architecture:** Monorepo pnpm workspaces z `apps/api` (NestJS) i `apps/web` (Next.js), współdzielone typy Zod w `packages/shared`. Postgres + Redis w Docker Compose (dev). BullMQ jako silnik kolejki, custom orchestrator w NestJS dyryguje krokami. LLM przez Vercel AI SDK + OpenRouter. Na start bez SSE — frontend poluje co 2s.

**Tech Stack:** TypeScript, pnpm workspaces, Docker Compose, NestJS 11, Drizzle ORM, Postgres 16, Redis 7, BullMQ 5, Vercel AI SDK, OpenRouter, Next.js 16 (App Router), Tailwind, shadcn/ui, TanStack Query v5, Zod.

---

## File Structure Overview

```
sensai-content-generation/
├── .gitignore
├── .env.example
├── package.json                      (root workspace)
├── pnpm-workspace.yaml
├── docker-compose.dev.yml            (postgres + redis dla dev)
├── README.md
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── drizzle.config.ts
│   │   ├── .env.example
│   │   ├── src/
│   │   │   ├── main.ts                  (bootstrap + CORS)
│   │   │   ├── app.module.ts            (root module)
│   │   │   ├── config/
│   │   │   │   └── env.ts               (Zod env validation)
│   │   │   ├── db/
│   │   │   │   ├── schema.ts            (wszystkie tabele Drizzle)
│   │   │   │   ├── client.ts            (połączenie + provider)
│   │   │   │   └── db.module.ts
│   │   │   ├── projects/
│   │   │   │   ├── projects.module.ts
│   │   │   │   ├── projects.service.ts
│   │   │   │   └── projects.controller.ts
│   │   │   ├── templates/
│   │   │   │   ├── templates.module.ts
│   │   │   │   ├── templates.service.ts
│   │   │   │   └── templates.controller.ts
│   │   │   ├── runs/
│   │   │   │   ├── runs.module.ts
│   │   │   │   ├── runs.service.ts
│   │   │   │   └── runs.controller.ts
│   │   │   ├── orchestrator/
│   │   │   │   ├── orchestrator.module.ts
│   │   │   │   ├── step-handler.ts      (interface)
│   │   │   │   ├── step-registry.ts
│   │   │   │   ├── orchestrator.service.ts
│   │   │   │   ├── pipeline.worker.ts   (BullMQ Processor)
│   │   │   │   └── reconcile.service.ts
│   │   │   ├── llm/
│   │   │   │   ├── llm.module.ts
│   │   │   │   ├── llm.client.ts
│   │   │   │   ├── pricing.ts
│   │   │   │   └── cost-tracker.service.ts
│   │   │   ├── handlers/
│   │   │   │   ├── handlers.module.ts
│   │   │   │   └── brief.handler.ts
│   │   │   ├── prompts/
│   │   │   │   └── brief.prompt.ts
│   │   │   └── seed/
│   │   │       └── seed.ts              (ręczny skrypt seed)
│   │   └── test/
│   │       └── orchestrator.e2e-spec.ts (integration test)
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       ├── postcss.config.mjs
│       ├── tailwind.config.ts
│       ├── components.json              (shadcn)
│       ├── .env.example
│       ├── src/
│       │   ├── app/
│       │   │   ├── globals.css
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx             (home: lista runów)
│       │   │   ├── providers.tsx        (TanStack Query)
│       │   │   └── runs/
│       │   │       ├── new/page.tsx
│       │   │       └── [id]/page.tsx
│       │   ├── lib/
│       │   │   ├── api.ts               (fetch wrapper)
│       │   │   ├── hooks.ts             (useRuns, useStartRun, ...)
│       │   │   └── utils.ts             (cn helper dla shadcn)
│       │   └── components/
│       │       ├── ui/                  (shadcn components)
│       │       └── run-timeline.tsx
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            └── schemas.ts               (Zod: RunStatus, StepStatus, dto's)
```

---

## Task 1: Init monorepo — root + pnpm workspaces

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "sensai-content-generation",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev:infra": "docker compose -f docker-compose.dev.yml up -d",
    "dev:infra:down": "docker compose -f docker-compose.dev.yml down",
    "dev:api": "pnpm --filter @sensai/api start:dev",
    "dev:web": "pnpm --filter @sensai/web dev",
    "db:generate": "pnpm --filter @sensai/api db:generate",
    "db:migrate": "pnpm --filter @sensai/api db:migrate",
    "db:seed": "pnpm --filter @sensai/api db:seed"
  },
  "engines": {
    "node": ">=20.11",
    "pnpm": ">=9.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.pnpm-store/
dist/
.next/
.turbo/
.env
.env.local
*.log
.DS_Store
coverage/
.vercel/
# Drizzle generated
apps/api/drizzle/
!apps/api/drizzle/meta/.gitkeep
```

- [ ] **Step 4: Create .env.example (root-level shared)**

```
# Postgres (dev in Docker)
POSTGRES_USER=sensai
POSTGRES_PASSWORD=sensai_dev
POSTGRES_DB=sensai
POSTGRES_PORT=5432

# Redis (dev in Docker)
REDIS_PORT=6379
```

- [ ] **Step 5: Create minimal README.md**

````markdown
# Sens.ai Content Generation

Internal content generation app (Plan 1: Foundation).

## Dev setup

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/api/.env — set OPENROUTER_API_KEY
pnpm dev:infra              # start postgres + redis
pnpm db:migrate             # run migrations
pnpm db:seed                # seed project + template
pnpm dev:api                # in terminal 1
pnpm dev:web                # in terminal 2
```
````

Frontend: http://localhost:3000
API: http://localhost:4000

````

- [ ] **Step 6: Init git, first commit**

```bash
git init
git add .
git commit -m "chore: init monorepo scaffolding"
````

---

## Task 2: Docker Compose for dev infra

**Files:**

- Create: `docker-compose.dev.yml`

- [x] **Step 1: Write docker-compose.dev.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: sensai-postgres-dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-sensai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-sensai_dev}
      POSTGRES_DB: ${POSTGRES_DB:-sensai}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - sensai_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-sensai}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: sensai-redis-dev
    restart: unless-stopped
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - sensai_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  sensai_pg_data:
  sensai_redis_data:
```

- [x] **Step 2: Verify services start**

```bash
pnpm dev:infra
docker ps | grep sensai
```

Expected: two healthy containers running `sensai-postgres-dev` and `sensai-redis-dev`.

- [x] **Step 3: Commit**

```bash
git add docker-compose.dev.yml
git commit -m "chore(infra): add docker compose for dev postgres + redis"
```

---

## Task 3: Bootstrap shared package (`@sensai/shared`)

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`

- [x] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@sensai/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

- [x] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [x] **Step 3: Create packages/shared/src/schemas.ts**

```ts
import { z } from "zod";

export const RunStatus = z.enum([
  "pending",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatus>;

export const StepDef = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  auto: z.boolean(),
  model: z.string().optional(),
});
export type StepDef = z.infer<typeof StepDef>;

export const TemplateStepsDef = z.object({
  steps: z.array(StepDef).min(1),
});
export type TemplateStepsDef = z.infer<typeof TemplateStepsDef>;

export const ProjectConfig = z.object({
  toneOfVoice: z.string().default(""),
  targetAudience: z.string().default(""),
  guidelines: z.string().default(""),
  defaultModels: z
    .object({
      research: z.string().optional(),
      brief: z.string().optional(),
      draft: z.string().optional(),
      edit: z.string().optional(),
      seo: z.string().optional(),
    })
    .default({}),
  promptOverrides: z.record(z.string()).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const RunInput = z.object({
  topic: z.string().min(3),
  mainKeyword: z.string().optional(),
  intent: z.string().optional(),
  contentType: z.string().optional(),
});
export type RunInput = z.infer<typeof RunInput>;

export const StartRunDto = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
  input: RunInput,
});
export type StartRunDto = z.infer<typeof StartRunDto>;
```

- [x] **Step 4: Create packages/shared/src/index.ts**

```ts
export * from "./schemas";
```

- [x] **Step 5: Install + typecheck**

```bash
cd packages/shared && pnpm install && pnpm typecheck
```

Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Zod schemas for run/step/project types"
```

---

## Task 4: Bootstrap NestJS backend (`apps/api`)

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.ts`

- [x] **Step 1: Create apps/api/package.json**

```json
{
  "name": "@sensai/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/seed/seed.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@sensai/shared": "workspace:*",
    "ai": "^4.3.0",
    "@ai-sdk/openai-compatible": "^1.0.0",
    "bullmq": "^5.21.0",
    "drizzle-orm": "^0.36.0",
    "ioredis": "^5.4.1",
    "nestjs-pino": "^4.1.0",
    "pg": "^8.13.0",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2",
    "postgres": "^3.4.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.2",
    "typescript": "^5.5.4"
  }
}
```

- [x] **Step 2: Create apps/api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    },
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "removeComments": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [x] **Step 3: Create apps/api/tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "node_modules",
    "test",
    "dist",
    "**/*.spec.ts",
    "**/*.e2e-spec.ts"
  ]
}
```

- [x] **Step 4: Create apps/api/nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [x] **Step 5: Create apps/api/.env.example**

```
NODE_ENV=development
PORT=4000

# CORS (comma-separated origins for dev)
WEB_ORIGIN=http://localhost:3000

# Postgres
DATABASE_URL=postgres://sensai:sensai_dev@localhost:5432/sensai

# Redis
REDIS_URL=redis://localhost:6379

# LLM / OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=openai/gpt-5-mini

# Auth
API_BEARER_TOKEN=dev-token-change-me
```

- [x] **Step 6: Create apps/api/src/config/env.ts**

```ts
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
```

- [x] **Step 7: Create apps/api/src/app.module.ts**

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: { colorize: true, singleLine: true },
              }
            : undefined,
        level: process.env.LOG_LEVEL ?? "info",
      },
    }),
  ],
})
export class AppModule {}
```

- [x] **Step 8: Create apps/api/src/main.ts**

```ts
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: false,
  });
  await app.listen(env.PORT);
  app.get(Logger).log(`API listening on http://localhost:${env.PORT}`);
}

bootstrap();
```

- [x] **Step 9: Install + verify build**

```bash
cd apps/api && pnpm install
pnpm typecheck
pnpm build
```

Expected: clean typecheck and build.

- [x] **Step 10: Smoke-run the API**

Prepare env:

```bash
cp apps/api/.env.example apps/api/.env
# Set OPENROUTER_API_KEY to any non-empty value for now (not used in this task)
```

Run:

```bash
pnpm --filter @sensai/api start:dev
```

Expected: log `API listening on http://localhost:4000`, process stays alive. Kill with Ctrl+C.

- [x] **Step 11: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): bootstrap nest app with env validation and pino logger"
```

---

## Task 5: Drizzle setup + database schema

**Files:**

- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/db.module.ts`
- Create: `apps/api/src/db/migrate.ts`

- [x] **Step 1: Create apps/api/drizzle.config.ts**

```ts
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
```

Install dotenv as dev dep:

```bash
pnpm --filter @sensai/api add -D dotenv
```

- [x] **Step 2: Create apps/api/src/db/schema.ts**

```ts
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
  config: jsonb("config")
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pipelineTemplates = pgTable(
  "pipeline_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    stepsDef: jsonb("steps_def").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameVersionUnique: uniqueIndex("pipeline_templates_name_version_unique").on(
      t.name,
      t.version,
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    byRunOrder: uniqueIndex("pipeline_steps_run_order_unique").on(
      t.runId,
      t.stepOrder,
    ),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byKey: uniqueIndex("tool_cache_key_unique").on(
      t.tool,
      t.method,
      t.paramsHash,
    ),
    byExpiry: index("tool_cache_expiry_idx").on(t.expiresAt),
  }),
);
```

_Note: `cost_usd` stored as `text` (rendered from string) to preserve decimal precision without importing a decimal lib. Convert to `numeric(18,8)` in Plan 4 if precise aggregation needed._

- [x] **Step 3: Create apps/api/src/db/client.ts**

```ts
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
```

- [x] **Step 4: Create apps/api/src/db/db.module.ts**

```ts
import { Global, Module } from "@nestjs/common";
import { createDb, type Db } from "./client";
import { loadEnv } from "../config/env";

export const DB_TOKEN = Symbol("DB");

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => {
        const env = loadEnv();
        const { db } = createDb(env.DATABASE_URL);
        return db as Db;
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DbModule {}
```

- [x] **Step 5: Create apps/api/src/db/migrate.ts**

```ts
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [x] **Step 6: Wire DbModule into AppModule**

Modify `apps/api/src/app.module.ts` to import `DbModule`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { DbModule } from "./db/db.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: { colorize: true, singleLine: true },
              }
            : undefined,
        level: process.env.LOG_LEVEL ?? "info",
      },
    }),
    DbModule,
  ],
})
export class AppModule {}
```

- [x] **Step 7: Generate + apply migration**

```bash
pnpm --filter @sensai/api db:generate
pnpm --filter @sensai/api db:migrate
```

Expected: `drizzle/0000_*.sql` created, migration applied. Verify:

```bash
docker exec -it sensai-postgres-dev psql -U sensai -d sensai -c "\dt"
```

Expected: lists `projects`, `pipeline_templates`, `pipeline_runs`, `pipeline_steps`, `llm_calls`, `tool_calls`, `tool_cache`.

- [x] **Step 8: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db apps/api/src/app.module.ts apps/api/drizzle
git commit -m "feat(api): add drizzle schema for all tables + migration runner"
```

---

## Task 6: Projects module (CRUD minimal — just list + get)

**Files:**

- Create: `apps/api/src/projects/projects.module.ts`
- Create: `apps/api/src/projects/projects.service.ts`
- Create: `apps/api/src/projects/projects.controller.ts`

- [x] **Step 1: Create apps/api/src/projects/projects.service.ts**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { projects } from "../db/schema";

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list() {
    return this.db.select().from(projects).orderBy(projects.name);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }
}
```

- [x] **Step 2: Create apps/api/src/projects/projects.controller.ts**

```ts
import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.findById(id);
  }
}
```

- [x] **Step 3: Create apps/api/src/projects/projects.module.ts**

```ts
import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
```

- [x] **Step 4: Wire into AppModule** (add `ProjectsModule` to `imports` array)

- [x] **Step 5: Verify typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

- [x] **Step 6: Commit**

```bash
git add apps/api/src/projects apps/api/src/app.module.ts
git commit -m "feat(api): add projects module (list + get)"
```

---

## Task 7: Pipeline templates module

**Files:**

- Create: `apps/api/src/templates/templates.module.ts`
- Create: `apps/api/src/templates/templates.service.ts`
- Create: `apps/api/src/templates/templates.controller.ts`

- [x] **Step 1: Create apps/api/src/templates/templates.service.ts**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineTemplates } from "../db/schema";
import { TemplateStepsDef } from "@sensai/shared";

@Injectable()
export class TemplatesService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list() {
    return this.db
      .select()
      .from(pipelineTemplates)
      .orderBy(pipelineTemplates.name, pipelineTemplates.version);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, id));
    if (!row) throw new NotFoundException(`Template ${id} not found`);
    return row;
  }

  parseSteps(stepsDef: unknown) {
    return TemplateStepsDef.parse(stepsDef);
  }
}
```

- [x] **Step 2: Create apps/api/src/templates/templates.controller.ts**

```ts
import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { TemplatesService } from "./templates.service";

@Controller("templates")
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.findById(id);
  }
}
```

- [x] **Step 3: Create apps/api/src/templates/templates.module.ts**

```ts
import { Module } from "@nestjs/common";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
```

- [x] **Step 4: Wire TemplatesModule into AppModule**

- [x] **Step 5: Typecheck + commit**

```bash
pnpm --filter @sensai/api typecheck
git add apps/api/src/templates apps/api/src/app.module.ts
git commit -m "feat(api): add templates module (list + get)"
```

---

## Task 8: LLM module — client, pricing, cost tracker

**Files:**

- Create: `apps/api/src/llm/pricing.ts`
- Create: `apps/api/src/llm/cost-tracker.service.ts`
- Create: `apps/api/src/llm/llm.client.ts`
- Create: `apps/api/src/llm/llm.module.ts`

- [x] **Step 1: Create apps/api/src/llm/pricing.ts**

```ts
// Simple static pricing table — per 1M tokens (USD). Update manually.
// Source of truth is OpenRouter /models endpoint; we'll sync this later.
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "openai/gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2.0 },
  "openai/gpt-5.4": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "anthropic/claude-sonnet-4.6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "anthropic/claude-haiku-4.5": { inputPer1M: 0.25, outputPer1M: 1.25 },
  "google/gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
};

export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): string {
  const p = MODEL_PRICING[model];
  if (!p) return "0"; // unknown model — cost unknown, don't block
  const cost =
    (promptTokens / 1_000_000) * p.inputPer1M +
    (completionTokens / 1_000_000) * p.outputPer1M;
  return cost.toFixed(8);
}
```

- [x] **Step 2: Create apps/api/src/llm/cost-tracker.service.ts**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { llmCalls } from "../db/schema";

export interface LlmCallRecord {
  runId: string;
  stepId: string;
  attempt: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class CostTrackerService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(call: LlmCallRecord): Promise<void> {
    await this.db.insert(llmCalls).values(call);
  }
}
```

- [x] **Step 3: Create apps/api/src/llm/llm.client.ts**

```ts
import { Injectable, Logger } from "@nestjs/common";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { ZodSchema } from "zod";
import { loadEnv } from "../config/env";
import { calculateCostUsd } from "./pricing";
import { CostTrackerService } from "./cost-tracker.service";

export interface LlmCallContext {
  runId: string;
  stepId: string;
  attempt: number;
  model?: string;
}

export interface LlmTextResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

export interface LlmObjectResult<T> extends Omit<LlmTextResult, "text"> {
  object: T;
}

// Note: AI SDK v6 renamed usage fields. Verify against installed `ai` package at implementation
// time — if typecheck fails on `inputTokens`/`outputTokens`, consult node_modules/ai/src for
// current names. Implementer should run the ai-sdk skill if unsure.
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  private readonly provider;
  private readonly defaultModel: string;

  constructor(private readonly costTracker: CostTrackerService) {
    const env = loadEnv();
    this.provider = createOpenAICompatible({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
    });
    this.defaultModel = env.DEFAULT_MODEL;
  }

  async generateText(args: {
    ctx: LlmCallContext;
    system: string;
    prompt: string;
  }): Promise<LlmTextResult> {
    const model = args.ctx.model ?? this.defaultModel;
    const started = Date.now();
    const res = await generateText({
      model: this.provider(model),
      system: args.system,
      prompt: args.prompt,
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.inputTokens ?? 0;
    const completionTokens = res.usage?.outputTokens ?? 0;
    const costUsd = calculateCostUsd(model, promptTokens, completionTokens);
    await this.costTracker.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openrouter",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });
    return {
      text: res.text,
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    };
  }

  async generateObject<T>(args: {
    ctx: LlmCallContext;
    system: string;
    prompt: string;
    schema: ZodSchema<T>;
  }): Promise<LlmObjectResult<T>> {
    const model = args.ctx.model ?? this.defaultModel;
    const started = Date.now();
    const res = await generateText({
      model: this.provider(model),
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.inputTokens ?? 0;
    const completionTokens = res.usage?.outputTokens ?? 0;
    const costUsd = calculateCostUsd(model, promptTokens, completionTokens);
    await this.costTracker.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openrouter",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });
    return {
      object: res.output as T,
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    };
  }
}
```

- [x] **Step 4: Create apps/api/src/llm/llm.module.ts**

```ts
import { Global, Module } from "@nestjs/common";
import { LlmClient } from "./llm.client";
import { CostTrackerService } from "./cost-tracker.service";

@Global()
@Module({
  providers: [LlmClient, CostTrackerService],
  exports: [LlmClient, CostTrackerService],
})
export class LlmModule {}
```

- [x] **Step 5: Wire LlmModule into AppModule**

- [x] **Step 6: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

- [x] **Step 7: Commit**

```bash
git add apps/api/src/llm apps/api/src/app.module.ts
git commit -m "feat(api): add llm module with openrouter client and cost tracking"
```

---

## Task 9: Orchestrator — StepHandler contract + registry

**Files:**

- Create: `apps/api/src/orchestrator/step-handler.ts`
- Create: `apps/api/src/orchestrator/step-registry.ts`

- [x] **Step 1: Create apps/api/src/orchestrator/step-handler.ts**

```ts
import type { pipelineRuns, pipelineSteps, projects } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type PipelineRunRow = InferSelectModel<typeof pipelineRuns>;
export type PipelineStepRow = InferSelectModel<typeof pipelineSteps>;
export type ProjectRow = InferSelectModel<typeof projects>;

export interface StepContext {
  run: PipelineRunRow;
  step: PipelineStepRow;
  project: ProjectRow;
  previousOutputs: Record<string, unknown>;
  attempt: number;
}

export interface StepResult {
  output: unknown;
}

export interface StepHandler {
  readonly type: string;
  execute(ctx: StepContext): Promise<StepResult>;
}

export const STEP_HANDLERS = Symbol("STEP_HANDLERS");
```

- [x] **Step 2: Create apps/api/src/orchestrator/step-registry.ts**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { STEP_HANDLERS, type StepHandler } from "./step-handler";

@Injectable()
export class StepRegistry {
  private readonly byType: Map<string, StepHandler>;

  constructor(@Inject(STEP_HANDLERS) handlers: StepHandler[]) {
    this.byType = new Map(handlers.map((h) => [h.type, h]));
  }

  resolve(type: string): StepHandler {
    const h = this.byType.get(type);
    if (!h)
      throw new NotFoundException(
        `No step handler registered for type: ${type}`,
      );
    return h;
  }
}
```

- [x] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: clean (files are referenced later).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/orchestrator/step-handler.ts apps/api/src/orchestrator/step-registry.ts
git commit -m "feat(api): define StepHandler contract and registry"
```

---

## Task 10: First handler — `llm.brief`

**Files:**

- Create: `apps/api/src/prompts/brief.prompt.ts`
- Create: `apps/api/src/handlers/brief.handler.ts`
- Create: `apps/api/src/handlers/handlers.module.ts`

- [x] **Step 1: Create apps/api/src/prompts/brief.prompt.ts**

```ts
import { z } from "zod";
import type { ProjectRow } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";

export const BriefOutputSchema = z.object({
  headline: z.string(),
  angle: z.string().describe("Unikalny kąt ujęcia tematu"),
  pillars: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Główne filary treści (3-6 punktów)"),
  audiencePainPoints: z.array(z.string()).min(2).max(5),
  successCriteria: z.string().describe("Jak wyglądałby idealny artykuł?"),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

export const briefPrompt = {
  system(project: ProjectRow) {
    const cfg = project.config as ProjectConfig;
    return [
      `Jesteś starszym redaktorem i strategiem contentu marki "${project.name}".`,
      cfg.toneOfVoice && `Tone of voice: ${cfg.toneOfVoice}`,
      cfg.targetAudience && `Grupa docelowa: ${cfg.targetAudience}`,
      cfg.guidelines && `Wytyczne brandowe: ${cfg.guidelines}`,
      `Twoim zadaniem jest przygotowanie krótkiego briefu artykułu na podstawie tematu od użytkownika.`,
      `Zwróć odpowiedź wyłącznie jako obiekt JSON zgodny ze schematem.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  },
  user(input: RunInput) {
    return [
      `Temat artykułu: ${input.topic}`,
      input.mainKeyword && `Główne słowo kluczowe: ${input.mainKeyword}`,
      input.intent && `Intent użytkownika: ${input.intent}`,
      input.contentType && `Typ treści: ${input.contentType}`,
      `Przygotuj brief.`,
    ]
      .filter(Boolean)
      .join("\n");
  },
  schema: BriefOutputSchema,
};
```

- [x] **Step 2: Create apps/api/src/handlers/brief.handler.ts**

```ts
import { Injectable } from "@nestjs/common";
import { LlmClient } from "../llm/llm.client";
import { briefPrompt } from "../prompts/brief.prompt";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";

@Injectable()
export class BriefHandler implements StepHandler {
  readonly type = "llm.brief";

  constructor(private readonly llm: LlmClient) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;
    const model = cfg.defaultModels?.brief;
    const res = await this.llm.generateObject({
      ctx: {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        attempt: ctx.attempt,
        model,
      },
      system: briefPrompt.system(ctx.project),
      prompt: briefPrompt.user(input),
      schema: briefPrompt.schema,
    });
    return { output: res.object };
  }
}
```

- [x] **Step 3: Create apps/api/src/handlers/handlers.module.ts**

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  providers: [
    BriefHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (brief: BriefHandler): StepHandler[] => [brief],
      inject: [BriefHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
```

- [x] **Step 4: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

- [x] **Step 5: Commit**

```bash
git add apps/api/src/prompts apps/api/src/handlers
git commit -m "feat(api): add brief step handler (llm.brief) + prompt"
```

---

## Task 11: Orchestrator — queue setup + worker + service

**Files:**

- Create: `apps/api/src/orchestrator/orchestrator.service.ts`
- Create: `apps/api/src/orchestrator/pipeline.worker.ts`
- Create: `apps/api/src/orchestrator/reconcile.service.ts`
- Create: `apps/api/src/orchestrator/orchestrator.module.ts`

- [x] **Step 1: Create apps/api/src/orchestrator/orchestrator.service.ts**

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { QUEUE_NAME, type StepJobData } from "./queue.constants";

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject("PIPELINE_QUEUE") private readonly queue: Queue<StepJobData>,
  ) {}

  async enqueueStep(runId: string, stepId: string): Promise<void> {
    await this.queue.add(
      "execute-step",
      { runId, stepId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.logger.log({ runId, stepId }, "step enqueued");
  }

  /**
   * After a step completes successfully, decide what's next:
   * - if no next step → mark run completed
   * - if next step requires approval → mark run awaiting_approval
   * - otherwise enqueue next step
   */
  async advance(runId: string, completedStepOrder: number): Promise<void> {
    const steps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, runId))
      .orderBy(pipelineSteps.stepOrder);

    const nextStep = steps.find((s) => s.stepOrder === completedStepOrder + 1);

    if (!nextStep) {
      await this.db
        .update(pipelineRuns)
        .set({
          status: "completed",
          finishedAt: new Date(),
          currentStepOrder: completedStepOrder,
        })
        .where(eq(pipelineRuns.id, runId));
      this.logger.log({ runId }, "run completed");
      return;
    }

    if (nextStep.requiresApproval) {
      await this.db
        .update(pipelineRuns)
        .set({
          status: "awaiting_approval",
          currentStepOrder: nextStep.stepOrder,
        })
        .where(eq(pipelineRuns.id, runId));
      this.logger.log({ runId, nextStepId: nextStep.id }, "awaiting approval");
      return;
    }

    await this.db
      .update(pipelineRuns)
      .set({ currentStepOrder: nextStep.stepOrder })
      .where(eq(pipelineRuns.id, runId));

    await this.enqueueStep(runId, nextStep.id);
  }
}
```

- [x] **Step 2: Create apps/api/src/orchestrator/queue.constants.ts**

```ts
export const QUEUE_NAME = "pipeline-steps";

export interface StepJobData {
  runId: string;
  stepId: string;
}
```

- [x] **Step 3: Create apps/api/src/orchestrator/pipeline.worker.ts**

```ts
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps, projects } from "../db/schema";
import { loadEnv } from "../config/env";
import { StepRegistry } from "./step-registry";
import { OrchestratorService } from "./orchestrator.service";
import { QUEUE_NAME, type StepJobData } from "./queue.constants";

@Injectable()
export class PipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineWorker.name);
  private worker?: Worker<StepJobData>;
  private connection?: Redis;

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly registry: StepRegistry,
    private readonly orchestrator: OrchestratorService,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<StepJobData>(
      QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.connection, concurrency: 3 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error({ jobId: job?.id, err: err.message }, "job failed");
    });
    this.worker.on("completed", (job) => {
      this.logger.debug({ jobId: job.id }, "job completed");
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async process(job: Job<StepJobData>): Promise<void> {
    const { runId, stepId } = job.data;
    const attempt = (job.attemptsMade ?? 0) + 1;

    const [step] = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.id, stepId));
    if (!step) throw new Error(`step ${stepId} not found`);
    const [run] = await this.db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId));
    if (!run) throw new Error(`run ${runId} not found`);
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, run.projectId));
    if (!project) throw new Error(`project ${run.projectId} not found`);

    // Mark step running (first attempt only)
    if (step.status === "pending") {
      await this.db
        .update(pipelineSteps)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId));
      await this.db
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, runId));
    }

    // Load previous outputs
    const priorSteps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, runId));
    const previousOutputs: Record<string, unknown> = {};
    for (const s of priorSteps) {
      if (s.stepOrder < step.stepOrder && s.output) {
        previousOutputs[s.stepKey] = s.output;
      }
    }

    const handler = this.registry.resolve(step.type);

    try {
      const result = await handler.execute({
        run,
        step,
        project,
        previousOutputs,
        attempt,
      });
      await this.db
        .update(pipelineSteps)
        .set({
          output: result.output as any,
          status: "completed",
          finishedAt: new Date(),
          error: null,
        })
        .where(eq(pipelineSteps.id, stepId));

      await this.orchestrator.advance(runId, step.stepOrder);
    } catch (err: any) {
      const serialized = {
        message: err?.message ?? String(err),
        name: err?.name,
        stack: err?.stack,
        attempt,
        timestamp: new Date().toISOString(),
      };
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinal = attempt >= maxAttempts;
      await this.db
        .update(pipelineSteps)
        .set({
          retryCount: attempt,
          error: serialized as any,
          status: isFinal ? "failed" : "running",
          finishedAt: isFinal ? new Date() : null,
        })
        .where(eq(pipelineSteps.id, stepId));
      if (isFinal) {
        await this.db
          .update(pipelineRuns)
          .set({ status: "failed", finishedAt: new Date() })
          .where(eq(pipelineRuns.id, runId));
      }
      throw err;
    }
  }
}
```

- [x] **Step 4: Create apps/api/src/orchestrator/reconcile.service.ts**

```ts
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { Queue } from "bullmq";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { OrchestratorService } from "./orchestrator.service";

@Injectable()
export class ReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject("PIPELINE_QUEUE") private readonly queue: Queue,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const activeRuns = await this.db
      .select()
      .from(pipelineRuns)
      .where(inArray(pipelineRuns.status, ["running", "pending"]));

    if (activeRuns.length === 0) {
      this.logger.log("no active runs to reconcile");
      return;
    }

    for (const run of activeRuns) {
      const steps = await this.db
        .select()
        .from(pipelineSteps)
        .where(
          and(
            eq(pipelineSteps.runId, run.id),
            inArray(pipelineSteps.status, ["pending", "running"]),
          ),
        )
        .orderBy(pipelineSteps.stepOrder);

      const next = steps[0];
      if (!next) continue;

      // Reset stuck "running" back to "pending" so we retry cleanly
      if (next.status === "running") {
        await this.db
          .update(pipelineSteps)
          .set({ status: "pending", startedAt: null })
          .where(eq(pipelineSteps.id, next.id));
      }

      await this.orchestrator.enqueueStep(run.id, next.id);
      this.logger.log(
        { runId: run.id, stepId: next.id },
        "reconciled: re-enqueued step",
      );
    }
  }
}
```

- [x] **Step 5: Create apps/api/src/orchestrator/orchestrator.module.ts**

```ts
import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "../config/env";
import { OrchestratorService } from "./orchestrator.service";
import { PipelineWorker } from "./pipeline.worker";
import { ReconcileService } from "./reconcile.service";
import { StepRegistry } from "./step-registry";
import { HandlersModule } from "../handlers/handlers.module";
import { QUEUE_NAME } from "./queue.constants";

@Module({
  imports: [HandlersModule],
  providers: [
    {
      provide: "PIPELINE_REDIS",
      useFactory: () => {
        const env = loadEnv();
        return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      },
    },
    {
      provide: "PIPELINE_QUEUE",
      useFactory: (connection: Redis) => new Queue(QUEUE_NAME, { connection }),
      inject: ["PIPELINE_REDIS"],
    },
    StepRegistry,
    OrchestratorService,
    PipelineWorker,
    ReconcileService,
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
```

- [x] **Step 6: Wire OrchestratorModule into AppModule**

- [x] **Step 7: Typecheck + build**

```bash
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/api build
```

- [x] **Step 8: Commit**

```bash
git add apps/api/src/orchestrator apps/api/src/app.module.ts
git commit -m "feat(api): add orchestrator with bullmq worker and reconcile"
```

---

## Task 12: Runs module (start + get + list)

**Files:**

- Create: `apps/api/src/runs/runs.service.ts`
- Create: `apps/api/src/runs/runs.controller.ts`
- Create: `apps/api/src/runs/runs.module.ts`

- [x] **Step 1: Create apps/api/src/runs/runs.service.ts**

```ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { ProjectsService } from "../projects/projects.service";
import { TemplatesService } from "../templates/templates.service";
import { OrchestratorService } from "../orchestrator/orchestrator.service";
import { StartRunDto } from "@sensai/shared";

@Injectable()
export class RunsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly projects: ProjectsService,
    private readonly templates: TemplatesService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async list() {
    return this.db
      .select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.createdAt))
      .limit(50);
  }

  async get(id: string) {
    const [run] = await this.db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, id));
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    const steps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, id))
      .orderBy(pipelineSteps.stepOrder);
    return { ...run, steps };
  }

  async start(dto: StartRunDto) {
    const parsed = StartRunDto.parse(dto);
    const project = await this.projects.findById(parsed.projectId);
    const template = await this.templates.findById(parsed.templateId);
    const stepsDef = this.templates.parseSteps(template.stepsDef);

    const [run] = await this.db
      .insert(pipelineRuns)
      .values({
        projectId: project.id,
        templateId: template.id,
        templateVersion: template.version,
        input: parsed.input,
        status: "pending",
        currentStepOrder: 1,
      })
      .returning();

    const stepRows = stepsDef.steps.map((s, idx) => ({
      runId: run.id,
      stepKey: s.key,
      stepOrder: idx + 1,
      type: s.type,
      requiresApproval: !s.auto,
      status: "pending" as const,
    }));
    const insertedSteps = await this.db
      .insert(pipelineSteps)
      .values(stepRows)
      .returning();

    const firstStep = insertedSteps.find((s) => s.stepOrder === 1);
    if (!firstStep) throw new Error("no first step created");
    await this.orchestrator.enqueueStep(run.id, firstStep.id);

    return { ...run, steps: insertedSteps };
  }
}
```

- [x] **Step 2: Create apps/api/src/runs/runs.controller.ts**

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { RunsService } from "./runs.service";
import { StartRunDto } from "@sensai/shared";

@Controller("runs")
export class RunsController {
  constructor(private readonly svc: RunsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(id);
  }

  @Post()
  start(@Body() body: unknown) {
    const dto = StartRunDto.parse(body);
    return this.svc.start(dto);
  }
}
```

- [x] **Step 3: Create apps/api/src/runs/runs.module.ts**

```ts
import { Module } from "@nestjs/common";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { ProjectsModule } from "../projects/projects.module";
import { TemplatesModule } from "../templates/templates.module";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";

@Module({
  imports: [ProjectsModule, TemplatesModule, OrchestratorModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
```

- [x] **Step 4: Wire RunsModule into AppModule**

Final `AppModule` should import (in addition to ConfigModule, LoggerModule, DbModule, LlmModule):

- `ProjectsModule`
- `TemplatesModule`
- `OrchestratorModule`
- `RunsModule`

- [x] **Step 5: Typecheck + build**

```bash
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/api build
```

- [x] **Step 6: Commit**

```bash
git add apps/api/src/runs apps/api/src/app.module.ts
git commit -m "feat(api): add runs module (list, get, start)"
```

---

## Task 13: Auth guard — bearer token

**Files:**

- Create: `apps/api/src/config/bearer.guard.ts`
- Modify: `apps/api/src/main.ts` — apply guard globally

- [ ] **Step 1: Create apps/api/src/config/bearer.guard.ts**

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { loadEnv } from "./env";

@Injectable()
export class BearerGuard implements CanActivate {
  private readonly token: string;
  constructor() {
    this.token = loadEnv().API_BEARER_TOKEN;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string> }>();
    const auth = req.headers.authorization ?? "";
    const [scheme, value] = auth.split(" ");
    if (scheme !== "Bearer" || value !== this.token) {
      throw new UnauthorizedException("Invalid bearer token");
    }
    return true;
  }
}
```

- [ ] **Step 2: Apply guard globally in main.ts**

Modify `apps/api/src/main.ts` — add `app.useGlobalGuards(new BearerGuard())` after `app.useLogger(...)`:

```ts
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { BearerGuard } from "./config/bearer.guard";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalGuards(new BearerGuard());
  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: false,
  });
  await app.listen(env.PORT);
  app.get(Logger).log(`API listening on http://localhost:${env.PORT}`);
}

bootstrap();
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @sensai/api typecheck
git add apps/api/src/config/bearer.guard.ts apps/api/src/main.ts
git commit -m "feat(api): enforce bearer token on all endpoints"
```

---

## Task 14: Seed script — one project + one template

**Files:**

- Create: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Create apps/api/src/seed/seed.ts**

```ts
import "dotenv/config";
import { createDb } from "../db/client";
import { projects, pipelineTemplates } from "../db/schema";
import type { ProjectConfig, TemplateStepsDef } from "@sensai/shared";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  const config: ProjectConfig = {
    toneOfVoice: "profesjonalny, konkretny, bez żargonu",
    targetAudience:
      "małe i średnie polskie firmy prowadzące działalność online",
    guidelines:
      "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków.",
    defaultModels: {
      brief: "openai/gpt-5-mini",
    },
    promptOverrides: {},
  };

  const [project] = await db
    .insert(projects)
    .values({
      slug: "demo",
      name: "Demo Project",
      config,
    })
    .onConflictDoNothing({ target: projects.slug })
    .returning();

  const stepsDef: TemplateStepsDef = {
    steps: [{ key: "brief", type: "llm.brief", auto: true }],
  };

  const [template] = await db
    .insert(pipelineTemplates)
    .values({
      name: "Brief only (MVP)",
      version: 1,
      stepsDef,
    })
    .onConflictDoNothing({
      target: [pipelineTemplates.name, pipelineTemplates.version],
    })
    .returning();

  console.log("Seeded:", {
    projectId: project?.id,
    templateId: template?.id,
  });
  console.log("Use these IDs when starting a run via the UI.");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run seed**

```bash
pnpm --filter @sensai/api db:seed
```

Expected: logs project and template IDs.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed
git commit -m "chore(api): add seed script for demo project and brief template"
```

---

## Task 15: Smoke-test backend end-to-end (no UI yet)

**Files:** none — this is a verification step.

- [ ] **Step 1: Start API in dev**

```bash
pnpm dev:api
```

Expected: log `API listening on http://localhost:4000` and `no active runs to reconcile`.

- [ ] **Step 2: List projects**

In another terminal:

```bash
TOKEN=$(grep API_BEARER_TOKEN apps/api/.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/projects | jq .
```

Expected: array with `Demo Project`. Capture `projectId`.

- [ ] **Step 3: List templates**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/templates | jq .
```

Expected: array with `Brief only (MVP)`. Capture `templateId`.

- [ ] **Step 4: Start a run**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"<PROJECT_ID>\",\"templateId\":\"<TEMPLATE_ID>\",\"input\":{\"topic\":\"Jak małe firmy mogą wykorzystać AI w obsłudze klienta\"}}" \
  http://localhost:4000/runs | jq .
```

Expected: JSON with run object, `status: "pending"`, and one step `brief` in `pending`.

- [ ] **Step 5: Poll run**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/runs/<RUN_ID> | jq .
```

Expected (within ~30 seconds):

- `run.status: "completed"`
- `steps[0].status: "completed"`
- `steps[0].output` contains a JSON brief with `headline`, `angle`, `pillars`, `audiencePainPoints`, `successCriteria`
- In API logs: `job completed` and `run completed` entries; `llm_calls` row inserted (verify with `psql` if desired)

- [ ] **Step 6: Verify cost tracking**

```bash
docker exec -it sensai-postgres-dev psql -U sensai -d sensai -c \
  "SELECT model, prompt_tokens, completion_tokens, cost_usd, latency_ms FROM llm_calls;"
```

Expected: 1 row with non-zero tokens and cost.

- [ ] **Step 7: Manual reconcile test**

Start a fresh run (repeat steps four and five above). While it's still `pending`, kill the API process with Ctrl+C before the step finishes. Restart `pnpm dev:api`. Expected log: `reconciled: re-enqueued step` and the run eventually completes.

- [ ] **Step 8: Stop API, commit nothing** (verification only)

---

## Task 16: Bootstrap Next.js frontend (`apps/web`)

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/components.json`
- Create: `apps/web/.env.example`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@sensai/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.0",
    "@sensai/shared": "workspace:*",
    "@tanstack/react-query": "^5.59.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sensai/shared"],
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/postcss.config.mjs**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create apps/web/tailwind.config.ts**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Create apps/web/components.json (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 7: Create apps/web/.env.example**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_TOKEN=dev-token-change-me
```

- [ ] **Step 8: Create apps/web/src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --border: 0 0% 90%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 45%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
  }
}

html,
body {
  min-height: 100%;
}

body {
  @apply bg-background text-foreground;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
```

- [ ] **Step 9: Create apps/web/src/lib/utils.ts**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 10: Create apps/web/src/app/providers.tsx**

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 11: Create apps/web/src/app/layout.tsx**

```tsx
import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "Sens.ai Content Generation",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <Providers>
          <main className="mx-auto max-w-5xl p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Install + typecheck**

```bash
pnpm install
pnpm --filter @sensai/web typecheck
```

- [ ] **Step 13: Commit**

```bash
git add apps/web
git commit -m "feat(web): bootstrap next.js app with tailwind and tanstack query"
```

---

## Task 17: Frontend — API client + hooks

**Files:**

- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/hooks.ts`

- [ ] **Step 1: Create apps/web/src/lib/api.ts**

```ts
import type { StartRunDto } from "@sensai/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL!;
const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN!;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  config: unknown;
  createdAt: string;
}
export interface Template {
  id: string;
  name: string;
  version: number;
  stepsDef: { steps: Array<{ key: string; type: string; auto: boolean }> };
  createdAt: string;
}
export interface Step {
  id: string;
  runId: string;
  stepKey: string;
  stepOrder: number;
  type: string;
  status: string;
  requiresApproval: boolean;
  input: unknown;
  output: unknown;
  error: unknown;
  retryCount: number;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface Run {
  id: string;
  projectId: string;
  templateId: string;
  input: unknown;
  status: string;
  currentStepOrder: number;
  createdAt: string;
  finishedAt: string | null;
  steps?: Step[];
}

export const api = {
  projects: {
    list: () => apiFetch<Project[]>("/projects"),
  },
  templates: {
    list: () => apiFetch<Template[]>("/templates"),
  },
  runs: {
    list: () => apiFetch<Run[]>("/runs"),
    get: (id: string) => apiFetch<Run & { steps: Step[] }>(`/runs/${id}`),
    start: (dto: StartRunDto) =>
      apiFetch<Run & { steps: Step[] }>("/runs", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
  },
};
```

- [ ] **Step 2: Create apps/web/src/lib/hooks.ts**

```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { StartRunDto } from "@sensai/shared";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => api.templates.list(),
  });
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
    refetchInterval: 3000,
  });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api.runs.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return 2000;
      return d.status === "completed" ||
        d.status === "failed" ||
        d.status === "cancelled"
        ? false
        : 2000;
    },
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: StartRunDto) => api.runs.start(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @sensai/web typecheck
git add apps/web/src/lib
git commit -m "feat(web): add api client and query hooks"
```

---

## Task 18: Frontend views — home (runs list) + new run form + run detail

**Files:**

- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/runs/new/page.tsx`
- Create: `apps/web/src/app/runs/[id]/page.tsx`
- Create: `apps/web/src/components/run-timeline.tsx`

- [ ] **Step 1: Create apps/web/src/components/run-timeline.tsx**

```tsx
"use client";
import type { Step } from "@/lib/api";
import { cn } from "@/lib/utils";

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "running":
      return "…";
    case "failed":
      return "✗";
    case "skipped":
      return "↷";
    default:
      return "○";
  }
}

export function RunTimeline({
  steps,
  selectedStepId,
  onSelectStep,
}: {
  steps: Step[];
  selectedStepId?: string;
  onSelectStep?: (id: string) => void;
}) {
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onSelectStep?.(s.id)}
            className={cn(
              "w-full rounded border px-3 py-2 text-left text-sm transition-colors",
              selectedStepId === s.id ? "bg-muted" : "hover:bg-muted/50",
              s.status === "failed" && "border-red-500/40",
              s.status === "completed" && "border-green-500/30",
            )}
          >
            <span className="font-mono text-xs text-muted-foreground">
              {s.stepOrder}.
            </span>{" "}
            <span className="font-mono">{statusIcon(s.status)}</span>{" "}
            <span className="font-medium">{s.stepKey}</span>{" "}
            <span className="text-muted-foreground">({s.type})</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Create apps/web/src/app/page.tsx**

```tsx
"use client";
import Link from "next/link";
import { useRuns } from "@/lib/hooks";

export default function HomePage() {
  const { data, isLoading, error } = useRuns();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sens.ai Content Generation</h1>
        <Link
          href="/runs/new"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          + Nowy run
        </Link>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Ostatnie runy</h2>
        {isLoading && <p>Ładowanie…</p>}
        {error && <p className="text-red-500">Błąd: {String(error)}</p>}
        {data && data.length === 0 && (
          <p className="text-muted-foreground">Brak runów. Uruchom pierwszy.</p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="block rounded border px-3 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">
                      {r.id.slice(0, 8)}
                    </span>
                    <span className="text-sm">{r.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create apps/web/src/app/runs/new/page.tsx**

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjects, useTemplates, useStartRun } from "@/lib/hooks";

export default function NewRunPage() {
  const router = useRouter();
  const projects = useProjects();
  const templates = useTemplates();
  const start = useStartRun();

  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [topic, setTopic] = useState("");
  const [mainKeyword, setMainKeyword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const run = await start.mutateAsync({
      projectId,
      templateId,
      input: {
        topic,
        mainKeyword: mainKeyword || undefined,
      },
    });
    router.push(`/runs/${run.id}`);
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>
      <h1 className="text-2xl font-semibold">Nowy run</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Projekt</label>
          <select
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— wybierz —</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Szablon</label>
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— wybierz —</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} v{t.version}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Temat</label>
          <input
            required
            minLength={3}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="np. Jak małe firmy mogą wykorzystać AI"
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">
            Główne słowo kluczowe (opcjonalnie)
          </label>
          <input
            value={mainKeyword}
            onChange={(e) => setMainKeyword(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={
            !projectId || !templateId || topic.length < 3 || start.isPending
          }
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {start.isPending ? "Startuję…" : "Start"}
        </button>
        {start.error && (
          <p className="text-red-500">Błąd: {String(start.error)}</p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create apps/web/src/app/runs/[id]/page.tsx**

```tsx
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useRun } from "@/lib/hooks";
import { RunTimeline } from "@/components/run-timeline";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const run = useRun(params?.id);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();

  const selectedStep =
    run.data?.steps.find((s) => s.id === selectedStepId) ?? run.data?.steps[0];

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Wróć
      </Link>

      {run.isLoading && <p>Ładowanie…</p>}
      {run.error && <p className="text-red-500">Błąd: {String(run.error)}</p>}

      {run.data && (
        <>
          <header>
            <h1 className="text-2xl font-semibold">
              Run {run.data.id.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">
              status: <span className="font-mono">{run.data.status}</span>
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
            <aside>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Kroki
              </h2>
              <RunTimeline
                steps={run.data.steps}
                selectedStepId={selectedStep?.id}
                onSelectStep={setSelectedStepId}
              />
            </aside>

            <section className="min-w-0">
              {selectedStep ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">
                    {selectedStep.stepKey}{" "}
                    <span className="text-sm text-muted-foreground">
                      ({selectedStep.type})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Output
                    </h3>
                    <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                      {selectedStep.output
                        ? JSON.stringify(selectedStep.output, null, 2)
                        : "—"}
                    </pre>
                  </div>
                  {selectedStep.error && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-red-600">
                        Error
                      </h3>
                      <pre className="overflow-x-auto rounded bg-red-50 p-3 text-xs">
                        {JSON.stringify(selectedStep.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Wybierz krok po lewej.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @sensai/web typecheck
git add apps/web/src
git commit -m "feat(web): add home, new run, and run detail pages with polling"
```

---

## Task 19: End-to-end smoke test — manual through UI

**Files:** none — verification step.

Pre-req: Postgres + Redis running (`pnpm dev:infra`), migrations applied (`pnpm db:migrate`), seed ran (`pnpm db:seed`), `OPENROUTER_API_KEY` set in `apps/api/.env`.

- [ ] **Step 1: Copy frontend env**

```bash
cp apps/web/.env.example apps/web/.env.local
# Ensure NEXT_PUBLIC_API_TOKEN matches apps/api/.env API_BEARER_TOKEN
```

- [ ] **Step 2: Start backend and frontend in parallel**

Terminal 1:

```bash
pnpm dev:api
```

Terminal 2:

```bash
pnpm dev:web
```

- [ ] **Step 3: Navigate through the flow**

1. Open `http://localhost:3000` — home should show "Brak runów".
2. Click "+ Nowy run".
3. Select "Demo Project" and "Brief only (MVP) v1".
4. Enter topic: `Jak małe firmy mogą wykorzystać AI w obsłudze klienta`.
5. Click "Start".
6. Expect redirect to `/runs/<id>`.
7. Observe timeline: `brief` starts in `pending`, flips to `running`, then `completed` within ~30s.
8. Click the completed step — the right panel shows JSON output with `headline`, `angle`, `pillars`, etc.
9. Return to home (`←`) — run appears in list with status `completed`.

- [ ] **Step 4: Confirm cost tracking**

```bash
docker exec -it sensai-postgres-dev psql -U sensai -d sensai -c \
  "SELECT run_id, model, prompt_tokens, completion_tokens, cost_usd FROM llm_calls ORDER BY created_at DESC LIMIT 5;"
```

Expected: row(s) with non-zero values.

- [ ] **Step 5: Confirm failure path**

1. Temporarily break API key: set `OPENROUTER_API_KEY=invalid` in `apps/api/.env`, restart API.
2. Start another run through UI.
3. Observe: run goes `pending` → `running` → (after 3 retries with backoff) `failed`.
4. Open run detail: step shows `failed` status + error panel with message.
5. Restore valid API key, restart API.

- [ ] **Step 6: Update README with "Works end-to-end" section**

Append to `README.md`:

```markdown
## Verified end-to-end (Plan 1)

Smoke-tested: create run via UI → OpenRouter LLM call → brief output JSON → cost recorded in `llm_calls`.
Failure path: 3 retries + `failed` status + error visible in UI.
Reconcile: restart during active run resumes automatically.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: verify plan 1 end-to-end flow"
```

---

## Self-Review (checklist)

### Spec coverage

- [x] Monorepo + pnpm workspaces — Task 1, 3, 4, 16
- [x] Docker Compose dev infra (Postgres + Redis) — Task 2
- [x] All 7 DB tables (projects, pipeline_templates, pipeline_runs, pipeline_steps, llm_calls, tool_calls, tool_cache) — Task 5
- [x] Drizzle ORM + migrations — Task 5
- [x] Projects / templates / runs CRUD APIs — Task 6, 7, 12
- [x] BullMQ orchestrator (queue, worker, orchestrator service) — Task 11
- [x] StepHandler plugin registry — Task 9, 10
- [x] First LLM handler (`llm.brief`) with structured output — Task 10
- [x] LLMClient over AI SDK + OpenRouter + cost tracking to `llm_calls` — Task 8
- [x] Reconcile at startup — Task 11 (ReconcileService)
- [x] Auth guard (bearer token) — Task 13
- [x] Next.js frontend scaffold with Tailwind, TanStack Query — Task 16
- [x] API client + hooks — Task 17
- [x] Views: home, new run, run detail (polling) — Task 18
- [x] Seed script — Task 14
- [x] End-to-end verification — Task 15 (backend) + Task 19 (full)

### Out of scope — deferred to later plans

- Tools layer (DataForSEO, crawl4ai, Firecrawl) — Plan Two
- tool_cache implementation usage (schema is present; logic comes with tools) — Plan Two
- Checkpoints + approval flow — Plan Three
- SSE / live streaming — Plan Three
- Export (MD/DOCX/HTML) — Plan Three
- Cost safeguards, health checks, backups, deploy — Plan Four
- Testcontainers integration tests, Playwright — Plan Four

### Placeholder scan

No TBDs, TODOs, or vague instructions. Every code step has actual code. Every verification step has expected output.

### Type consistency

- `DB_TOKEN` uniformly used from `db.module.ts` in all services
- `StepContext` / `StepResult` / `StepHandler` consistent between `step-handler.ts`, `brief.handler.ts`, `pipeline.worker.ts`
- `PipelineWorker` uses `step.type` (not `step_key`) to resolve handler, matches `StepHandler.type`
- `StartRunDto` shared from `@sensai/shared` used identically in controller + hook + API client
- Queue name `"pipeline-steps"` consistent (`queue.constants.ts` defines once)
- Bearer token env var `API_BEARER_TOKEN` consistent between api `.env.example`, guard, and smoke-test `curl`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-plan-01-foundation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
