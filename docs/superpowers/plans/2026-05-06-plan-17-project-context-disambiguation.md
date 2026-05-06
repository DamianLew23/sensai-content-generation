# Plan 17 — Project Context + Topic Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor article generation to the project's product/domain context by introducing a `tool.topic.disambiguate` step that runs before research, guarded by `auto: false` approval gates.

**Architecture:** New step type `tool.topic.disambiguate` (one LLM call, gpt-5-mini) that takes raw `RunInput` + extended `ProjectConfig` (5 new fields: `productPitch`, `domain`, `keyTerms`, `antiTerms`, `competitors`) and produces `{ refinedTopic, mainKeyword, intent, contentType, researchQuestion, serpQueries[], antiAngles[], rationale }`. A new opt-in template (`Blog SEO — full + disambiguation`) sets `auto: false` on `disambiguate`, `deepResearch`, and `research` so the operator reviews disambiguator output before paying for research. Two orchestrator helpers (`getResolvedRunInput`, `getDisambiguateOutput`) make handlers transparently consume disambiguator fields when present and fall back to raw `RunInput` when not.

**Tech Stack:** TypeScript, NestJS, Drizzle ORM, Zod, Vitest, OpenAI Responses API via existing `LlmClient.generateObject`, Next.js (web).

**Spec:** `docs/superpowers/specs/2026-05-06-plan-17-project-context-disambiguation-design.md`

**Conventions referenced:**
- Handlers live in `apps/api/src/handlers/<name>.handler.ts`. Type prefix is `tool.<name>` (e.g. `tool.topic.disambiguate`).
- Tool clients/modules live in `apps/api/src/tools/<name>/`.
- Prompts live in `apps/api/src/prompts/<name>.prompt.ts`.
- Tests live in `apps/api/src/tests/<name>.test.ts` (vitest).
- Web step renderers live in `apps/web/src/components/step-output/<name>.tsx` and are wired via `step-output/index.tsx`.
- Smoke scripts live in `scripts/smoke-plan-XX.ts` and are exposed via `pnpm smoke:plan-XX`.
- `packages/shared` MUST be rebuilt to `dist/` after schema changes (`pnpm --filter @sensai/shared build`).

---

## Task 1: Extend `ProjectConfig` and add `DisambiguateOutput` + loosen `ResumeStepDto`

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts` (create if absent)
- Build: `packages/shared/dist/` (rebuilt)

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/__tests__/schemas.test.ts` (create the file if it doesn't exist; copy the existing project conventions for vitest config):

```ts
import { describe, expect, it } from "vitest";
import { ProjectConfig, DisambiguateOutput, ResumeStepDto } from "../schemas";

describe("ProjectConfig (Plan 17 fields)", () => {
  it("defaults the new domain fields to empty when not provided", () => {
    const cfg = ProjectConfig.parse({});
    expect(cfg.productPitch).toBe("");
    expect(cfg.domain).toBe("");
    expect(cfg.keyTerms).toEqual([]);
    expect(cfg.antiTerms).toEqual([]);
    expect(cfg.competitors).toEqual([]);
  });

  it("preserves provided domain fields", () => {
    const cfg = ProjectConfig.parse({
      productPitch: "click2docs.pl to SaaS do generowania instrukcji aplikacji.",
      domain: "SaaS / dokumentacja",
      keyTerms: ["instrukcja aplikacji", "user guide"],
      antiTerms: ["urządzenia fizyczne", "AGD"],
      competitors: ["Tango", "Scribe"],
    });
    expect(cfg.productPitch).toMatch(/click2docs/);
    expect(cfg.keyTerms).toHaveLength(2);
    expect(cfg.antiTerms).toContain("AGD");
    expect(cfg.competitors).toContain("Tango");
  });
});

describe("DisambiguateOutput", () => {
  it("validates a complete output", () => {
    const out = DisambiguateOutput.parse({
      refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
      mainKeyword: "instrukcja obsługi aplikacji",
      intent: "informational",
      contentType: "how-to guide",
      researchQuestion: "Jak skutecznie napisać instrukcję obsługi aplikacji webowej dla użytkowników końcowych?",
      serpQueries: ["instrukcja obsługi aplikacji", "user guide aplikacja webowa", "jak pisać dokumentację SaaS"],
      antiAngles: ["urządzenia fizyczne", "AGD"],
      rationale: "Topic odnosi się do dokumentacji aplikacji w kontekście click2docs.pl, nie urządzeń.",
    });
    expect(out.intent).toBe("informational");
    expect(out.serpQueries).toHaveLength(3);
  });

  it("rejects invalid intent values", () => {
    expect(() =>
      DisambiguateOutput.parse({
        refinedTopic: "x", mainKeyword: "x", intent: "bogus",
        contentType: "x", researchQuestion: "x",
        serpQueries: ["a"], antiAngles: [], rationale: "x",
      }),
    ).toThrow();
  });

  it("requires at least one serpQuery and at most four", () => {
    const base = {
      refinedTopic: "x", mainKeyword: "x", intent: "informational" as const,
      contentType: "x", researchQuestion: "x", antiAngles: [], rationale: "x",
    };
    expect(() => DisambiguateOutput.parse({ ...base, serpQueries: [] })).toThrow();
    expect(() => DisambiguateOutput.parse({ ...base, serpQueries: ["a","b","c","d","e"] })).toThrow();
  });
});

describe("ResumeStepDto (Plan 17 — input optional)", () => {
  it("accepts the legacy scrape-style payload with input.urls", () => {
    const dto = ResumeStepDto.parse({ input: { urls: ["https://example.com"] } });
    expect(dto.input?.urls).toHaveLength(1);
  });

  it("accepts an empty payload (used by disambiguate / youcom / serp resumes)", () => {
    const dto = ResumeStepDto.parse({});
    expect(dto.input).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/shared test -- schemas`
Expected: FAIL — `DisambiguateOutput` is not exported, `ProjectConfig` lacks the new fields, `ResumeStepDto.input` is required.

- [ ] **Step 3: Add the schema changes**

Edit `packages/shared/src/schemas.ts`:

(a) Extend `ProjectConfig`. Find the existing block (around line 84) and append the five new fields **before** the closing `})`:

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
      disambiguate: z.string().optional(),
    })
    .default({}),
  researchEffort: ResearchEffort.optional(),
  promptOverrides: z.record(z.string()).default({}),
  // Plan 17 — domain context for topic disambiguation
  productPitch: z.string().default(""),
  domain: z.string().default(""),
  keyTerms: z.array(z.string()).default([]),
  antiTerms: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;
```

(b) Add the `DisambiguateOutput` schema near the other tool result schemas (after `ResearchBriefing`, before `ProjectConfig` is fine):

```ts
export const DisambiguateIntent = z.enum([
  "informational",
  "navigational",
  "transactional",
  "commercial",
]);
export type DisambiguateIntent = z.infer<typeof DisambiguateIntent>;

export const DisambiguateOutput = z.object({
  refinedTopic: z.string().min(3),
  mainKeyword: z.string().min(1),
  intent: DisambiguateIntent,
  contentType: z.string().min(1),
  researchQuestion: z.string().min(3),
  serpQueries: z.array(z.string().min(1)).min(1).max(4),
  antiAngles: z.array(z.string()),
  rationale: z.string(),
});
export type DisambiguateOutput = z.infer<typeof DisambiguateOutput>;
```

(c) Loosen `ResumeStepDto`:

```ts
export const ResumeStepDto = z.object({
  input: z
    .object({
      urls: z.string().url().array().min(1).max(10),
    })
    .optional(),
});
export type ResumeStepDto = z.infer<typeof ResumeStepDto>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/shared test -- schemas`
Expected: PASS — all 7 assertions green.

- [ ] **Step 5: Rebuild the shared package**

Run: `pnpm --filter @sensai/shared build`
Expected: `packages/shared/dist/` is updated. The api app imports from `@sensai/shared` resolve to `dist/` (Node 24 ESM gotcha — see `shared_package_build_gotcha` memory).

Verify: `cat packages/shared/dist/schemas.d.ts | grep -E "DisambiguateOutput|productPitch|antiTerms" | head` shows the new exports/properties.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/__tests__/schemas.test.ts packages/shared/dist
git commit -m "feat(shared): Plan 17 — extend ProjectConfig + add DisambiguateOutput + loosen ResumeStepDto"
```

---

## Task 2: Topic-disambiguator prompt

