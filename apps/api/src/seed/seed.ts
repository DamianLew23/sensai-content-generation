import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db/client";
import { projects, pipelineTemplates } from "../db/schema";
import type { ProjectConfig, TemplateStepsDef } from "@sensai/shared";

async function upsertTemplate(db: ReturnType<typeof createDb>["db"], name: string, version: number, stepsDef: TemplateStepsDef) {
  await db
    .insert(pipelineTemplates)
    .values({ name, version, stepsDef })
    .onConflictDoUpdate({
      target: [pipelineTemplates.name, pipelineTemplates.version],
      set: { stepsDef },
    });
  const [row] = await db
    .select()
    .from(pipelineTemplates)
    .where(and(eq(pipelineTemplates.name, name), eq(pipelineTemplates.version, version)));
  return row;
}

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  const config: ProjectConfig = {
    toneOfVoice: "profesjonalny, konkretny, bez żargonu",
    targetAudience: "małe i średnie polskie firmy prowadzące działalność online",
    guidelines: "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków.",
    defaultModels: { brief: "openai/gpt-5-mini" },
    promptOverrides: {},
    productPitch: "",
    domain: "",
    keyTerms: [],
    antiTerms: [],
    competitors: [],
  };

  await db
    .insert(projects)
    .values({ slug: "demo", name: "Demo Project", config })
    .onConflictDoNothing({ target: projects.slug });
  const [project] = await db.select().from(projects).where(eq(projects.slug, "demo"));

  const click2docsConfig: ProjectConfig = {
    toneOfVoice: "konkretny, profesjonalny, bez żargonu",
    targetAudience:
      "firmy SaaS (10-200 osób), product managerowie, działy Customer Success, twórcy dokumentacji produktu",
    guidelines:
      "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków. Zawsze osadzaj przykłady w kontekście aplikacji webowych.",
    defaultModels: { brief: "openai/gpt-5-mini" },
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

  const briefOnly = await upsertTemplate(db, "Brief only (MVP)", 1, {
    steps: [{ key: "brief", type: "llm.brief", auto: true, dependsOn: [] }],
  });

  const briefResearch = await upsertTemplate(db, "Brief + research", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true, dependsOn: [] },
      { key: "brief",    type: "llm.brief",       auto: true, dependsOn: ["research"] },
    ],
  });

  const briefResearchScrape = await upsertTemplate(db, "Brief + research + scrape", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true,  dependsOn: [] },
      { key: "scrape",   type: "tool.scrape",     auto: false, dependsOn: ["research"] },
      { key: "brief",    type: "llm.brief",       auto: true,  dependsOn: ["scrape"] },
    ],
  });

  const blogSeoDeepResearch = await upsertTemplate(db, "Blog SEO — deep research", 1, {
    steps: [
      { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
      { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["scrape", "deepResearch"] },
    ],
  });

  const blogSeoDeepResearchClean = await upsertTemplate(db, "Blog SEO — deep research + clean", 1, {
    steps: [
      { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
      { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["clean", "deepResearch"] },
    ],
  });

  const blogSeoExtract = await upsertTemplate(
    db,
    "Blog SEO — deep research + clean + extract",
    1,
    {
      steps: [
        { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
      ],
    },
  );

  const blogSeoEntities = await upsertTemplate(
    db,
    "Blog SEO — deep research + clean + extract + entities",
    1,
    {
      steps: [
        { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
      ],
    },
  );

  // Plan 10 — Query Fan-Out comes FIRST (lowest stepOrder). Orchestrator schedules by stepOrder+1,
  // not dependsOn (see orchestrator_scheduling memory). All `dependsOn: []` siblings run sequentially.
  const blogSeoFanout = await upsertTemplate(
    db,
    "Blog SEO — fanout + deep research + clean + extract + entities",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",   auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research", auto: true, dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
      ],
    },
  );

  // Plan 11 — KG assembly. Depends on entities + extract; brief now consumes kg instead of extract directly.
  const blogSeoKg = await upsertTemplate(
    db,
    "Blog SEO — fanout + deep research + clean + extract + entities + KG",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",   auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research", auto: true, dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",    auto: true,  dependsOn: ["extract", "entities"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["kg"] },
      ],
    },
  );

  // Plan 13 — Draft generation. Terminal at `draftGen`.
  const blogSeoOutline = await upsertTemplate(
    db,
    "Blog SEO — fanout + deep research + clean + extract + entities + KG + outline + distribute + draft",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research",    auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",         auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",             auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",      auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract",    auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract",     auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",        auto: true,  dependsOn: ["extract", "entities"] },
        { key: "outlineGen",   type: "tool.outline.generate",   auto: true,  dependsOn: ["fanout"] },
        { key: "distribute",   type: "tool.outline.distribute", auto: true,  dependsOn: ["outlineGen", "kg"] },
        { key: "draftGen",     type: "tool.draft.generate",     auto: true,  dependsOn: ["distribute"] },
      ],
    },
  );

  // Plan 14 — Data Enrichment. Terminal at `enrich` (after `draftGen`).
  const blogSeoEnrich = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research",    auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",         auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",             auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",      auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract",    auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract",     auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",        auto: true,  dependsOn: ["extract", "entities"] },
        { key: "outlineGen",   type: "tool.outline.generate",   auto: true,  dependsOn: ["fanout"] },
        { key: "distribute",   type: "tool.outline.distribute", auto: true,  dependsOn: ["outlineGen", "kg"] },
        { key: "draftGen",     type: "tool.draft.generate",     auto: true,  dependsOn: ["distribute"] },
        { key: "enrich",       type: "tool.data.enrich",        auto: true,  dependsOn: ["draftGen"] },
      ],
    },
  );

  // Plan 15 — Article Optimize + Intermediate. Terminal at `intermediate`.
  const blogSeoIntermediate = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich + optimize + intermediate",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",         auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research",      auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",           auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",               auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",        auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract",      auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract",       auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",          auto: true,  dependsOn: ["extract", "entities"] },
        { key: "outlineGen",   type: "tool.outline.generate",     auto: true,  dependsOn: ["fanout"] },
        { key: "distribute",   type: "tool.outline.distribute",   auto: true,  dependsOn: ["outlineGen", "kg"] },
        { key: "draftGen",     type: "tool.draft.generate",       auto: true,  dependsOn: ["distribute"] },
        { key: "enrich",       type: "tool.data.enrich",          auto: true,  dependsOn: ["draftGen"] },
        { key: "optimize",     type: "tool.article.optimize",     auto: true,  dependsOn: ["enrich"] },
        { key: "intermediate", type: "tool.article.intermediate", auto: true,  dependsOn: ["optimize"] },
      ],
    },
  );

  // Plan 16 — Full Pipeline + Humanize. Terminal at `humanize`.
  const blogSeoHumanize = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich + optimize + intermediate + humanize",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",         auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research",      auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",           auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",               auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",        auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract",      auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract",       auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",          auto: true,  dependsOn: ["extract", "entities"] },
        { key: "outlineGen",   type: "tool.outline.generate",     auto: true,  dependsOn: ["fanout"] },
        { key: "distribute",   type: "tool.outline.distribute",   auto: true,  dependsOn: ["outlineGen", "kg"] },
        { key: "draftGen",     type: "tool.draft.generate",       auto: true,  dependsOn: ["distribute"] },
        { key: "enrich",       type: "tool.data.enrich",          auto: true,  dependsOn: ["draftGen"] },
        { key: "optimize",     type: "tool.article.optimize",     auto: true,  dependsOn: ["enrich"] },
        { key: "intermediate", type: "tool.article.intermediate", auto: true,  dependsOn: ["optimize"] },
        { key: "humanize",     type: "tool.article.humanize",     auto: true,  dependsOn: ["intermediate"] },
      ],
    },
  );

  // Plan 17 — Disambiguation-gated full pipeline. First three stage-1 steps are auto:false
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

  console.log("Seeded:");
  console.log(`  projectId: ${project.id}`);
  console.log(`  templates:`);
  console.log(`    "${briefOnly.name}" v${briefOnly.version}: ${briefOnly.id}`);
  console.log(`    "${briefResearch.name}" v${briefResearch.version}: ${briefResearch.id}`);
  console.log(`    "${briefResearchScrape.name}" v${briefResearchScrape.version}: ${briefResearchScrape.id}`);
  console.log(`    "${blogSeoDeepResearch.name}" v${blogSeoDeepResearch.version}: ${blogSeoDeepResearch.id}`);
  console.log(`    "${blogSeoDeepResearchClean.name}" v${blogSeoDeepResearchClean.version}: ${blogSeoDeepResearchClean.id}`);
  console.log(`    "${blogSeoExtract.name}" v${blogSeoExtract.version}: ${blogSeoExtract.id}`);
  console.log(`    "${blogSeoEntities.name}" v${blogSeoEntities.version}: ${blogSeoEntities.id}`);
  console.log(`    "${blogSeoFanout.name}" v${blogSeoFanout.version}: ${blogSeoFanout.id}`);
  console.log(`    "${blogSeoKg.name}" v${blogSeoKg.version}: ${blogSeoKg.id}`);
  console.log(`    "${blogSeoOutline.name}" v${blogSeoOutline.version}: ${blogSeoOutline.id}`);
  console.log(`    "${blogSeoEnrich.name}" v${blogSeoEnrich.version}: ${blogSeoEnrich.id}`);
  console.log(`    "${blogSeoIntermediate.name}" v${blogSeoIntermediate.version}: ${blogSeoIntermediate.id}`);
  console.log(`    "${blogSeoHumanize.name}" v${blogSeoHumanize.version}: ${blogSeoHumanize.id}`);
  console.log(`    "${blogSeoFullDisambiguate.name}" v${blogSeoFullDisambiguate.version}: ${blogSeoFullDisambiguate.id}`);
  console.log(`  click2docs projectId: ${click2docs.id}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
