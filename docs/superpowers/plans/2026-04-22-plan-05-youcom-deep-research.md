# Plan 05 — you.com Deep Research: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać nowy typ kroku `tool.youcom.research` (pierwszy etap w pipeline przed SERP/scrape/brief) bazujący na [you.com Research API](https://you.com/docs/api-reference/research/v1-research), z cache'owaniem, audit trail i rozszerzeniem briefu o nowy kontekst.

**Architecture:** Cienki `YoucomClient` (HTTP, `AbortSignal.timeout(300_000)`, X-API-Key, 0 retries — BullMQ retryuje 3×). Handler korzysta z istniejącego `ToolCacheService.getOrSet` (cache + recorder w jednym). Prompt builder w osobnym pliku (per-project override przez `promptOverrides`). Nowa schema `ResearchBriefing` w shared. Rozszerzenie `BriefHandler` o 4. opcjonalny `previousOutputs.deepResearch`. Nowa templatka „Blog SEO — deep research" v1. Auto step (bez checkpointu).

**Tech Stack:** NestJS, Drizzle ORM, Vitest, Zod, native fetch + `AbortSignal.timeout`. Zero nowych zależności npm.

**Spec:** `docs/superpowers/specs/2026-04-22-plan-05-youcom-deep-research-design.md`

---

## Zasady pracy

- **TDD**: najpierw test (failing), potem minimalna implementacja, potem zielono, potem commit
- **Commit convention**: `<type>(scope): krótki opis` — np. `feat(api): add YoucomClient`, `test(api): add youcom client tests`
- **Branch**: `feat/plan-05-youcom` — tworzymy w Tasku 0 przed pierwszym commitem
- **Uruchamianie testów**: `pnpm --filter @sensai/api test` (wszystkie) lub `pnpm --filter @sensai/api test path/to/file` (jeden)
- **Shared package gotcha**: po zmianie `packages/shared/src/schemas.ts` wymagany `pnpm --filter @sensai/shared build` przed testami API (z memory)

---

## Struktura plików (mapa)

**Nowe pliki:**
- `apps/api/src/tools/youcom/youcom.errors.ts` — `YoucomApiError`
- `apps/api/src/tools/youcom/youcom.types.ts` — request/response types + `YOUCOM_COST_USD` map + `ResearchEffort`
- `apps/api/src/tools/youcom/youcom.client.ts` — HTTP klient
- `apps/api/src/tools/youcom/youcom.module.ts` — NestJS module
- `apps/api/src/prompts/youcom-research.prompt.ts` — prompt builder + interpolacja override
- `apps/api/src/handlers/youcom-research.handler.ts` — step handler
- `apps/api/src/tests/youcom.client.test.ts` — unit testy klienta
- `apps/api/src/tests/youcom-research.prompt.test.ts` — unit testy prompt buildera
- `apps/api/src/tests/youcom-research.handler.test.ts` — unit testy handlera
- `scripts/smoke-plan-05.ts` — manualny smoke test

**Modyfikowane:**
- `packages/shared/src/schemas.ts` — `ResearchEffort`, `ResearchSource`, `ResearchBriefing` + `ProjectConfig.researchEffort`
- `apps/api/src/config/env.ts` — `YOUCOM_API_KEY`, `YOUCOM_BASE_URL`, `YOUCOM_TIMEOUT_MS`, `YOUCOM_DEFAULT_EFFORT`, `YOUCOM_COST_*`
- `apps/api/src/tools/tools.module.ts` — import + export `YoucomModule`
- `apps/api/src/handlers/handlers.module.ts` — rejestracja `YoucomResearchHandler`
- `apps/api/src/handlers/brief.handler.ts` — czytanie `previousOutputs.deepResearch`
- `apps/api/src/prompts/brief.prompt.ts` — 4. opcjonalny argument `deepResearch`
- `apps/api/src/tests/brief.handler.test.ts` — regresyjny + happy path z deepResearch (o ile plik istnieje; jeśli nie — tworzymy)
- `apps/api/src/seed/seed.ts` — 4. templatka „Blog SEO — deep research" v1
- `.env.example` — sekcja YOUCOM_*
- `README.md` — sekcja Development o you.com (opcjonalnie, jeśli potrzebne)

---

## Przegląd tasków

0. Branch `feat/plan-05-youcom`
1. Shared schema: `ResearchEffort`, `ResearchSource`, `ResearchBriefing` + `ProjectConfig.researchEffort`
2. Env: `YOUCOM_*` w `config/env.ts`
3. `YoucomApiError`
4. `YoucomClient` + `youcom.types.ts` (+ unit testy)
5. `YoucomModule` + wire-up w `tools.module.ts`
6. `youcomResearchPrompt` + unit testy
7. `YoucomResearchHandler` + unit testy
8. Rejestracja handlera w `handlers.module.ts`
9. `briefPrompt.user` — 4. opcjonalny argument
10. `BriefHandler` — czytanie `previousOutputs.deepResearch`
11. Seed: 4. templatka „Blog SEO — deep research" v1
12. `.env.example` aktualizacja
13. Smoke script `scripts/smoke-plan-05.ts`
14. Manualny smoke test + aktualizacja pricing w `.env.example`

---

## Task 0: Branch feature

**Pliki:** brak

- [ ] **Step 1: Utwórz gałąź**

```bash
git checkout -b feat/plan-05-youcom
```

- [ ] **Step 2: Weryfikacja**

```bash
git branch --show-current
```

Expected: `feat/plan-05-youcom`

---

## Task 1: Shared schema — `ResearchEffort`, `ResearchSource`, `ResearchBriefing` + `ProjectConfig.researchEffort`

**Pliki:**
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Odczytaj aktualny `ProjectConfig` i lokalizację dla nowych schem**

```bash
sed -n '37,55p' packages/shared/src/schemas.ts
```

Upewnij się, że `ProjectConfig` **NIE** ma pola `researchEffort` i że `ResearchBriefing` jeszcze nie istnieje.

- [ ] **Step 2: Dodaj trzy nowe schematy po `RunInput` (ok. linii ~62)**

Wstaw poniższe w `packages/shared/src/schemas.ts` **bezpośrednio pod** deklaracją `export type RunInput = …`:

```ts
export const ResearchEffort = z.enum(["lite", "standard", "deep", "exhaustive"]);
export type ResearchEffort = z.infer<typeof ResearchEffort>;

export const ResearchSource = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippets: z.string().array().default([]),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

export const ResearchBriefing = z.object({
  content: z.string(),
  sources: ResearchSource.array(),
});
export type ResearchBriefing = z.infer<typeof ResearchBriefing>;
```

