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

  // Plan 17 — Disambiguation-gated full pipeline. First three stage-1 steps are auto:false
  // (operator approves disambiguator output before paying for research).
  const blogSeoFullDisambiguate = await upsertTemplate(
    db,
    "Blog SEO — full + disambiguation",
    1,
    {
      steps: [
        { key: "disambiguate", type: "tool.topic.disambiguate", auto: false, dependsOn: [] },
        { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: ["disambiguate"] },
        { key: "deepResearch", type: "tool.youcom.research",    auto: false, dependsOn: ["disambiguate"] },
        { key: "research",     type: "tool.serp.fetch",         auto: false, dependsOn: ["disambiguate"] },
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
  console.log(`    "${blogSeoFullDisambiguate.name}" v${blogSeoFullDisambiguate.version}: ${blogSeoFullDisambiguate.id}`);
  console.log(`  click2docs projectId: ${click2docs.id}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