**Files:**
- Create: `apps/api/src/prompts/topic-disambiguate.prompt.ts`
- Test: `apps/api/src/tests/topic-disambiguate.prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/topic-disambiguate.prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { topicDisambiguatePrompt } from "../prompts/topic-disambiguate.prompt";
import type { ProjectConfig, RunInput } from "@sensai/shared";

const projectName = "click2docs";
const cfg: ProjectConfig = {
  toneOfVoice: "konkretny, profesjonalny",
  targetAudience: "firmy SaaS",
  guidelines: "",
  defaultModels: {},
  promptOverrides: {},
  productPitch: "click2docs.pl to SaaS do generowania instrukcji obsługi aplikacji webowych z nagrań kliknięć.",
  domain: "SaaS / dokumentacja techniczna",
  keyTerms: ["instrukcja aplikacji", "user guide", "onboarding"],
  antiTerms: ["urządzenia fizyczne", "AGD", "sprzęt"],
  competitors: ["Tango", "Scribe", "Guidde"],
};

describe("topicDisambiguatePrompt.system", () => {
  const sys = topicDisambiguatePrompt.system(projectName, cfg);

  it("includes the project name", () => {
    expect(sys).toContain("click2docs");
  });

  it("includes the productPitch", () => {
    expect(sys).toContain("click2docs.pl to SaaS");
  });

  it("includes domain and target audience", () => {
    expect(sys).toContain("SaaS / dokumentacja techniczna");
    expect(sys).toContain("firmy SaaS");
  });

  it("emits keyTerms as a MUST-honor list", () => {
    expect(sys).toMatch(/MUSZ.*instrukcja aplikacji/i);
  });

  it("emits antiTerms as a MUST-NOT list", () => {
    expect(sys).toMatch(/NIE WOLNO.*urządzenia fizyczne/i);
    expect(sys).toContain("AGD");
  });

  it("includes competitors when provided", () => {
    expect(sys).toContain("Tango");
  });

  it("omits empty fields cleanly when ProjectConfig has no domain context", () => {
    const empty: ProjectConfig = {
      toneOfVoice: "", targetAudience: "", guidelines: "",
      defaultModels: {}, promptOverrides: {},
      productPitch: "", domain: "", keyTerms: [], antiTerms: [], competitors: [],
    };
    const sysEmpty = topicDisambiguatePrompt.system("demo", empty);
    expect(sysEmpty).not.toMatch(/undefined/i);
    expect(sysEmpty).not.toMatch(/MUSZ/i); // no keyTerms guard line if list is empty
    expect(sysEmpty).not.toMatch(/NIE WOLNO/i);
  });
});

describe("topicDisambiguatePrompt.user", () => {
  it("renders the topic and any RunInput hints", () => {
    const input: RunInput = {
      topic: "Jak napisać instrukcję",
      mainKeyword: "instrukcja",
      intent: "informational",
      contentType: "how-to",
    };
    const u = topicDisambiguatePrompt.user(input);
    expect(u).toContain("Jak napisać instrukcję");
    expect(u).toContain("instrukcja");
    expect(u).toContain("informational");
    expect(u).toContain("how-to");
  });

  it("renders only topic when no hints provided", () => {
    const u = topicDisambiguatePrompt.user({ topic: "Jak napisać instrukcję" });
    expect(u).toContain("Jak napisać instrukcję");
    expect(u).not.toMatch(/intent/i);
    expect(u).not.toMatch(/contentType|Typ treści/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- topic-disambiguate.prompt`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the prompt module**

Create `apps/api/src/prompts/topic-disambiguate.prompt.ts`:

```ts
import type { ProjectConfig, RunInput } from "@sensai/shared";
import { DisambiguateOutput } from "@sensai/shared";

function bullet(items: string[]): string {
  return items.map((s) => `- ${s}`).join("\n");
}

export const topicDisambiguatePrompt = {
  system(projectName: string, cfg: ProjectConfig): string {
    const lines: string[] = [
      `Jesteś analitykiem contentu marki "${projectName}". Twoją rolą jest doprecyzowanie tematu artykułu w kontekście tego projektu, ZANIM odpalimy drogi research, tak aby research nie poszedł w niewłaściwą niszę.`,
    ];

    const ctxLines: string[] = [];
    if (cfg.productPitch) ctxLines.push(`Co robi projekt: ${cfg.productPitch}`);
    if (cfg.domain) ctxLines.push(`Domena / nisza: ${cfg.domain}`);
    if (cfg.targetAudience) ctxLines.push(`Grupa docelowa: ${cfg.targetAudience}`);
    if (cfg.toneOfVoice) ctxLines.push(`Tone of voice: ${cfg.toneOfVoice}`);
    if (cfg.guidelines) ctxLines.push(`Wytyczne brandowe: ${cfg.guidelines}`);
    if (cfg.competitors.length > 0) ctxLines.push(`Konkurencja: ${cfg.competitors.join(", ")}`);
    if (ctxLines.length > 0) {
      lines.push("", "## Kontekst projektu", ...ctxLines);
    }

    if (cfg.keyTerms.length > 0) {
      lines.push(
        "",
        "## Terminy, które MUSZĄ być uwzględnione w doprecyzowanym temacie / zapytaniach researchowych:",
        bullet(cfg.keyTerms),
      );
    }

    if (cfg.antiTerms.length > 0) {
      lines.push(
        "",
        "## Interpretacje, w które NIE WOLNO iść (to inna nisza niż projekt):",
        bullet(cfg.antiTerms),
        "",
        "Każdy taki anti-term MUSI pojawić się w polu antiAngles outputu, żeby downstream wiedział czego unikać.",
      );
    }

    lines.push(
      "",
      "## Zadanie",
      "Doprecyzuj temat tak, aby pasował do niszy projektu. Wygeneruj:",
      "- refinedTopic: doprecyzowane sformułowanie tematu (1 zdanie),",
      "- mainKeyword: główne słowo kluczowe dla SERP (1-5 słów),",
      "- intent: informational | navigational | transactional | commercial,",
      "- contentType: np. \"how-to guide\", \"listicle\", \"comparison\",",
      "- researchQuestion: pełnozdaniowe pytanie badawcze do you.com,",
      "- serpQueries: 2-4 warianty zapytań do Google/PAA,",
      "- antiAngles: lista interpretacji do wykluczenia (zaczynając od antiTerms wyżej, plus własne uzupełnienia),",
      "- rationale: 1-2 zdania uzasadnienia wyborów.",
      "",
      "Zwróć WYŁĄCZNIE obiekt JSON zgodny ze schematem.",
    );

    return lines.join("\n");
  },

  user(input: RunInput): string {
    const lines: string[] = [`Surowy temat artykułu: ${input.topic}`];
    if (input.mainKeyword) lines.push(`Sugerowane mainKeyword od operatora: ${input.mainKeyword}`);
    if (input.intent) lines.push(`Sugerowany intent: ${input.intent}`);
    if (input.contentType) lines.push(`Sugerowany contentType: ${input.contentType}`);
    return lines.join("\n");
  },

  schema: DisambiguateOutput,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- topic-disambiguate.prompt`
Expected: PASS — all 9 assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/topic-disambiguate.prompt.ts apps/api/src/tests/topic-disambiguate.prompt.test.ts
git commit -m "feat(api): Plan 17 — topic-disambiguate prompt with antiTerms guards"
```

---

## Task 3: Topic-disambiguator client (LLM call wrapper)

**Files:**
- Create: `apps/api/src/tools/topic-disambiguator/topic-disambiguator.client.ts`
- Create: `apps/api/src/tools/topic-disambiguator/topic-disambiguator.types.ts`
- Test: `apps/api/src/tests/topic-disambiguator.client.test.ts`
- Modify: `apps/api/src/config/env.ts` — add `DISAMBIGUATE_MODEL` and `DISAMBIGUATE_TTL_DAYS`

- [ ] **Step 1: Add env vars**

Edit `apps/api/src/config/env.ts` (find the existing schema and append):

```ts
DISAMBIGUATE_MODEL: z.string().default("openai/gpt-5-mini"),
DISAMBIGUATE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
```

Add the same two keys to `apps/api/.env.example` (or whichever sample env file exists in the repo) with the same defaults.

- [ ] **Step 2: Create the call-context type**

Create `apps/api/src/tools/topic-disambiguator/topic-disambiguator.types.ts`:

```ts
export interface TopicDisambiguateCallContext {
  runId: string;
  stepId: string;
  attempt: number;
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/tests/topic-disambiguator.client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TopicDisambiguatorClient } from "../tools/topic-disambiguator/topic-disambiguator.client";

const stubEnv = {
  DISAMBIGUATE_MODEL: "openai/gpt-5-mini",
  DISAMBIGUATE_MAX_INPUT_CHARS: 20_000,
} as const;