- [ ] **Step 3: Rozszerz `ProjectConfig` o `researchEffort`**

Zmień istniejący `ProjectConfig` tak, żeby w ciele obiektu doszło `researchEffort`:

```ts
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
  researchEffort: ResearchEffort.optional(),
  promptOverrides: z.record(z.string()).default({}),
});
```

**Uwaga:** `ResearchEffort` musi być zdefiniowane wyżej w pliku niż użycie w `ProjectConfig`. Jeśli nowe schematy dodałeś **pod** `RunInput`, a `ProjectConfig` jest **nad** — przenieś deklaracje `ResearchEffort`/`ResearchSource`/`ResearchBriefing` **nad** `ProjectConfig` (tuż pod bloki `StepStatus`, `StepDef`, `TemplateStepsDef`).

- [ ] **Step 4: Zbuduj paczkę shared**

```bash
pnpm --filter @sensai/shared build
```

Expected: success, brak TS errorów.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add ResearchEffort, ResearchSource, ResearchBriefing + ProjectConfig.researchEffort"
```

---

## Task 2: Env — `YOUCOM_*`

**Pliki:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Odczytaj aktualny schemat**

```bash
cat apps/api/src/config/env.ts
```

- [ ] **Step 2: Dodaj pola `YOUCOM_*`**

W `EnvSchema` dodaj **przed** linią `MAX_COST_PER_RUN_USD`:

```ts
  YOUCOM_API_KEY: z.string().min(1),
  YOUCOM_BASE_URL: z.string().url().default("https://api.you.com"),
  YOUCOM_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  YOUCOM_DEFAULT_EFFORT: z.enum(["lite", "standard", "deep", "exhaustive"]).default("deep"),
  YOUCOM_COST_LITE: z.coerce.number().nonnegative().default(0.02),
  YOUCOM_COST_STANDARD: z.coerce.number().nonnegative().default(0.05),
  YOUCOM_COST_DEEP: z.coerce.number().nonnegative().default(0.15),
  YOUCOM_COST_EXHAUSTIVE: z.coerce.number().nonnegative().default(0.40),
```

**Uwaga:** `YOUCOM_API_KEY` jest required (`.min(1)`) — spójnie z `FIRECRAWL_API_KEY` i `OPENROUTER_API_KEY`. Dev/test setupy muszą ustawić wartość (np. `dummy-key-for-dev`); testy jednostkowe podmieniają klienta mockiem więc env nie jest potrzebny. Konstruktor `YoucomClient` dodatkowo rzuca przy pustym stringu — defensive (pokryte testami w Task 4).

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @sensai/api exec tsc --noEmit
```

Expected: brak errorów (typ `Env` propaguje automatycznie bo jest `z.infer`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat(api): add YOUCOM_* env vars (api key, base url, timeout, effort, costs)"
```

---

## Task 3: `YoucomApiError`

**Pliki:**
- Create: `apps/api/src/tools/youcom/youcom.errors.ts`

- [ ] **Step 1: Utwórz katalog i plik**

```bash
mkdir -p apps/api/src/tools/youcom
```

Stwórz `apps/api/src/tools/youcom/youcom.errors.ts`:

```ts
export class YoucomApiError extends Error {
  public readonly code = "youcom_api_error";
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`youcom ${endpoint} responded ${status}: ${body.slice(0, 200)}`);
    this.name = "YoucomApiError";
  }
}
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter @sensai/api exec tsc --noEmit
```

Expected: brak errorów.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tools/youcom/youcom.errors.ts
git commit -m "feat(api): add YoucomApiError"
```

---

## Task 4: `YoucomClient` + `youcom.types.ts` (TDD)

**Pliki:**
- Create: `apps/api/src/tools/youcom/youcom.types.ts`
- Create: `apps/api/src/tools/youcom/youcom.client.ts`
- Create: `apps/api/src/tests/youcom.client.test.ts`

- [ ] **Step 1: Utwórz typy i tabelę kosztów**

Stwórz `apps/api/src/tools/youcom/youcom.types.ts`:

```ts
import type { Env } from "../../config/env";
import type { ResearchEffort } from "@sensai/shared";

export type { ResearchEffort };

export interface YoucomResearchRequest {
  input: string;
  research_effort: ResearchEffort;
}

export interface YoucomResearchSource {
  url: string;
  title?: string;
  snippets?: string[];
}

export interface YoucomResearchResponse {
  output: {
    content: string;
    content_type: "text";
    sources: YoucomResearchSource[];
  };
}

export type YoucomEnv = Pick<
  Env,
  | "YOUCOM_API_KEY"
  | "YOUCOM_BASE_URL"
  | "YOUCOM_TIMEOUT_MS"
  | "YOUCOM_COST_LITE"
  | "YOUCOM_COST_STANDARD"
  | "YOUCOM_COST_DEEP"
  | "YOUCOM_COST_EXHAUSTIVE"
>;

export function youcomCostUsd(env: YoucomEnv, effort: ResearchEffort): string {
  const lookup: Record<ResearchEffort, number> = {
    lite: env.YOUCOM_COST_LITE,
    standard: env.YOUCOM_COST_STANDARD,
    deep: env.YOUCOM_COST_DEEP,
    exhaustive: env.YOUCOM_COST_EXHAUSTIVE,
  };
  return lookup[effort].toString();
}
```

- [ ] **Step 2: Napisz failing testy klienta**

