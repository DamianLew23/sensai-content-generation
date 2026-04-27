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
  };

  await db
    .insert(projects)
    .values({ slug: "demo", name: "Demo Project", config })
    .onConflictDoNothing({ target: projects.slug });
  const [project] = await db.select().from(projects).where(eq(projects.slug, "demo"));

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

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