describe("TopicDisambiguatorClient", () => {
  it("delegates to LlmClient.generateObject and returns a disambiguator result", async () => {
    const stubObject = {
      refinedTopic: "Jak napisać instrukcję obsługi aplikacji",
      mainKeyword: "instrukcja aplikacji",
      intent: "informational",
      contentType: "how-to guide",
      researchQuestion: "Jak skutecznie napisać instrukcję obsługi aplikacji webowej?",
      serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacja"],
      antiAngles: ["urządzenia fizyczne", "AGD"],
      rationale: "Odnosi się do dokumentacji aplikacji.",
    };
    const stubLlm = {
      generateObject: vi.fn(async () => ({
        object: stubObject,
        model: "openai/gpt-5-mini",
        promptTokens: 800,
        completionTokens: 300,
        costUsd: "0.0021",
        latencyMs: 2300,
      })),
    } as any;

    const client = new TopicDisambiguatorClient(stubLlm, stubEnv as any);
    const out = await client.disambiguate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      system: "system prompt",
      prompt: "user prompt",
    });

    expect(stubLlm.generateObject).toHaveBeenCalledOnce();
    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.system).toBe("system prompt");
    expect(args.prompt).toBe("user prompt");
    expect(args.ctx.model).toBe("openai/gpt-5-mini");
    expect(out.result.refinedTopic).toMatch(/aplikacj/i);
    expect(out.costUsd).toBe("0.0021");
    expect(out.latencyMs).toBe(2300);
  });

  it("rejects when prompt exceeds DISAMBIGUATE_MAX_INPUT_CHARS", async () => {
    const stubLlm = { generateObject: vi.fn() } as any;
    const client = new TopicDisambiguatorClient(stubLlm, {
      DISAMBIGUATE_MODEL: "openai/gpt-5-mini",
      DISAMBIGUATE_MAX_INPUT_CHARS: 100,
    } as any);
    await expect(
      client.disambiguate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        system: "x".repeat(80),
        prompt: "y".repeat(80),
      }),
    ).rejects.toThrow(/exceeds/i);
    expect(stubLlm.generateObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- topic-disambiguator.client`
Expected: FAIL — class not found.

- [ ] **Step 5: Implement the client**

Create `apps/api/src/tools/topic-disambiguator/topic-disambiguator.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { DisambiguateOutput } from "@sensai/shared";
import type { TopicDisambiguateCallContext } from "./topic-disambiguator.types";

type ClientEnv = Pick<Env, "DISAMBIGUATE_MODEL" | "DISAMBIGUATE_MAX_INPUT_CHARS">;

export interface TopicDisambiguateCallResult {
  result: DisambiguateOutput;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class TopicDisambiguatorClient {
  private readonly logger = new Logger(TopicDisambiguatorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("DISAMBIGUATE_ENV") private readonly env: ClientEnv,
  ) {}

  async disambiguate(args: {
    ctx: TopicDisambiguateCallContext;
    system: string;
    prompt: string;
  }): Promise<TopicDisambiguateCallResult> {
    const totalChars = args.system.length + args.prompt.length;
    if (totalChars > this.env.DISAMBIGUATE_MAX_INPUT_CHARS) {
      throw new Error(
        `topic.disambiguate input exceeds DISAMBIGUATE_MAX_INPUT_CHARS ` +
          `(got ${totalChars}, limit ${this.env.DISAMBIGUATE_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.DISAMBIGUATE_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: DisambiguateOutput,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        antiAnglesCount: res.object.antiAngles.length,
        serpQueriesCount: res.object.serpQueries.length,
      },
      "topic-disambiguate LLM call",
    );

    return {
      result: res.object as DisambiguateOutput,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
```

Add `DISAMBIGUATE_MAX_INPUT_CHARS` to `apps/api/src/config/env.ts` (default 20000):

```ts
DISAMBIGUATE_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).default(20_000),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- topic-disambiguator.client`
Expected: PASS — both assertions green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tools/topic-disambiguator apps/api/src/tests/topic-disambiguator.client.test.ts apps/api/src/config/env.ts
git commit -m "feat(api): Plan 17 — TopicDisambiguatorClient + env wiring"
```

---

## Task 4: Topic-disambiguator handler with antiTerms hard-fail guard + retry

**Files:**
- Create: `apps/api/src/handlers/disambiguate-topic.handler.ts`
- Test: `apps/api/src/tests/disambiguate-topic.handler.test.ts`

This handler enforces the **R1 mitigation** from the spec: if the LLM ignores `antiTerms` and produces a `refinedTopic`/`serpQueries` containing them, retry once with a stronger prompt; second failure throws.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/disambiguate-topic.handler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DisambiguateTopicHandler } from "../handlers/disambiguate-topic.handler";

const stubEnv = { DISAMBIGUATE_TTL_DAYS: 14 } as const;

const baseProject = {
  id: "p",
  name: "click2docs",
  config: {
    toneOfVoice: "", targetAudience: "", guidelines: "",
    defaultModels: {}, promptOverrides: {},
    productPitch: "click2docs.pl SaaS",
    domain: "SaaS",
    keyTerms: ["instrukcja aplikacji"],
    antiTerms: ["urządzenia", "AGD"],
    competitors: [],
  },
};

const validOutput = {
  refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
  mainKeyword: "instrukcja aplikacji",
  intent: "informational" as const,
  contentType: "how-to guide",
  researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
  serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacji"],
  antiAngles: ["urządzenia", "AGD"],
  rationale: "Skupiamy się na aplikacjach.",
};

const violatingOutput = {
  ...validOutput,
  refinedTopic: "Jak napisać instrukcję obsługi urządzenia AGD",
  serpQueries: ["instrukcja AGD", "instrukcja aplikacji webowej"],
};

function makeStubs(disambiguateImpl: any) {
  const stubClient = { disambiguate: vi.fn(disambiguateImpl) } as any;
  const stubCache = {
    getOrSet: async (opts: any) => (await opts.fetcher()).result,
  } as any;
  return { stubClient, stubCache };
}

describe("DisambiguateTopicHandler", () => {
  it("returns the LLM output when no antiTerms violation occurs", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: validOutput,
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledOnce();
    expect((out.output as any).refinedTopic).toMatch(/aplikacj/i);
  });

  it("retries with a stronger prompt when refinedTopic contains an antiTerm", async () => {
    let call = 0;
    const { stubClient, stubCache } = makeStubs(async () => {
      call += 1;
      return {
        result: call === 1 ? violatingOutput : validOutput,
        model: "openai/gpt-5-mini",
        promptTokens: 100, completionTokens: 50,
        costUsd: "0.001", latencyMs: 1000,
      };
    });
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
    expect((out.output as any).refinedTopic).not.toMatch(/AGD|urządze/i);

    // Second call should have a stronger system prompt
    const secondCallArgs = stubClient.disambiguate.mock.calls[1][0];
    expect(secondCallArgs.system).toMatch(/PIERWSZA PRÓBA|RETRY/i);
  });

  it("throws after the retry also violates the antiTerms guard", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: violatingOutput,
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
        step: { id: "s" },
        project: baseProject,
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/antiterms/i);
    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
  });

  it("treats antiTerms violation in serpQueries as a violation too", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: { ...validOutput, serpQueries: ["instrukcja AGD"] }, // violation
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
        step: { id: "s" },
        project: baseProject,
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/antiterms/i);
    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
  });

  it("does not run the antiTerms guard when antiTerms is empty (no-op for vanilla projects)", async () => {
    const projectWithoutAntiTerms = {
      ...baseProject,
      config: { ...baseProject.config, antiTerms: [] },
    };
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: violatingOutput, // would violate if guard ran
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: projectWithoutAntiTerms,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledOnce();
    expect((out.output as any).refinedTopic).toMatch(/AGD/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- disambiguate-topic.handler`
Expected: FAIL — handler not found.

- [ ] **Step 3: Implement the handler**

Create `apps/api/src/handlers/disambiguate-topic.handler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  DisambiguateOutput,
  type ProjectConfig,
  type RunInput,
} from "@sensai/shared";
import { TopicDisambiguatorClient } from "../tools/topic-disambiguator/topic-disambiguator.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { topicDisambiguatePrompt } from "../prompts/topic-disambiguate.prompt";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "DISAMBIGUATE_TTL_DAYS">;

const PROMPT_VERSION = "v1";

@Injectable()
export class DisambiguateTopicHandler implements StepHandler {
  readonly type = "tool.topic.disambiguate";
  private readonly logger = new Logger(DisambiguateTopicHandler.name);

  constructor(
    private readonly client: TopicDisambiguatorClient,
    private readonly cache: ToolCacheService,
    @Inject("DISAMBIGUATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;

    const system = topicDisambiguatePrompt.system(ctx.project.name, cfg);
    const userPrompt = topicDisambiguatePrompt.user(input);

    const inputHash = sha256(JSON.stringify({
      system,
      userPrompt,
      antiTerms: cfg.antiTerms,
    }));

    const result = await this.cache.getOrSet<DisambiguateOutput>({
      tool: "topic",
      method: "disambiguate",
      params: {
        inputHash,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DISAMBIGUATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const first = await this.client.disambiguate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system,
          prompt: userPrompt,
        });

        const violation = findAntiTermViolation(first.result, cfg.antiTerms);
        if (!violation) {
          return {
            result: first.result,
            costUsd: first.costUsd,
            latencyMs: first.latencyMs,
          };
        }

        this.logger.warn(
          { runId: ctx.run.id, stepId: ctx.step.id, violation },
          "topic.disambiguate antiTerms violation on first attempt — retrying",
        );

        const retrySystem =
          system +
          `\n\n## RETRY — PIERWSZA PRÓBA NARUSZYŁA GUARD\n` +
          `Poprzednia odpowiedź zawierała zabroniony termin "${violation.term}" w polu "${violation.field}". ` +
          `Wygeneruj nową odpowiedź, która ABSOLUTNIE nie zawiera żadnego z antiTerms w refinedTopic ani w serpQueries.`;

        const second = await this.client.disambiguate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt + 1 },
          system: retrySystem,
          prompt: userPrompt,
        });

        const stillViolates = findAntiTermViolation(second.result, cfg.antiTerms);
        if (stillViolates) {
          throw new Error(
            `antiterms violation persists after retry: term="${stillViolates.term}" field=${stillViolates.field}. ` +
              `Edit ProjectConfig.antiTerms or refine the topic.`,
          );
        }

        const totalCost = (
          parseFloat(first.costUsd) + parseFloat(second.costUsd)
        ).toFixed(6);

        return {
          result: second.result,
          costUsd: totalCost,
          latencyMs: first.latencyMs + second.latencyMs,
        };
      },
    });

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        refinedTopic: result.refinedTopic,
        antiAnglesCount: result.antiAngles.length,
        serpQueriesCount: result.serpQueries.length,
      },
      "topic.disambiguate done",
    );

    return { output: result };
  }
}