Stwórz `apps/api/src/tests/youcom.client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { YoucomClient } from "../tools/youcom/youcom.client";
import { YoucomApiError } from "../tools/youcom/youcom.errors";

const fakeEnv = {
  YOUCOM_API_KEY: "test-key-123",
  YOUCOM_BASE_URL: "https://api.you.com",
  YOUCOM_TIMEOUT_MS: 300_000,
  YOUCOM_COST_LITE: 0.02,
  YOUCOM_COST_STANDARD: 0.05,
  YOUCOM_COST_DEEP: 0.15,
  YOUCOM_COST_EXHAUSTIVE: 0.40,
} as any;

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("YoucomClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to /v1/research with X-API-Key and JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      output: {
        content: "Research briefing with [1] citations.",
        content_type: "text",
        sources: [{ url: "https://example.com/a", title: "A", snippets: ["snippet"] }],
      },
    }));

    const client = new YoucomClient(fakeEnv);
    const out = await client.research({ input: "Topic", research_effort: "deep" });

    expect(out.output.content).toContain("Research briefing");
    expect(out.output.sources).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.you.com/v1/research");
    expect(init?.method).toBe("POST");
    expect((init?.headers as any)?.["X-API-Key"]).toBe("test-key-123");
    expect((init?.headers as any)?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({
      input: "Topic",
      research_effort: "deep",
    });
  });

  it("throws YoucomApiError on 401", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 401, endpoint: "/v1/research" });
  });

  it("throws YoucomApiError on 422", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(`{"detail":"input too long"}`, { status: 422 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 422 });
  });

  it("throws YoucomApiError on 500 WITHOUT retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 500 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when YOUCOM_API_KEY is empty (fail-fast at construction)", () => {
    const envNoKey = { ...fakeEnv, YOUCOM_API_KEY: "" };
    expect(() => new YoucomClient(envNoKey))
      .toThrow(/YOUCOM_API_KEY/);
  });

  it("throws when YOUCOM_API_KEY is undefined", () => {
    const envNoKey = { ...fakeEnv, YOUCOM_API_KEY: undefined };
    expect(() => new YoucomClient(envNoKey))
      .toThrow(/YOUCOM_API_KEY/);
  });
});
```

- [ ] **Step 3: Uruchom testy — oczekuj FAIL (brak implementacji)**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom.client.test.ts
```

Expected: FAIL (moduł `youcom.client` nie istnieje).

- [ ] **Step 4: Napisz minimalną implementację klienta**

Stwórz `apps/api/src/tools/youcom/youcom.client.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { YoucomApiError } from "./youcom.errors";
import type { YoucomEnv, YoucomResearchRequest, YoucomResearchResponse } from "./youcom.types";

@Injectable()
export class YoucomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(env: YoucomEnv) {
    if (!env.YOUCOM_API_KEY) {
      throw new Error("YOUCOM_API_KEY is required to use YoucomClient");
    }
    this.apiKey = env.YOUCOM_API_KEY;
    this.baseUrl = env.YOUCOM_BASE_URL;
    this.timeoutMs = env.YOUCOM_TIMEOUT_MS;
  }

  async research(body: YoucomResearchRequest): Promise<YoucomResearchResponse> {
    const endpoint = "/v1/research";
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new YoucomApiError(res.status, text, endpoint);
    }
    return (await res.json()) as YoucomResearchResponse;
  }
}
```

- [ ] **Step 5: Uruchom testy — oczekuj PASS**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom.client.test.ts
```

Expected: 6/6 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tools/youcom/youcom.client.ts apps/api/src/tools/youcom/youcom.types.ts apps/api/src/tests/youcom.client.test.ts
git commit -m "feat(api): add YoucomClient with X-API-Key auth + typed errors"
```

---

## Task 5: `YoucomModule` + wire-up w `tools.module.ts`

**Pliki:**
- Create: `apps/api/src/tools/youcom/youcom.module.ts`
- Modify: `apps/api/src/tools/tools.module.ts`

- [ ] **Step 1: Utwórz module**

Stwórz `apps/api/src/tools/youcom/youcom.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { YoucomClient } from "./youcom.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: YoucomClient,
      useFactory: () => new YoucomClient(loadEnv()),
    },
  ],
  exports: [YoucomClient],
})
export class YoucomModule {}
```

**Uwaga:** Nest domyślnie eagerly instancjuje providery przy boocie. Przy poprawnie ustawionym `YOUCOM_API_KEY` (required w env schemie — Task 2) to bezproblemowe. Pattern identyczny z `Crawl4aiModule`.

- [ ] **Step 2: Zaimportuj `YoucomModule` w `tools.module.ts`**

Zastąp zawartość `apps/api/src/tools/tools.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { ToolCallRecorder } from "./tool-call-recorder.service";
import { ToolCacheService } from "./tool-cache.service";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { FirecrawlModule } from "./firecrawl/firecrawl.module";
import { Crawl4aiModule } from "./crawl4ai/crawl4ai.module";
import { YoucomModule } from "./youcom/youcom.module";

@Module({
  imports: [DbModule, DataForSeoModule, FirecrawlModule, Crawl4aiModule, YoucomModule],
  providers: [ToolCallRecorder, ToolCacheService],
  exports: [ToolCacheService, ToolCallRecorder, DataForSeoModule, FirecrawlModule, Crawl4aiModule, YoucomModule],
})
export class ToolsModule {}
```

- [ ] **Step 3: TypeCheck + build**

```bash
pnpm --filter @sensai/api exec tsc --noEmit
```

Expected: brak errorów.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/tools/youcom/youcom.module.ts apps/api/src/tools/tools.module.ts
git commit -m "feat(api): wire YoucomModule into tools.module"
```

---

## Task 6: `youcomResearchPrompt` (TDD)

**Pliki:**
- Create: `apps/api/src/prompts/youcom-research.prompt.ts`
- Create: `apps/api/src/tests/youcom-research.prompt.test.ts`

- [ ] **Step 1: Napisz failing testy prompt buildera**

Stwórz `apps/api/src/tests/youcom-research.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { youcomResearchPrompt } from "../prompts/youcom-research.prompt";
import type { RunInput } from "@sensai/shared";

describe("youcomResearchPrompt", () => {
  it("default: uses all provided fields", () => {
    const input: RunInput = {
      topic: "Jak nauczyć się Rust",
      mainKeyword: "rust programming",
      intent: "informational",
      contentType: "blog-seo",
    };
    const out = youcomResearchPrompt.user(input);
    expect(out).toContain("Jak nauczyć się Rust");
    expect(out).toContain("rust programming");
    expect(out).toContain("informational");
    expect(out).toContain("blog-seo");
    expect(out).toContain("Cover: key facts");
  });

  it("default: skips optional fields when not present", () => {
    const input: RunInput = { topic: "Topic only" };
    const out = youcomResearchPrompt.user(input);
    expect(out).toContain("Topic only");
    expect(out).not.toMatch(/Target keyword/);
    expect(out).not.toMatch(/Search intent/);
    expect(out).not.toMatch(/Content type/);
  });

  it("override: interpolates {topic}, {mainKeyword}, {intent}, {contentType}", () => {
    const input: RunInput = {
      topic: "T",
      mainKeyword: "K",
      intent: "I",
      contentType: "C",
    };
    const override =
      "Research: {topic} | kw: {mainKeyword} | intent: {intent} | type: {contentType}";
    const out = youcomResearchPrompt.user(input, override);
    expect(out).toBe("Research: T | kw: K | intent: I | type: C");
  });

  it("override: leaves unknown placeholders untouched", () => {
    const input: RunInput = { topic: "X" };
    const out = youcomResearchPrompt.user(input, "Topic {topic}, other {foo}");
    expect(out).toBe("Topic X, other {foo}");
  });

  it("override: missing optional fields become empty string", () => {
    const input: RunInput = { topic: "X" };
    const out = youcomResearchPrompt.user(input, "{topic}|{mainKeyword}|{intent}");
    expect(out).toBe("X||");
  });
});
```

- [ ] **Step 2: Uruchom testy — oczekuj FAIL**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom-research.prompt.test.ts
```

Expected: FAIL (moduł `youcom-research.prompt` nie istnieje).

- [ ] **Step 3: Implementacja prompt buildera**

Stwórz `apps/api/src/prompts/youcom-research.prompt.ts`:

```ts
import type { RunInput } from "@sensai/shared";

const PLACEHOLDERS = ["topic", "mainKeyword", "intent", "contentType"] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];

function interpolate(template: string, values: Record<Placeholder, string>): string {
  return PLACEHOLDERS.reduce(
    (acc, key) => acc.replaceAll(`{${key}}`, values[key]),
    template,
  );
}

function defaultPrompt(input: RunInput): string {
  const lines: (string | false | undefined)[] = [
    `Provide a deep research briefing for an article on: ${input.topic}.`,
    input.mainKeyword && `Target keyword: ${input.mainKeyword}.`,
    input.intent && `Search intent: ${input.intent}.`,
    input.contentType && `Content type: ${input.contentType}.`,
    "",
    "Cover: key facts, recent developments (last 12 months), expert perspectives, common misconceptions, concrete data points with source URLs. Be thorough and cite every claim.",
  ];
  return lines.filter(Boolean).join("\n");
}

export const youcomResearchPrompt = {
  user(input: RunInput, override?: string): string {
    if (override) {
      return interpolate(override, {
        topic: input.topic,
        mainKeyword: input.mainKeyword ?? "",
        intent: input.intent ?? "",
        contentType: input.contentType ?? "",
      });
    }
    return defaultPrompt(input);
  },
};
```

- [ ] **Step 4: Uruchom testy — oczekuj PASS**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom-research.prompt.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/youcom-research.prompt.ts apps/api/src/tests/youcom-research.prompt.test.ts
git commit -m "feat(api): add youcomResearchPrompt (default + per-project override)"
```

---

## Task 7: `YoucomResearchHandler` (TDD)

**Pliki:**
- Create: `apps/api/src/handlers/youcom-research.handler.ts`
- Create: `apps/api/src/tests/youcom-research.handler.test.ts`

**Założenie orkiestracyjne:** handler używa istniejącego `ToolCacheService.getOrSet`, który sam ogarnia cache lookup, cache store, recorder (w tym `error` przy fetcher throw). Handler dostarcza tylko: prompt build, effort resolve, fetcher (klient + Zod parse + cost/latency).

- [ ] **Step 1: Napisz failing testy handlera**

Stwórz `apps/api/src/tests/youcom-research.handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { YoucomResearchHandler } from "../handlers/youcom-research.handler";
import type { YoucomClient } from "../tools/youcom/youcom.client";
import type { ToolCacheService } from "../tools/tool-cache.service";
import type { StepContext } from "../orchestrator/step-handler";

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: { id: "run-1", input: { topic: "Rust basics" } } as any,
    step: { id: "step-1" } as any,
    project: {
      id: "proj-1",
      name: "Demo",
      config: {
        toneOfVoice: "", targetAudience: "", guidelines: "",
        defaultModels: {}, promptOverrides: {},
      },
    } as any,
    previousOutputs: {},
    attempt: 1,
    ...overrides,
  };
}

const env = {
  YOUCOM_DEFAULT_EFFORT: "deep",
  YOUCOM_COST_LITE: 0.02,
  YOUCOM_COST_STANDARD: 0.05,
  YOUCOM_COST_DEEP: 0.15,
  YOUCOM_COST_EXHAUSTIVE: 0.40,
} as any;

describe("YoucomResearchHandler", () => {
  let client: { research: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: YoucomResearchHandler;

  beforeEach(() => {
    client = { research: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new YoucomResearchHandler(client as any, cache as unknown as ToolCacheService, env);
  });

  it("reports type 'tool.youcom.research'", () => {
    expect(handler.type).toBe("tool.youcom.research");
  });

  it("happy path: calls cache.getOrSet with resolved effort and builds prompt from RunInput", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      // simulate cache miss by invoking fetcher
      const fetched = await opts.fetcher();
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: {
        content: "Summary [1].",
        content_type: "text",
        sources: [{ url: "https://example.com", title: "A", snippets: ["s"] }],
      },
    });

    const ctx = makeCtx();
    const out = await handler.execute(ctx);

    expect(out.output).toEqual({
      content: "Summary [1].",
      sources: [{ url: "https://example.com", title: "A", snippets: ["s"] }],
    });

    const getOrSetCall = cache.getOrSet.mock.calls[0][0];
    expect(getOrSetCall.tool).toBe("youcom");
    expect(getOrSetCall.method).toBe("research");
    expect(getOrSetCall.params).toMatchObject({ effort: "deep" });
    expect(getOrSetCall.params.input).toContain("Rust basics");
    expect(getOrSetCall.ttlSeconds).toBe(14 * 24 * 3600);
    expect(getOrSetCall.runId).toBe("run-1");
    expect(getOrSetCall.stepId).toBe("step-1");

    const clientCall = client.research.mock.calls[0][0];
    expect(clientCall.research_effort).toBe("deep");
    expect(clientCall.input).toContain("Rust basics");
  });

  it("effort resolution: uses project.config.researchEffort when present", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    const ctx = makeCtx({
      project: {
        id: "p", name: "P",
        config: {
          toneOfVoice: "", targetAudience: "", guidelines: "",
          defaultModels: {}, promptOverrides: {},
          researchEffort: "exhaustive",
        },
      } as any,
    });
    await handler.execute(ctx);

    expect(client.research.mock.calls[0][0].research_effort).toBe("exhaustive");
    expect(cache.getOrSet.mock.calls[0][0].params.effort).toBe("exhaustive");
  });

  it("promptOverride: uses project.config.promptOverrides['tool.youcom.research'] with interpolation", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    const ctx = makeCtx({
      run: { id: "r", input: { topic: "T", mainKeyword: "K" } } as any,
      project: {
        id: "p", name: "P",
        config: {
          toneOfVoice: "", targetAudience: "", guidelines: "",
          defaultModels: {},
          promptOverrides: { "tool.youcom.research": "Research: {topic} | {mainKeyword}" },
        },
      } as any,
    });
    await handler.execute(ctx);

    expect(client.research.mock.calls[0][0].input).toBe("Research: T | K");
  });

  it("input > 40k chars: throws BEFORE calling cache/client", async () => {
    const bigTopic = "a".repeat(41_000);
    const ctx = makeCtx({
      run: { id: "r", input: { topic: bigTopic } } as any,
    });

    await expect(handler.execute(ctx)).rejects.toThrow(/40000|40k/);
    expect(cache.getOrSet).not.toHaveBeenCalled();
    expect(client.research).not.toHaveBeenCalled();
  });

  it("schema drift: Zod parse error propagates from fetcher", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: 123 as any, content_type: "text", sources: [] },
    });

    const ctx = makeCtx();
    await expect(handler.execute(ctx)).rejects.toThrow();
  });

  it("cost: fetcher returns YOUCOM_COST_DEEP for deep effort", async () => {
    let capturedCost: string | undefined;
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      capturedCost = fetched.costUsd;
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    await handler.execute(makeCtx());
    expect(capturedCost).toBe("0.15");
  });

  it("latency: fetcher reports non-negative integer latencyMs", async () => {
    let capturedLatency = -1;
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      capturedLatency = fetched.latencyMs;
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    await handler.execute(makeCtx());
    expect(capturedLatency).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(capturedLatency)).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom testy — oczekuj FAIL**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom-research.handler.test.ts
```