interface Violation {
  term: string;
  field: "refinedTopic" | "serpQueries";
}

function findAntiTermViolation(
  out: DisambiguateOutput,
  antiTerms: string[],
): Violation | null {
  if (antiTerms.length === 0) return null;
  const lower = (s: string) => s.toLowerCase();
  const refLower = lower(out.refinedTopic);
  for (const t of antiTerms) {
    const tl = lower(t);
    if (refLower.includes(tl)) return { term: t, field: "refinedTopic" };
    for (const q of out.serpQueries) {
      if (lower(q).includes(tl)) return { term: t, field: "serpQueries" };
    }
  }
  return null;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- disambiguate-topic.handler`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/disambiguate-topic.handler.ts apps/api/src/tests/disambiguate-topic.handler.test.ts
git commit -m "feat(api): Plan 17 — DisambiguateTopicHandler with antiTerms guard + retry"
```

---

## Task 5: Module wiring + step registry registration

**Files:**
- Create: `apps/api/src/tools/topic-disambiguator/topic-disambiguator.module.ts`
- Modify: `apps/api/src/handlers/handlers.module.ts` (or wherever `STEP_HANDLERS` are aggregated)
- Modify: `apps/api/src/orchestrator/orchestrator.module.ts` if it gates handler registration

- [ ] **Step 1: Identify where existing handlers are registered**

Run: `grep -rn 'ArticleHumanizeHandler\|STEP_HANDLERS\|provide.*Handler' apps/api/src --include='*.ts' | head -30`
Read the module that provides existing handlers (most likely `apps/api/src/handlers/handlers.module.ts`). The new handler must be added there following the same DI pattern as `ArticleHumanizeHandler`.

- [ ] **Step 2: Create the disambiguator module**

Create `apps/api/src/tools/topic-disambiguator/topic-disambiguator.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { LlmModule } from "../../llm/llm.module";
import { TopicDisambiguatorClient } from "./topic-disambiguator.client";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    {
      provide: "DISAMBIGUATE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          DISAMBIGUATE_MODEL: env.DISAMBIGUATE_MODEL,
          DISAMBIGUATE_MAX_INPUT_CHARS: env.DISAMBIGUATE_MAX_INPUT_CHARS,
        };
      },
    },
    TopicDisambiguatorClient,
  ],
  exports: [TopicDisambiguatorClient],
})
export class TopicDisambiguatorModule {}
```

- [ ] **Step 3: Wire the handler into the handlers module**

Edit the handlers module (the one identified in Step 1) and add:

(a) Import `DisambiguateTopicHandler` from `../handlers/disambiguate-topic.handler` and `TopicDisambiguatorModule` from `../tools/topic-disambiguator/topic-disambiguator.module`.

(b) Add `TopicDisambiguatorModule` to `imports`.

(c) Append to `providers`:

```ts
{
  provide: "DISAMBIGUATE_HANDLER_ENV",
  useFactory: () => {
    const env = loadEnv();
    return { DISAMBIGUATE_TTL_DAYS: env.DISAMBIGUATE_TTL_DAYS };
  },
},
DisambiguateTopicHandler,
{ provide: STEP_HANDLERS, useExisting: DisambiguateTopicHandler, multi: true },
```

(use the same pattern (`useExisting` with `multi: true`) that the existing handlers use; if the existing pattern differs, mirror it exactly).

- [ ] **Step 4: Verify the API compiles and starts**

Run: `pnpm --filter @sensai/api build`
Expected: build succeeds, no TS errors.

Run: `pnpm --filter @sensai/api start:dev` for ~5 seconds, then Ctrl-C.
Expected: NestJS bootstrap log includes a line for the new handler (search the log for `DisambiguateTopicHandler` — Nest logs every provider).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/topic-disambiguator/topic-disambiguator.module.ts apps/api/src/handlers/handlers.module.ts
git commit -m "chore(api): Plan 17 — wire DisambiguateTopicHandler into DI + step registry"
```

---

## Task 6: Run-input resolver helpers

**Files:**
- Create: `apps/api/src/orchestrator/run-input-resolver.ts`
- Test: `apps/api/src/tests/run-input-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/run-input-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getResolvedRunInput,
  getDisambiguateOutput,
} from "../orchestrator/run-input-resolver";
import type { RunInput } from "@sensai/shared";

const rawInput: RunInput = {
  topic: "Jak napisać instrukcję",
  mainKeyword: "instrukcja",
  intent: "informational",
  contentType: "how-to",
};

const disambiguateOutput = {
  refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
  mainKeyword: "instrukcja aplikacji",
  intent: "informational" as const,
  contentType: "how-to guide",
  researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
  serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacja"],
  antiAngles: ["urządzenia fizyczne"],
  rationale: "Skupiamy się na aplikacjach.",
};

describe("getResolvedRunInput", () => {
  it("returns the raw input when no disambiguate output is available", () => {
    expect(getResolvedRunInput(rawInput, {})).toEqual(rawInput);
    expect(getResolvedRunInput(rawInput, { somethingElse: { x: 1 } })).toEqual(rawInput);
  });

  it("returns the raw input when disambiguate output fails schema validation", () => {
    expect(
      getResolvedRunInput(rawInput, { disambiguate: { foo: "bar" } }),
    ).toEqual(rawInput);
  });

  it("merges the four RunInput-shaped fields when disambiguate is valid", () => {
    const merged = getResolvedRunInput(rawInput, { disambiguate: disambiguateOutput });
    expect(merged.topic).toBe(disambiguateOutput.refinedTopic);
    expect(merged.mainKeyword).toBe(disambiguateOutput.mainKeyword);
    expect(merged.intent).toBe(disambiguateOutput.intent);
    expect(merged.contentType).toBe(disambiguateOutput.contentType);
    // h1Title (and any other future RunInput field) is preserved from raw input
  });
});