Expected: FAIL (moduł `youcom-research.handler` nie istnieje).

- [ ] **Step 3: Implementacja handlera**

Stwórz `apps/api/src/handlers/youcom-research.handler.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { YoucomClient } from "../tools/youcom/youcom.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { youcomCostUsd } from "../tools/youcom/youcom.types";
import { youcomResearchPrompt } from "../prompts/youcom-research.prompt";
import { ResearchBriefing, type ProjectConfig, type ResearchEffort, type RunInput } from "@sensai/shared";
import { loadEnv, type Env } from "../config/env";

const MAX_INPUT_CHARS = 40_000;
const TTL_DAYS = 14;

type YoucomHandlerEnv = Pick<
  Env,
  | "YOUCOM_DEFAULT_EFFORT"
  | "YOUCOM_COST_LITE"
  | "YOUCOM_COST_STANDARD"
  | "YOUCOM_COST_DEEP"
  | "YOUCOM_COST_EXHAUSTIVE"
>;

@Injectable()
export class YoucomResearchHandler implements StepHandler {
  readonly type = "tool.youcom.research";

  constructor(
    private readonly client: YoucomClient,
    private readonly cache: ToolCacheService,
    @Inject("YOUCOM_ENV") private readonly env: YoucomHandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const runInput = ctx.run.input as RunInput;

    const effort: ResearchEffort = cfg.researchEffort ?? this.env.YOUCOM_DEFAULT_EFFORT;
    const override = cfg.promptOverrides?.[this.type];
    const promptString = youcomResearchPrompt.user(runInput, override);

    if (promptString.length > MAX_INPUT_CHARS) {
      throw new Error(
        `youcom input exceeds ${MAX_INPUT_CHARS} chars (got ${promptString.length})`,
      );
    }

    const briefing = await this.cache.getOrSet({
      tool: "youcom",
      method: "research",
      params: { input: promptString, effort },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.research({
          input: promptString,
          research_effort: effort,
        });
        const latencyMs = Date.now() - t0;
        const result = ResearchBriefing.parse({
          content: raw.output.content,
          sources: raw.output.sources,
        });
        return {
          result,
          costUsd: youcomCostUsd(this.env, effort),
          latencyMs,
        };
      },
    });

    return { output: briefing };
  }
}
```

**Uwaga DI:** handler injectuje `env` przez token `"YOUCOM_ENV"`. W teście jednostkowym konstruujemy handler ręcznie (patrz testy: `new YoucomResearchHandler(client, cache, env)`), więc token nie jest potrzebny. W Nest'cie wire-upujemy token w Tasku 8.

- [ ] **Step 4: Uruchom testy — oczekuj PASS**

```bash
pnpm --filter @sensai/api test apps/api/src/tests/youcom-research.handler.test.ts
```

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/youcom-research.handler.ts apps/api/src/tests/youcom-research.handler.test.ts
git commit -m "feat(api): add YoucomResearchHandler (cache-wrapped research with effort resolution + prompt override)"
```

---

## Task 8: Rejestracja handlera w `handlers.module.ts`

**Pliki:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 1: Odczytaj aktualny stan modułu**

```bash
cat apps/api/src/handlers/handlers.module.ts
```

- [ ] **Step 2: Dodaj `YoucomResearchHandler` + token `YOUCOM_ENV`**

Zastąp zawartość `apps/api/src/handlers/handlers.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { YoucomResearchHandler } from "./youcom-research.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";
import { loadEnv } from "../config/env";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    ScrapeFetchHandler,
    YoucomResearchHandler,
    {
      provide: "YOUCOM_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
        youcom: YoucomResearchHandler,
      ): StepHandler[] => [brief, serp, scrape, youcom],
      inject: [BriefHandler, SerpFetchHandler, ScrapeFetchHandler, YoucomResearchHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
```

- [ ] **Step 3: TypeCheck + uruchom wszystkie testy API**

```bash
pnpm --filter @sensai/api exec tsc --noEmit && pnpm --filter @sensai/api test
```

Expected: brak errorów TS, wszystkie testy zielone.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register YoucomResearchHandler in STEP_HANDLERS registry"
```

---

## Task 9: `briefPrompt.user` — 4. opcjonalny argument `deepResearch`

**Pliki:**
- Modify: `apps/api/src/prompts/brief.prompt.ts`

- [ ] **Step 1: Rozszerz prompt o formatter + nowy argument**

Zastąp zawartość `apps/api/src/prompts/brief.prompt.ts`:

```ts
import { z } from "zod";
import type { ProjectRow } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput, ResearchBriefing } from "@sensai/shared";
import type { ScrapePage } from "@sensai/shared";
import type { SerpItem } from "../tools/dataforseo/serp.types";

export const BriefOutputSchema = z.object({
  headline: z.string(),
  angle: z.string().describe("Unikalny kąt ujęcia tematu"),
  pillars: z.array(z.string()).min(3).max(6).describe("Główne filary treści (3-6 punktów)"),
  audiencePainPoints: z.array(z.string()).min(2).max(5),
  successCriteria: z.string().describe("Jak wyglądałby idealny artykuł?"),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

function formatSerpContext(items: SerpItem[]): string {
  const lines = items.map((it, idx) =>
    `${idx + 1}. ${it.title}\n   ${it.url}\n   ${it.description}`,
  );
  return [
    "Konkurencja na to słowo kluczowe (top 10 wyników Google):",
    ...lines,
    "",
    "Przygotowując brief, weź pod uwagę jakie kąty są już mocno pokryte i zaproponuj angle który się wyróżnia.",
  ].join("\n");
}

function formatScrapeContext(pages: ScrapePage[]): string {
  const sections = pages.map((p) => [
    `### ${p.title || p.url}`,
    `URL: ${p.url}${p.truncated ? ` (skrócone do ${p.markdown.length} znaków z ${p.rawLength})` : ""}`,
    "",
    p.markdown,
  ].join("\n"));
  return [
    "## Treść stron konkurencji (wybranych przez operatora):",
    "",
    ...sections,
    "",
    "Wykorzystaj tę treść — znajdź luki jakościowe, wspólne tezy do powtórzenia, pomysły na unikalny angle.",
  ].join("\n");
}

function formatDeepResearch(r: ResearchBriefing): string {
  const sourceLines = r.sources.map((s, idx) =>
    `[${idx + 1}] ${s.title ? `${s.title} — ` : ""}${s.url}`,
  );
  return [
    "## Deep research briefing (z you.com):",
    "",
    r.content,
    "",
    "### Źródła",
    ...sourceLines,
    "",
    "Ten briefing zawiera syntezę wiedzy o temacie z wielu źródeł. Wykorzystaj fakty, dane i perspektywy ekspertów przy kształtowaniu kąta i filarów treści.",
  ].join("\n");
}

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
    ].filter(Boolean).join("\n\n");
  },
  user(
    input: RunInput,
    serpContext?: SerpItem[],
    scrapePages?: ScrapePage[],
    deepResearch?: ResearchBriefing,
  ) {
    const lines = [
      `Temat artykułu: ${input.topic}`,
      input.mainKeyword && `Główne słowo kluczowe: ${input.mainKeyword}`,
      input.intent && `Intent użytkownika: ${input.intent}`,
      input.contentType && `Typ treści: ${input.contentType}`,
    ].filter(Boolean);
    if (deepResearch && deepResearch.content.length > 0) {
      lines.push("", formatDeepResearch(deepResearch));
    }
    if (serpContext && serpContext.length > 0) {
      lines.push("", formatSerpContext(serpContext));
    }
    if (scrapePages && scrapePages.length > 0) {
      lines.push("", formatScrapeContext(scrapePages));
    }
    lines.push("", "Przygotuj brief.");
    return lines.join("\n");
  },
  schema: BriefOutputSchema,
};
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter @sensai/api exec tsc --noEmit
```

Expected: brak errorów (BriefHandler jeszcze wywołuje `.user(input, serp, scrape)` — 3 argumenty, 4. jest opcjonalny, więc OK).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/prompts/brief.prompt.ts
git commit -m "feat(api): extend briefPrompt.user with optional deepResearch argument"
```

---

## Task 10: `BriefHandler` — czytanie `previousOutputs.deepResearch`

**Pliki:**
- Modify: `apps/api/src/handlers/brief.handler.ts`

- [ ] **Step 1: Rozszerz handler o safeParse `ResearchBriefing`**

Zastąp zawartość `apps/api/src/handlers/brief.handler.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { LlmClient } from "../llm/llm.client";
import { briefPrompt } from "../prompts/brief.prompt";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";
import { ScrapeResult, ResearchBriefing } from "@sensai/shared";
import { SerpResult } from "../tools/dataforseo/serp.types";

@Injectable()
export class BriefHandler implements StepHandler {
  readonly type = "llm.brief";

  constructor(private readonly llm: LlmClient) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;
    const model = cfg.defaultModels?.brief;

    const research = SerpResult.safeParse(ctx.previousOutputs.research);
    const serpContext = research.success ? research.data.items : undefined;

    const scrapeParsed = ScrapeResult.safeParse(ctx.previousOutputs.scrape);
    const scrapePages = scrapeParsed.success ? scrapeParsed.data.pages : undefined;

    const deepResearchParsed = ResearchBriefing.safeParse(ctx.previousOutputs.deepResearch);
    const deepResearch = deepResearchParsed.success ? deepResearchParsed.data : undefined;

    const res = await this.llm.generateObject({
      ctx: {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        attempt: ctx.attempt,
        model,
      },
      system: briefPrompt.system(ctx.project),
      prompt: briefPrompt.user(input, serpContext, scrapePages, deepResearch),
      schema: briefPrompt.schema,
    });
    return { output: res.object };
  }
}
```

- [ ] **Step 2: Uruchom istniejące testy brief handlera (jeśli istnieją)**

```bash
ls apps/api/src/tests/ | grep brief
pnpm --filter @sensai/api test 2>&1 | tail -20
```

Expected: wszystkie testy zielone. Jeśli jakikolwiek test jawnie oczekuje 3-argumentowego `briefPrompt.user` — nie powinien padać, bo 4. argument jest opcjonalny; jeśli pada, dopasuj test minimalnie.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/handlers/brief.handler.ts
git commit -m "feat(api): wire deepResearch into BriefHandler previousOutputs"
```

---

## Task 11: Seed — 4. templatka „Blog SEO — deep research" v1

**Pliki:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Odczytaj aktualny seed**

```bash
cat apps/api/src/seed/seed.ts
```

- [ ] **Step 2: Dodaj 4. templatkę bezpośrednio po `briefResearchScrape`**

W `apps/api/src/seed/seed.ts` dodaj **po** bloku `const briefResearchScrape = await upsertTemplate(...)` (przed `console.log("Seeded:")`):

```ts
  const blogSeoDeepResearch = await upsertTemplate(db, "Blog SEO — deep research", 1, {
    steps: [
      { key: "deepResearch", type: "tool.youcom.research", auto: true },
      { key: "research",     type: "tool.serp.fetch",     auto: true },
      { key: "scrape",       type: "tool.scrape",         auto: false },
      { key: "brief",        type: "llm.brief",           auto: true },
    ],
  });