describe("getDisambiguateOutput", () => {
  it("returns null when no disambiguate step output is present", () => {
    expect(getDisambiguateOutput({})).toBeNull();
  });

  it("returns null when output fails schema validation", () => {
    expect(getDisambiguateOutput({ disambiguate: { broken: true } })).toBeNull();
  });

  it("returns the parsed output when valid", () => {
    const parsed = getDisambiguateOutput({ disambiguate: disambiguateOutput });
    expect(parsed?.researchQuestion).toBe(disambiguateOutput.researchQuestion);
    expect(parsed?.serpQueries).toHaveLength(2);
    expect(parsed?.antiAngles).toContain("urządzenia fizyczne");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- run-input-resolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `apps/api/src/orchestrator/run-input-resolver.ts`:

```ts
import { DisambiguateOutput, type RunInput } from "@sensai/shared";

const DISAMBIGUATE_STEP_KEY = "disambiguate";

export function getDisambiguateOutput(
  previousOutputs: Record<string, unknown>,
): DisambiguateOutput | null {
  const candidate = previousOutputs[DISAMBIGUATE_STEP_KEY];
  if (candidate === undefined || candidate === null) return null;
  const parsed = DisambiguateOutput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function getResolvedRunInput(
  input: RunInput,
  previousOutputs: Record<string, unknown>,
): RunInput {
  const dis = getDisambiguateOutput(previousOutputs);
  if (!dis) return input;
  return {
    ...input,
    topic: dis.refinedTopic,
    mainKeyword: dis.mainKeyword,
    intent: dis.intent,
    contentType: dis.contentType,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- run-input-resolver`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orchestrator/run-input-resolver.ts apps/api/src/tests/run-input-resolver.test.ts
git commit -m "feat(api): Plan 17 — run-input-resolver helpers (getResolvedRunInput, getDisambiguateOutput)"
```

---

## Task 7: Resume-validation polymorphism

**Files:**
- Modify: `apps/api/src/runs/resume-validation.ts`
- Test: `apps/api/src/tests/resume-validation.test.ts` (exists; extend)

The current validator is hardcoded for `tool.scrape` (it expects `prevStepOutput` to be a `SerpResult` and validates URL membership). We make it switch on step type.

- [ ] **Step 1: Read the existing test file to understand structure**

Read `apps/api/src/tests/resume-validation.test.ts` end-to-end to see how cases are stubbed.

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/tests/resume-validation.test.ts`:

```ts
describe("validateResumeRequest — Plan 17 step types (no input validation)", () => {
  const baseRun = { status: "awaiting_approval", currentStepOrder: 1 } as any;
  const baseStep = { status: "pending", requiresApproval: true, stepOrder: 1 } as any;

  for (const stepType of [
    "tool.topic.disambiguate",
    "tool.youcom.research",
    "tool.serp.fetch",
  ]) {
    it(`accepts an empty resume payload for ${stepType}`, () => {
      const res = validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: stepType },
        prevStepOutput: undefined,
        dto: {},
      } as any);
      expect(res.ok).toBe(true);
    });
  }

  it("still rejects scrape resume when URLs are missing from SERP", () => {
    expect(() =>
      validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: "tool.scrape" },
        prevStepOutput: { items: [{ title: "t", url: "https://allowed.com", description: "", position: 1 }] },
        dto: { input: { urls: ["https://NOT-allowed.com"] } },
      } as any),
    ).toThrow();
  });

  it("rejects unknown step types fail-fast", () => {
    expect(() =>
      validateResumeRequest({
        run: baseRun,
        step: { ...baseStep, type: "tool.unknown" },
        prevStepOutput: undefined,
        dto: {},
      } as any),
    ).toThrow(/unsupported|unknown/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- resume-validation`
Expected: FAIL on the new cases (`prevStepOutput` is undefined for non-scrape, current code throws on `SerpResult.safeParse(undefined)`).

- [ ] **Step 4: Make the validator polymorphic**

Replace the body of `validateResumeRequest` in `apps/api/src/runs/resume-validation.ts`:

```ts
const SCRAPE_TYPE = "tool.scrape";
const NO_INPUT_TYPES = new Set([
  "tool.topic.disambiguate",
  "tool.youcom.research",
  "tool.serp.fetch",
]);

export function validateResumeRequest(args: ValidateInput): { ok: true } {
  const { run, step, prevStepOutput, dto } = args;

  if (run.status !== "awaiting_approval") {
    throw new ResumeValidationError(
      "run_not_awaiting", 409,
      `Run status is "${run.status}", expected "awaiting_approval"`,
    );
  }

  if (step.status !== "pending" || step.requiresApproval !== true) {
    throw new ResumeValidationError(
      "step_not_awaiting", 409,
      `Step not in pending+requiresApproval state (status=${step.status}, requiresApproval=${step.requiresApproval})`,
    );
  }

  if (step.stepOrder !== run.currentStepOrder) {
    throw new ResumeValidationError(
      "step_out_of_order", 409,
      `Step order ${step.stepOrder} differs from run.currentStepOrder ${run.currentStepOrder}`,
    );
  }

  const stepType = (step as { type?: string }).type;

  if (stepType === SCRAPE_TYPE) {
    return validateScrapeResume(prevStepOutput, dto);
  }

  if (stepType && NO_INPUT_TYPES.has(stepType)) {
    return { ok: true };
  }

  throw new ResumeValidationError(
    "step_not_awaiting", 400,
    `Unsupported step type for resume: "${stepType ?? "<missing>"}"`,
  );
}

function validateScrapeResume(prevStepOutput: unknown, dto: ResumeStepDto): { ok: true } {
  const parsed = SerpResult.safeParse(prevStepOutput);
  if (!parsed.success) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "Previous step output is not a SerpResult — cannot validate URLs",
    );
  }
  if (!dto.input || !dto.input.urls) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "Scrape resume requires input.urls",
    );
  }
  const allowed = new Set(parsed.data.items.map((i) => i.url));
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const u of dto.input.urls) {
    if (seen.has(u)) {
      invalid.push(u);
      continue;
    }
    seen.add(u);
    if (!allowed.has(u)) invalid.push(u);
  }
  if (invalid.length > 0) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "One or more URLs are not in the previous SERP output (or are duplicates)",
      { invalid },
    );
  }
  return { ok: true };
}
```

Note: the `step.type` was not previously consumed by the validator, so callers (`runs.service.ts`) must pass it through. Confirm by reading `runs.service.ts:resume()` — `PipelineStepRow` already includes `type` (it's a column), so the `step` argument carries it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- resume-validation`
Expected: PASS — including the existing scrape cases and the four new cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/runs/resume-validation.ts apps/api/src/tests/resume-validation.test.ts
git commit -m "feat(api): Plan 17 — resume validation switches on step type for new auto:false types"
```

---

## Task 8: Brief prompt — `antiAngles` block + use of resolved input

**Files:**
- Modify: `apps/api/src/prompts/brief.prompt.ts`
- Test: `apps/api/src/tests/brief.prompt.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/brief.prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { briefPrompt } from "../prompts/brief.prompt";

const project: any = {
  id: "p", name: "click2docs",
  config: {
    toneOfVoice: "konkretny", targetAudience: "firmy SaaS",
    guidelines: "", defaultModels: {}, promptOverrides: {},
    productPitch: "", domain: "", keyTerms: [], antiTerms: [], competitors: [],
  },
};

describe("briefPrompt.system — antiAngles block", () => {
  it("omits antiAngles block when none provided", () => {
    const sys = briefPrompt.system(project);
    expect(sys).not.toMatch(/UNIKAJ.*interpretacji|antiAngle/i);
  });

  it("renders antiAngles as a hard guard when provided", () => {
    const sys = briefPrompt.system(project, ["urządzenia fizyczne", "AGD"]);
    expect(sys).toMatch(/KRYTYCZNE.*UNIKAJ/i);
    expect(sys).toContain("urządzenia fizyczne");
    expect(sys).toContain("AGD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- brief.prompt`
Expected: FAIL — `briefPrompt.system` does not accept a second argument and does not emit the antiAngles block.

- [ ] **Step 3: Modify the prompt module**

Edit `apps/api/src/prompts/brief.prompt.ts`. Replace the `system` function:

```ts
system(project: ProjectRow, antiAngles: string[] = []) {
  const cfg = project.config as ProjectConfig;
  const lines: Array<string | false> = [
    `Jesteś starszym redaktorem i strategiem contentu marki "${project.name}".`,
    cfg.toneOfVoice && `Tone of voice: ${cfg.toneOfVoice}`,
    cfg.targetAudience && `Grupa docelowa: ${cfg.targetAudience}`,
    cfg.guidelines && `Wytyczne brandowe: ${cfg.guidelines}`,
    `Twoim zadaniem jest przygotowanie krótkiego briefu artykułu na podstawie tematu od użytkownika.`,
    `Zwróć odpowiedź wyłącznie jako obiekt JSON zgodny ze schematem.`,
  ];
  if (antiAngles.length > 0) {
    lines.push(
      "",
      "## KRYTYCZNE — UNIKAJ tych interpretacji tematu (są z innej niszy niż projekt):",
      ...antiAngles.map((a) => `- ${a}`),
      "",
      "Jeśli zaproponowany kąt sugeruje którąkolwiek z powyższych interpretacji, ODRZUĆ go i wybierz inny.",
    );
  }
  return lines.filter(Boolean).join("\n\n");
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- brief.prompt`
Expected: PASS — both cases green. Also verify existing brief tests still pass: `pnpm --filter @sensai/api test -- brief` (full prompt suite green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/brief.prompt.ts apps/api/src/tests/brief.prompt.test.ts
git commit -m "feat(api): Plan 17 — brief prompt accepts antiAngles guard block"
```

---

## Task 9: Brief handler — use resolver helpers and pass antiAngles

**Files:**
- Modify: `apps/api/src/handlers/brief.handler.ts`
- Test: existing `apps/api/src/tests/brief.handler.test.ts` (extend if present, otherwise create)

- [ ] **Step 1: Write the failing test**

Append (or create) `apps/api/src/tests/brief.handler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BriefHandler } from "../handlers/brief.handler";

const stubLlm = {
  generateObject: vi.fn(async () => ({
    object: {
      headline: "h", angle: "a",
      pillars: ["p1","p2","p3"],
      audiencePainPoints: ["x","y"],
      successCriteria: "ok",
    },
    model: "m", promptTokens: 10, completionTokens: 10,
    costUsd: "0.001", latencyMs: 10,
  })),
} as any;

const project: any = {
  id: "p", name: "click2docs",
  config: {
    toneOfVoice: "", targetAudience: "", guidelines: "",
    defaultModels: {}, promptOverrides: {},
    productPitch: "", domain: "",
    keyTerms: [], antiTerms: [], competitors: [],
  },
};

describe("BriefHandler — Plan 17 disambiguator integration", () => {
  it("uses raw RunInput when no disambiguate step output is present", async () => {
    stubLlm.generateObject.mockClear();
    const handler = new BriefHandler(stubLlm);
    await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.prompt).toContain("Jak napisać instrukcję");
    expect(args.system).not.toMatch(/UNIKAJ/);
  });

  it("uses refinedTopic and emits antiAngles guard when disambiguate output is present", async () => {
    stubLlm.generateObject.mockClear();
    const handler = new BriefHandler(stubLlm);
    await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
          mainKeyword: "instrukcja aplikacji",
          intent: "informational",
          contentType: "how-to guide",
          researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
          serpQueries: ["instrukcja aplikacji webowej"],
          antiAngles: ["urządzenia fizyczne", "AGD"],
          rationale: "x",
        },
      },
      attempt: 1,
      forceRefresh: false,
    } as any);

    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.prompt).toContain("Jak napisać instrukcję obsługi aplikacji webowej");
    expect(args.system).toMatch(/UNIKAJ/);
    expect(args.system).toContain("urządzenia fizyczne");
  });
});
```

(If your existing brief handler test file uses different stub shapes for `LlmClient`, mirror those here. The above shows the intent — adapt to actual handler dependencies.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- brief.handler`
Expected: FAIL — handler does not yet thread `antiAngles` or use the resolver.

- [ ] **Step 3: Modify the handler**

Edit `apps/api/src/handlers/brief.handler.ts`. Around the existing `const input = ctx.run.input as RunInput;` (line 17), replace:

```ts
import {
  getResolvedRunInput,
  getDisambiguateOutput,
} from "../orchestrator/run-input-resolver";

// ...inside execute():
const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);
const dis = getDisambiguateOutput(ctx.previousOutputs);
const antiAngles = dis?.antiAngles ?? [];

// existing prompts that used `input` — switch to `resolved`:
const system = briefPrompt.system(ctx.project, antiAngles);
const prompt = briefPrompt.user(resolved, /* ...other args unchanged */);
```

(The exact local variable names and other arguments to `briefPrompt.user` depend on the existing handler — preserve them. The only changes are: `input` → `resolved`, and `system` now passes `antiAngles`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- brief.handler`
Expected: PASS — both new cases green; existing cases also pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/brief.handler.ts apps/api/src/tests/brief.handler.test.ts
git commit -m "feat(api): Plan 17 — BriefHandler consumes disambiguator output via resolver"
```

---

## Task 10: youcom-research handler — prefer `researchQuestion`

**Files:**
- Modify: `apps/api/src/handlers/youcom-research.handler.ts`
- Test: extend `apps/api/src/tests/youcom-research.handler.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/tests/youcom-research.handler.test.ts`:

```ts
describe("YoucomResearchHandler — Plan 17 disambiguator integration", () => {
  it("uses disambiguate.researchQuestion as the prompt input when present", async () => {
    // Build the same stub harness used by existing tests, but seed previousOutputs.disambiguate
    // and assert that the LLM call (or cache.getOrSet params) carries researchQuestion text,
    // NOT the raw run.input.topic.
    // (Mirror the harness already used for the basic "calls you.com with topic" test in this file.)
  });
});
```

The exact shape of the stubs depends on what's already in `youcom-research.handler.test.ts`. Read the existing test, copy its harness, and add a case where `previousOutputs.disambiguate.researchQuestion === "Question X"` and assert the prompt sent to the client includes `"Question X"` (and does NOT include the raw topic).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- youcom-research.handler`
Expected: FAIL — handler currently always uses `runInput.topic`.

- [ ] **Step 3: Modify the handler**

Edit `apps/api/src/handlers/youcom-research.handler.ts:33-39`. Replace:

```ts
const cfg = ctx.project.config as ProjectConfig;
const runInput = ctx.run.input as RunInput;

const effort: ResearchEffort = cfg.researchEffort ?? this.env.YOUCOM_DEFAULT_EFFORT;
const override = cfg.promptOverrides?.[this.type];
const promptString = youcomResearchPrompt.user(runInput, override);
```

with:

```ts
import { getDisambiguateOutput, getResolvedRunInput } from "../orchestrator/run-input-resolver";
// ... up at the imports

// inside execute():
const cfg = ctx.project.config as ProjectConfig;
const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);
const dis = getDisambiguateOutput(ctx.previousOutputs);

const effort: ResearchEffort = cfg.researchEffort ?? this.env.YOUCOM_DEFAULT_EFFORT;
const override = cfg.promptOverrides?.[this.type];
// Prefer the disambiguator's researchQuestion (a full sentence shaped for you.com)
// when available; fall back to the existing prompt.user(resolved, override) flow.
const promptString = dis?.researchQuestion
  ? dis.researchQuestion
  : youcomResearchPrompt.user(resolved, override);
```

(Note: `youcomResearchPrompt.user` takes the legacy shape; we only bypass it when the disambiguator already produced a question. The fallback path remains identical.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- youcom-research.handler`
Expected: PASS — both legacy and new cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/youcom-research.handler.ts apps/api/src/tests/youcom-research.handler.test.ts
git commit -m "feat(api): Plan 17 — youcom-research uses disambiguator researchQuestion when present"
```

---

## Task 11: serp-fetch handler — prefer `serpQueries[0]`

**Files:**
- Modify: `apps/api/src/handlers/serp-fetch.handler.ts`
- Test: create or extend `apps/api/src/tests/serp-fetch.handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create or extend `apps/api/src/tests/serp-fetch.handler.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import { SerpFetchHandler } from "../handlers/serp-fetch.handler";

function makeHandler() {
  const stubClient = {
    serpOrganicLive: vi.fn(async () => ({
      tasks: [{ result: [{ items: [] }], cost: "0" }],
    })),
  } as any;
  const stubCache = {
    getOrSet: async (opts: any) => (await opts.fetcher()).result,
  } as any;
  return { handler: new SerpFetchHandler(stubClient, stubCache), stubClient };
}

describe("SerpFetchHandler — Plan 17 disambiguator integration", () => {
  it("uses raw mainKeyword when no disambiguate output is present", async () => {
    const { handler, stubClient } = makeHandler();
    await handler.execute({
      run: { id: "r", input: { topic: "T", mainKeyword: "kw raw" } },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: {},
      attempt: 1, forceRefresh: false,
    } as any);
    expect(stubClient.serpOrganicLive.mock.calls[0][0].keyword).toBe("kw raw");
  });

  it("prefers disambiguate.serpQueries[0] when present", async () => {
    const { handler, stubClient } = makeHandler();
    await handler.execute({
      run: { id: "r", input: { topic: "T", mainKeyword: "kw raw" } },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: {
        disambiguate: {
          refinedTopic: "x", mainKeyword: "kw resolved",
          intent: "informational", contentType: "guide",
          researchQuestion: "q",
          serpQueries: ["kw from disambig", "alt"],
          antiAngles: [], rationale: "r",
        },
      },
      attempt: 1, forceRefresh: false,
    } as any);
    expect(stubClient.serpOrganicLive.mock.calls[0][0].keyword).toBe("kw from disambig");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- serp-fetch.handler`
Expected: FAIL — handler always reads `input.mainKeyword`.

- [ ] **Step 3: Modify the handler**

Edit `apps/api/src/handlers/serp-fetch.handler.ts:18-22`. Replace:

```ts
const input = ctx.run.input as RunInput;
if (!input.mainKeyword || input.mainKeyword.trim().length === 0) {
  throw new Error("mainKeyword is required for tool.serp.fetch");
}

const params = SerpFetchParams.parse({
  keyword: input.mainKeyword.trim(),
  // ...
```

with:

```ts
import { getDisambiguateOutput, getResolvedRunInput } from "../orchestrator/run-input-resolver";
// ...up at imports

// inside execute():
const dis = getDisambiguateOutput(ctx.previousOutputs);
const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);

const keyword = dis?.serpQueries[0]?.trim() || resolved.mainKeyword?.trim();
if (!keyword || keyword.length === 0) {
  throw new Error("mainKeyword (or disambiguate.serpQueries[0]) is required for tool.serp.fetch");
}

const params = SerpFetchParams.parse({
  keyword,
  // ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- serp-fetch.handler`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/serp-fetch.handler.ts apps/api/src/tests/serp-fetch.handler.test.ts
git commit -m "feat(api): Plan 17 — serp-fetch uses disambiguator serpQueries[0] when present"
```

---

## Task 12: query-fanout handler — use resolved input + `serpQueries` seeds

**Files:**
- Modify: `apps/api/src/handlers/query-fanout.handler.ts`
- Test: extend `apps/api/src/tests/query-fanout.handler.test.ts`

- [ ] **Step 1: Read the existing handler and prompt**

Read `apps/api/src/handlers/query-fanout.handler.ts` end-to-end and `apps/api/src/prompts/query-fanout.prompt.ts` to find where the topic and any seeds are passed to the LLM. The change: feed the resolved input plus, when `disambiguate.serpQueries` is present, pass the additional queries (indices ≥ 1) as **operator-suggested seed variants** in the prompt.

- [ ] **Step 2: Write the failing test**

Extend `apps/api/src/tests/query-fanout.handler.test.ts` with two cases that mirror Tasks 10/11: one without disambiguate (current behaviour preserved), one with disambiguate where the LLM call's prompt is asserted to include `serpQueries.slice(1).join(...)` content as seeds, and the resolved `refinedTopic` as the topic.

(Use the file's existing harness style — copy and adapt.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- query-fanout.handler`
Expected: FAIL.

- [ ] **Step 4: Modify the handler and prompt**

(a) In `query-fanout.handler.ts`, replace `ctx.run.input as RunInput` with the resolver call and pass the disambiguator output:

```ts
import { getDisambiguateOutput, getResolvedRunInput } from "../orchestrator/run-input-resolver";

const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);
const dis = getDisambiguateOutput(ctx.previousOutputs);
const seedQueries = dis?.serpQueries.slice(1) ?? [];
```

(b) In `query-fanout.prompt.ts`, add an optional third argument to the user prompt builder (or to whichever signature the handler calls). When `seedQueries.length > 0`, append a section:

```
## Sugerowane warianty od operatora (z disambiguatora):
- {seedQueries[0]}
- {seedQueries[1]}
...

Wykorzystaj je jako punkt wyjścia, ale możesz wygenerować szersze wachlarze.
```

When the seed list is empty, omit the section (no spurious whitespace).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sensai/api test -- query-fanout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/handlers/query-fanout.handler.ts apps/api/src/prompts/query-fanout.prompt.ts apps/api/src/tests/query-fanout.handler.test.ts
git commit -m "feat(api): Plan 17 — query-fanout uses resolved topic + disambiguator serpQueries seeds"
```

---

## Task 13: Seed — new template + `click2docs` project

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Add the click2docs project**

In `seed.ts`, after the existing `await db.insert(projects).values({ slug: "demo", ... })` block, insert:

```ts
const click2docsConfig: ProjectConfig = {
  toneOfVoice: "konkretny, profesjonalny, bez żargonu",
  targetAudience: "firmy SaaS (10-200 osób), product managerowie, działy Customer Success, twórcy dokumentacji produktu",
  guidelines: "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków. Zawsze osadzaj przykłady w kontekście aplikacji webowych.",
  defaultModels: { brief: "openai/gpt-5-mini", disambiguate: "openai/gpt-5-mini" },
  promptOverrides: {},
  productPitch:
    "click2docs.pl to SaaS, który automatycznie generuje instrukcje obsługi aplikacji webowych na podstawie nagrań kliknięć użytkownika. Operator nagrywa workflow w aplikacji, click2docs produkuje gotową instrukcję krok-po-kroku z screenshotami i tekstem.",
  domain: "SaaS / dokumentacja techniczna aplikacji webowych",
  keyTerms: [
    "instrukcja aplikacji",
    "user guide",
    "onboarding użytkownika",
    "dokumentacja produktu",
    "knowledge base",
    "tutorial krok-po-kroku",
    "screenshot guide",
  ],
  antiTerms: [
    "instrukcja obsługi pralki",
    "instrukcja obsługi piekarnika",
    "urządzenia fizyczne",
    "AGD",
    "sprzęt elektroniczny",
    "instrukcja samochodu",
    "DTR (dokumentacja techniczno-ruchowa)",
  ],
  competitors: ["Tango", "Scribe", "Guidde", "Supademo"],
};

await db
  .insert(projects)
  .values({ slug: "click2docs", name: "click2docs", config: click2docsConfig })
  .onConflictDoUpdate({ target: projects.slug, set: { config: click2docsConfig } });
const [click2docs] = await db
  .select()
  .from(projects)
  .where(eq(projects.slug, "click2docs"));
```

- [ ] **Step 2: Add the new template**

After the existing `blogSeoHumanize` upsert (around line 244), insert:

```ts
// Plan 17 — Disambiguation-gated full pipeline. First three steps are auto:false
// (operator approves disambiguator output before paying for research).
const blogSeoFullDisambiguate = await upsertTemplate(
  db,
  "Blog SEO — full + disambiguation",
  1,
  {
    steps: [
      { key: "disambiguate", type: "tool.topic.disambiguate", auto: false, dependsOn: [] },
      { key: "deepResearch", type: "tool.youcom.research",    auto: false, dependsOn: ["disambiguate"] },
      { key: "research",     type: "tool.serp.fetch",         auto: false, dependsOn: ["disambiguate"] },
      { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: ["disambiguate"] },
      { key: "scrape",       type: "tool.scrape",             auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",      auto: true,  dependsOn: ["scrape"] },
      { key: "extract",      type: "tool.content.extract",    auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "entities",     type: "tool.entity.extract",     auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "kg",           type: "tool.kg.assemble",        auto: true,  dependsOn: ["extract", "entities"] },
      { key: "outlineGen",   type: "tool.outline.generate",   auto: true,  dependsOn: ["fanout"] },
      { key: "distribute",   type: "tool.outline.distribute", auto: true,  dependsOn: ["outlineGen", "kg"] },
      { key: "draftGen",     type: "tool.draft.generate",     auto: true,  dependsOn: ["distribute"] },
      { key: "enrich",       type: "tool.data.enrich",        auto: true,  dependsOn: ["draftGen"] },
      { key: "optimize",     type: "tool.article.optimize",   auto: true,  dependsOn: ["enrich"] },
      { key: "intermediate", type: "tool.article.intermediate", auto: true, dependsOn: ["optimize"] },
      { key: "humanize",     type: "tool.article.humanize",   auto: true,  dependsOn: ["intermediate"] },
    ],
  },
);
```

Add a console.log at the bottom mirroring the existing pattern:

```ts
console.log(`    "${blogSeoFullDisambiguate.name}" v${blogSeoFullDisambiguate.version}: ${blogSeoFullDisambiguate.id}`);
console.log(`  click2docs projectId: ${click2docs.id}`);
```

- [ ] **Step 3: Run the seed against a local DB**

Run: `pnpm seed`
Expected: stdout shows the new template and the click2docs project line.

Verify via psql:

```bash
psql "$DATABASE_URL" -c "select slug, jsonb_array_length(config->'antiTerms') as anti from projects where slug in ('demo','click2docs');"
psql "$DATABASE_URL" -c "select name from pipeline_templates where name like '%disambiguation%';"
```

Expected: `click2docs` row shows `anti = 7`; one matching template name.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): Plan 17 — seed click2docs project + Blog SEO + disambiguation template"
```

---

## Task 14: UI — `DisambiguateOutput` renderer

**Files:**
- Create: `apps/web/src/components/step-output/disambiguate.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 1: Create the renderer**

Create `apps/web/src/components/step-output/disambiguate.tsx`:

```tsx
import { JsonFallback } from "./json-fallback";

type DisambiguateValue = {
  refinedTopic: string;
  mainKeyword: string;
  intent: string;
  contentType: string;
  researchQuestion: string;
  serpQueries: string[];
  antiAngles: string[];
  rationale: string;
};

function isDisambiguateValue(v: unknown): v is DisambiguateValue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.refinedTopic === "string" &&
    typeof o.mainKeyword === "string" &&
    typeof o.intent === "string" &&
    typeof o.contentType === "string" &&
    typeof o.researchQuestion === "string" &&
    Array.isArray(o.serpQueries) &&
    Array.isArray(o.antiAngles) &&
    typeof o.rationale === "string"
  );
}

export function DisambiguateOutput({ value }: { value: unknown }) {
  if (!isDisambiguateValue(value)) return <JsonFallback value={value} />;

  return (
    <div className="space-y-4">
      <Field label="Refined topic" value={value.refinedTopic} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Main keyword" value={value.mainKeyword} />
        <Field label="Intent" value={value.intent} />
        <Field label="Content type" value={value.contentType} />
      </div>
      <Field label="Research question (you.com)" value={value.researchQuestion} />
      <BulletList label="SERP queries" items={value.serpQueries} />
      <BulletList label="Anti-angles (downstream guards)" items={value.antiAngles} muted />
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          Rationale
        </div>
        <div className="text-sm text-gray-600 italic">{value.rationale}</div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function BulletList({
  label,
  items,
  muted = false,
}: {
  label: string;
  items: string[];
  muted?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          {label}
        </div>
        <div className="text-sm text-gray-400 italic">(brak)</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </div>
      <ul className={`text-sm list-disc list-inside ${muted ? "text-gray-600" : ""}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
```

(If the existing renderers use Tailwind classes that differ, peek at `apps/web/src/components/step-output/article-humanize.tsx` and mirror its class conventions.)

- [ ] **Step 2: Register in the index switch**

Edit `apps/web/src/components/step-output/index.tsx`:

(a) Add import:

```tsx
import { DisambiguateOutput } from "./disambiguate";
```

(b) Add a case to the `switch (type)` block:

```tsx
case "tool.topic.disambiguate":
  return <DisambiguateOutput value={value} />;
```

(c) Add the type to the `hasRichRenderer` whitelist:

```tsx
type === "tool.topic.disambiguate" ||
```

- [ ] **Step 3: Verify the web app builds**

Run: `pnpm --filter @sensai/web build`
Expected: build succeeds with no TS errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/step-output/disambiguate.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): Plan 17 — DisambiguateOutput step renderer"
```

---

## Task 15: Smoke A — offline disambiguator regression

**Files:**
- Create: `scripts/smoke-plan-17.ts`
- Modify: root `package.json` — add `"smoke:plan-17"` script

- [ ] **Step 1: Create the smoke script**

Create `scripts/smoke-plan-17.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 17 manual smoke — Topic disambiguator (offline, single LLM call).
 *
 * Runs DisambiguateTopicHandler in isolation against the click2docs project
 * config and the regression topic "Jak napisać instrukcję". Asserts that the
 * disambiguator anchors to the SaaS-app-documentation interpretation rather
 * than physical-device manuals.
 *
 * Pre-req: pnpm seed (so the click2docs project exists in DB), but the script
 * itself does not hit the DB — it loads ProjectConfig from a fixture below.
 *
 * Run: pnpm smoke:plan-17
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CostTrackerService } from "../apps/api/src/llm/cost-tracker.service";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { TopicDisambiguatorClient } from "../apps/api/src/tools/topic-disambiguator/topic-disambiguator.client";
import { DisambiguateTopicHandler } from "../apps/api/src/handlers/disambiguate-topic.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DisambiguateOutput, type ProjectConfig } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "plan-17-disambiguate.json");

const click2docsConfig: ProjectConfig = {
  toneOfVoice: "konkretny, profesjonalny",
  targetAudience: "firmy SaaS, product managerowie",
  guidelines: "",
  defaultModels: { disambiguate: "openai/gpt-5-mini" },
  promptOverrides: {},
  productPitch:
    "click2docs.pl to SaaS generujący instrukcje obsługi aplikacji webowych na podstawie nagrań kliknięć użytkownika.",
  domain: "SaaS / dokumentacja techniczna aplikacji webowych",
  keyTerms: ["instrukcja aplikacji", "user guide", "onboarding", "dokumentacja produktu"],
  antiTerms: ["urządzenia fizyczne", "AGD", "sprzęt", "instrukcja obsługi pralki", "DTR"],
  competitors: ["Tango", "Scribe", "Guidde"],
};

async function main() {
  const env = loadEnv();
  if (!env.OPENROUTER_API_KEY) {
    console.error("[smoke] FAIL — OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  const stubCostTracker = new CostTrackerService();
  const llm = new LlmClient(stubCostTracker);

  const tdClient = new TopicDisambiguatorClient(llm, {
    DISAMBIGUATE_MODEL: env.DISAMBIGUATE_MODEL,
    DISAMBIGUATE_MAX_INPUT_CHARS: env.DISAMBIGUATE_MAX_INPUT_CHARS,
  } as any);

  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;

  const handler = new DisambiguateTopicHandler(
    tdClient,
    stubCache,
    { DISAMBIGUATE_TTL_DAYS: env.DISAMBIGUATE_TTL_DAYS } as any,
  );

  const t0 = Date.now();
  const stepResult = await handler.execute({
    run: { id: randomUUID(), input: { topic: "Jak napisać instrukcję" } },
    step: { id: randomUUID() },
    project: { id: randomUUID(), name: "click2docs", config: click2docsConfig },
    previousOutputs: {},
    attempt: 1,
    forceRefresh: false,
  } as any);
  const totalMs = Date.now() - t0;

  const out = DisambiguateOutput.parse(stepResult.output);

  // -------- pass criteria --------
  const refinedHitsAppDomain = /aplikacj|saas|softw|web/i.test(out.refinedTopic);
  const antiAnglesIncludeAtLeastOneAntiTerm = click2docsConfig.antiTerms.some((t) =>
    out.antiAngles.some((a) => a.toLowerCase().includes(t.toLowerCase())),
  );
  const serpQueriesAvoidAntiTerms = out.serpQueries.every(
    (q) => !click2docsConfig.antiTerms.some((t) => q.toLowerCase().includes(t.toLowerCase())),
  );
  const refinedTopicAvoidsAntiTerms = !click2docsConfig.antiTerms.some((t) =>
    out.refinedTopic.toLowerCase().includes(t.toLowerCase()),
  );

  const passes = {
    refinedHitsAppDomain,
    antiAnglesIncludeAtLeastOneAntiTerm,
    serpQueriesAvoidAntiTerms,
    refinedTopicAvoidsAntiTerms,
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ totalMs, output: out, passes }, null, 2),
    "utf-8",
  );

  const allPass = Object.values(passes).every(Boolean);
  console.log("[smoke] disambiguator output:", JSON.stringify(out, null, 2));
  console.log("[smoke] passes:", passes);
  console.log(`[smoke] total: ${totalMs} ms`);
  if (!allPass) {
    console.error("[smoke] FAIL — at least one pass criterion not met");
    process.exit(2);
  }
  console.log(`[smoke] PASS — written to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error("[smoke] FAIL —", e);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script**

Edit root `package.json`. Find the `"smoke:plan-XX"` block and add:

```json
"smoke:plan-17": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-17.ts"
```

- [ ] **Step 3: Run the smoke**

Run: `pnpm smoke:plan-17`
Expected: stdout includes `[smoke] PASS — written to scripts/smoke-output/plan-17-disambiguate.json`. The fixture file is created.

If FAIL: inspect the JSON output. The most likely cause is the LLM ignoring `antiTerms` despite the prompt — investigate the prompt text returned in the output and consider tightening the system prompt in `topic-disambiguate.prompt.ts`. Do NOT alter the pass criteria — the criteria reflect the actual product requirement.

- [ ] **Step 4: Commit (only if smoke passes)**

```bash
git add scripts/smoke-plan-17.ts package.json scripts/smoke-output/plan-17-disambiguate.json
git commit -m "test(api): Plan 17 — smoke A disambiguator regression on 'Jak napisać instrukcję'"
```

---

## Task 16: Final integration check

**Files:** none (verification only)

- [ ] **Step 1: Build everything**

Run (in order):
```bash
pnpm --filter @sensai/shared build
pnpm --filter @sensai/api build
pnpm --filter @sensai/web build
```

Expected: all three succeed with no TS errors.

- [ ] **Step 2: Run the full unit-test suite**

Run: `pnpm --filter @sensai/api test`
Expected: all tests pass — including pre-existing tests for brief, youcom, serp, query-fanout, resume-validation. Plan 17 changes must not regress them.

- [ ] **Step 3: End-to-end sanity (optional, manual)**

Start the API + worker (`pnpm --filter @sensai/api start:dev`) and the web app (`pnpm --filter @sensai/web dev`). Create a run against the `click2docs` project with the `Blog SEO — full + disambiguation` template and topic "Jak napisać instrukcję":

1. Verify the run pauses at `disambiguate` (status `awaiting_approval`).
2. Click resume on disambiguate. After it completes, `DisambiguateOutput` renders the seven fields.
3. Verify run pauses again at `deepResearch`. Click resume.
4. Verify run pauses again at `research`. Click resume.
5. The rest of the pipeline cascades. The final article should reference apps/SaaS, not consumer-device manuals.

This is Smoke B from the spec — paid, manual. It is a release gate, not a CI check.

- [ ] **Step 4: Mark plan complete**

Update `MEMORY.md` (auto-memory) appending the entry:

```
- [Plan 17 Project Context + Disambiguation](project_plan_17_disambiguation.md) — COMPLETED, merged to main on YYYY-MM-DD; smoke A passes; smoke B verified manually
```

And create the corresponding memory file `memory/project_plan_17_disambiguation.md`. Then commit and push as the final PR.

```bash
git push origin <branch>
gh pr create --title "Plan 17 — Project Context + Topic Disambiguation" --body "..."
```

---

## Spec self-review

After writing this plan, I checked it against the spec:

**Spec coverage:** Every section of the spec has at least one task. §1 schema → Task 1. §2 step type → Tasks 2-5. §3 helpers → Task 6. §4 downstream → Tasks 8-12. §5 UI → Task 14. §6 resume validation → Task 7. §7 seed → Task 13. §Smoke → Task 15.

**Placeholder scan:** Tasks 10-12 (downstream handler integrations) reference "use the existing harness style — copy and adapt" rather than spelling out exact stubs, because each existing handler test has its own peculiar harness shape (different LlmClient stubs, different cache stubs, etc.). The signal — the new prompt should include `disambiguate.researchQuestion` / `serpQueries[0]` etc. — is concrete; the harness itself is not new code. This is honest about the implementation reality, not a TBD.

**Type consistency:** `DisambiguateOutput` is defined exactly once (Task 1) and consumed identically across helpers, handlers, and renderer. The `previousOutputs.disambiguate` step-key convention is documented in Task 6 and used consistently in Tasks 8-12 and 14.

**Gaps:** None known. Memory update in Task 16 Step 4 mirrors how prior plans were closed.