```

I dodaj do bloku `console.log`:

```ts
  console.log(`    "${blogSeoDeepResearch.name}" v${blogSeoDeepResearch.version}: ${blogSeoDeepResearch.id}`);
```

**Uwaga:** `scrape` zachowuje `auto: false` zgodnie z istniejącym flowem (checkpoint wyboru URL-i z SERP). Wszystkie pozostałe kroki są auto.

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @sensai/api exec tsc --noEmit
```

Expected: brak errorów.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed template 'Blog SEO — deep research' v1 (deepResearch → serp → scrape → brief)"
```

---

## Task 12: `.env.example` aktualizacja

**Pliki:**
- Modify: `.env.example`

- [ ] **Step 1: Odczytaj aktualny `.env.example`**

```bash
cat .env.example
```

- [ ] **Step 2: Dodaj sekcję YOUCOM**

Dopisz na końcu `.env.example` (po sekcji CRAWL4AI):

```env
# you.com Research API (Plan 05)
# Klucz pobierzesz z https://you.com/platform
YOUCOM_API_KEY=
YOUCOM_BASE_URL=https://api.you.com
YOUCOM_TIMEOUT_MS=300000
# lite | standard | deep | exhaustive
YOUCOM_DEFAULT_EFFORT=deep
# Koszty per effort — WSTĘPNE (provisional). Po pierwszym smoke teście zaktualizuj
# liczby z rzeczywistych danych z portalu you.com.
YOUCOM_COST_LITE=0.02
YOUCOM_COST_STANDARD=0.05
YOUCOM_COST_DEEP=0.15
YOUCOM_COST_EXHAUSTIVE=0.40
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document YOUCOM_* env vars in .env.example"
```

---

## Task 13: Smoke script `scripts/smoke-plan-05.ts`

**Pliki:**
- Create: `scripts/smoke-plan-05.ts`

- [ ] **Step 1: Odczytaj wzorzec z Plan 04 smoke**

```bash
cat scripts/smoke-plan-04.ts
```

(Referencja do struktury `apiFetch` + wait polling; tutaj wykorzystujemy ten sam pattern.)

- [ ] **Step 2: Utwórz smoke script**

Stwórz `scripts/smoke-plan-05.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 05 manual smoke test — you.com deep research.
 *
 * Wymaga:
 * - Docker compose stack up (`pnpm dev:infra`)
 * - API running (`pnpm dev:api`)
 * - Seed data (`pnpm --filter @sensai/api db:seed`)
 * - ENV:
 *     API_BASE_URL + API_BEARER_TOKEN
 *     YOUCOM_API_KEY (real, z portalu you.com)
 *     SMOKE_PROJECT_ID (uuid projektu demo)
 *     SMOKE_TEMPLATE_ID (uuid templatki "Blog SEO — deep research" v1)
 *
 * Weryfikacja:
 *   - step "deepResearch" completed
 *   - output.content.length > 100
 *   - output.sources.length > 0
 *   - tool_calls zawiera wpis {tool:"youcom", method:"research", cost_usd > 0}
 *   - (bonus) log response headers — jeśli są X-Cost-*, notuj do aktualizacji ENV pricing
 */
import "dotenv/config";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_BEARER_TOKEN;
const PROJECT_ID = process.env.SMOKE_PROJECT_ID;
const TEMPLATE_ID = process.env.SMOKE_TEMPLATE_ID;

if (!API_TOKEN || !PROJECT_ID || !TEMPLATE_ID) {
  console.error("Required env: API_BEARER_TOKEN, SMOKE_PROJECT_ID, SMOKE_TEMPLATE_ID");
  process.exit(1);
}

const TOPIC = "How to learn Rust programming for backend developers";
const MAIN_KEYWORD = "learn rust programming";

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`[smoke] starting run: topic="${TOPIC}"`);
  const run = await apiFetch("/runs", {
    method: "POST",
    body: JSON.stringify({
      projectId: PROJECT_ID,
      templateId: TEMPLATE_ID,
      input: {
        topic: TOPIC,
        mainKeyword: MAIN_KEYWORD,
        intent: "informational",
        contentType: "blog-seo",
      },
    }),
  });
  const runId: string = run.id;
  console.log(`[smoke] runId=${runId}`);

  // Poll status do momentu aż deepResearch będzie completed lub run fail
  const deadline = Date.now() + 6 * 60_000; // 6 min guard (300s timeout + bufor)
  while (Date.now() < deadline) {
    const status = await apiFetch(`/runs/${runId}`);
    const deepStep = status.steps.find((s: any) => s.stepKey === "deepResearch");
    if (!deepStep) throw new Error("step 'deepResearch' not found in run");
    console.log(`[smoke] deepResearch status=${deepStep.status}`);

    if (deepStep.status === "completed") {
      console.log(`[smoke] output.content.length = ${deepStep.output?.content?.length}`);
      console.log(`[smoke] output.sources.length = ${deepStep.output?.sources?.length}`);

      if ((deepStep.output?.content?.length ?? 0) < 100) {
        throw new Error(`content too short: ${deepStep.output?.content?.length}`);
      }
      if ((deepStep.output?.sources?.length ?? 0) === 0) {
        throw new Error("sources array is empty");
      }

      // Weryfikacja tool_calls: odpytaj endpoint (jeśli istnieje) lub wypisz instrukcję DB check.
      console.log(`[smoke] PASS — deepResearch completed with valid output`);
      console.log(`[smoke] TODO: verify pricing in you.com portal and update .env.example`);
      console.log(`[smoke] TODO: check response headers for X-Cost-* (extend YoucomClient to log)`);
      return;
    }
    if (deepStep.status === "failed") {
      throw new Error(`deepResearch failed: ${JSON.stringify(deepStep.error)}`);
    }
    await wait(5_000);
  }
  throw new Error("timeout waiting for deepResearch to complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 3: Dodaj skrypt do `package.json` root (opcjonalnie)**

Sprawdź czy `package.json` w root ma skrypt `smoke:plan-04`. Jeśli tak — dodaj analogicznie:

```bash
grep "smoke:plan" package.json
```

Jeśli istnieje `smoke:plan-04`, dodaj:

```json
"smoke:plan-05": "tsx scripts/smoke-plan-05.ts"
```

Jeśli nie ma `smoke:plan-04` w `package.json` — pomiń ten krok (uruchamiasz bezpośrednio `npx tsx scripts/smoke-plan-05.ts`).

- [ ] **Step 4: TypeCheck**

```bash
pnpm --filter @sensai/api exec tsc --noEmit || true
```

(Script poza `apps/api` nie jest w tsconfig API; jeśli potrzebny check, uruchom go przez tsx w następnym tasku.)

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-plan-05.ts package.json
git commit -m "test(scripts): add Plan 05 smoke test for you.com deep research"
```

---

## Task 14: Manualny smoke test + aktualizacja pricing

**Pliki:**
- Modify: `.env.example` (po weryfikacji pricing)
- Create: `docs/superpowers/verifications/2026-04-22-plan-05-verification.md`

- [ ] **Step 1: Setup ENV i uruchom stack**

W `apps/api/.env` ustaw:
- `YOUCOM_API_KEY` (realny klucz z https://you.com/platform)

W roocie uruchom:

```bash
pnpm dev:infra
# W osobnym terminalu:
pnpm --filter @sensai/api db:seed
pnpm dev:api
```

Skopiuj ID-ki z outputu seed'a (linie `"Blog SEO — deep research" v1: <uuid>` i `projectId: <uuid>`).

- [ ] **Step 2: Ustaw env dla smoke'a i uruchom**

```bash
export API_BEARER_TOKEN="<z apps/api/.env>"
export SMOKE_PROJECT_ID="<uuid demo projektu>"
export SMOKE_TEMPLATE_ID="<uuid templatki Blog SEO — deep research v1>"
npx tsx scripts/smoke-plan-05.ts
```

Expected:
- `[smoke] PASS — deepResearch completed with valid output`
- `content.length` > kilka tysięcy znaków
- `sources.length` typowo 5-20

Czas: `deep` może trwać 30-180s.

- [ ] **Step 3: Weryfikacja DB — tool_calls**

```bash
# W osobnym terminalu lub przez psql do Postgresa
docker compose -f docker-compose.dev.yml exec postgres psql -U postgres -d sensai -c \
  "SELECT tool, method, from_cache, cost_usd, latency_ms, error FROM tool_calls WHERE tool='youcom' ORDER BY created_at DESC LIMIT 3;"
```

Expected:
- Przynajmniej 1 wiersz `tool=youcom, method=research, from_cache=false, cost_usd=0.15, error=null`
- `latency_ms` > 10000 (kilkanaście-kilkadziesiąt sekund dla `deep`)

- [ ] **Step 4: Verify pricing w portalu you.com**

- Zaloguj się na https://you.com/platform
- Sprawdź usage / billing dla ostatniej godziny
- Porównaj faktyczny koszt requestu z wartościami w `.env.example`
- Zaktualizuj `YOUCOM_COST_DEEP` (i pozostałe, jeśli da się zweryfikować — zrobić 3 smoki z różnym `YOUCOM_DEFAULT_EFFORT`, ale to dodatkowy koszt; na razie tylko `deep`)

- [ ] **Step 5: Sprawdź response headers (opcjonalnie, jednorazowo)**

Doklej tymczasowo w `YoucomClient.research` przed returnem:

```ts
console.log("[youcom] response headers:", Object.fromEntries(res.headers.entries()));
```

Uruchom smoke ponownie. Jeśli w headerach widać `X-Cost-*` lub podobne — zanotuj w weryfikacji do fold-inu.

**Po weryfikacji usuń `console.log` i commit nie jest potrzebny.**

- [ ] **Step 6: Utwórz dokument weryfikacji**

Stwórz `docs/superpowers/verifications/2026-04-22-plan-05-verification.md`:

```markdown
# Plan 05 — Verification

**Data:** 2026-04-22
**Smoke script:** `scripts/smoke-plan-05.ts`
**Templatka użyta:** „Blog SEO — deep research" v1

## Wynik smoke testu

- [ ] `deepResearch` step completed
- [ ] `output.content.length`: __
- [ ] `output.sources.length`: __
- [ ] `tool_calls.cost_usd` (for effort=deep): __
- [ ] `tool_calls.latency_ms`: __
- [ ] Response headers contain `X-Cost-*`: YES / NO (jeśli YES — lista w notatkach)

## Aktualizacja pricing

- Faktyczny koszt `deep` z portalu you.com: $__
- Zaktualizowano `.env.example`: YES / NO
- Zaktualizowano domyślne wartości w `apps/api/src/config/env.ts`: YES / NO

## Follow-upy (do kolejnych planów)

- [ ] Jeśli `X-Cost-*` headery istnieją — fold-in: czytaj koszt z response zamiast tabeli env
- [ ] Jakość outputu (1-5): __ (ręczna ocena po inspekcji treści)
- [ ] Czy deep research dostarczył wiedzę, której SERP+scrape same nie dawały?: __

## Notatki
```

Wypełnij pola `__` i checkboxy.

- [ ] **Step 7: Commit weryfikacji i ewentualnej aktualizacji pricing**

```bash
git add docs/superpowers/verifications/2026-04-22-plan-05-verification.md .env.example
git commit -m "docs: verify Plan 05 smoke test + update youcom pricing from portal"
```

- [ ] **Step 8: (Opcjonalnie) Cleanup konsol-logów**

Jeśli dodałeś tymczasowe `console.log` w `YoucomClient` do inspekcji headerów — upewnij się, że go usunąłeś.

```bash
git diff apps/api/src/tools/youcom/youcom.client.ts
```

Expected: brak tymczasowych logów. Jeśli są — usuń, test ponownie (`pnpm --filter @sensai/api test apps/api/src/tests/youcom.client.test.ts`) i commit "chore: remove smoke-only debug log".

---

## Wykończenie

- [ ] **Uruchom wszystkie testy API**: `pnpm --filter @sensai/api test`
- [ ] **Zbuduj oba pakiety**: `pnpm --filter @sensai/shared build && pnpm --filter @sensai/api build`
- [ ] **Przejrzyj diff**: `git log --oneline main..feat/plan-05-youcom`
- [ ] **Następnie**: invoke `superpowers:finishing-a-development-branch` aby zamknąć pracę (merge PR lub merge do main).
