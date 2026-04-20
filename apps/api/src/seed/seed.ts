import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db/client";
import { projects, pipelineTemplates } from "../db/schema";
import type { ProjectConfig, TemplateStepsDef } from "@sensai/shared";

async function upsertTemplate(db: ReturnType<typeof createDb>["db"], name: string, version: number, stepsDef: TemplateStepsDef) {
  await db
    .insert(pipelineTemplates)
    .values({ name, version, stepsDef })
    .onConflictDoNothing({ target: [pipelineTemplates.name, pipelineTemplates.version] });
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
    steps: [{ key: "brief", type: "llm.brief", auto: true }],
  });

  const briefResearch = await upsertTemplate(db, "Brief + research", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true },
      { key: "brief", type: "llm.brief", auto: true },
    ],
  });

  console.log("Seeded:");
  console.log(`  projectId: ${project.id}`);
  console.log(`  templates:`);
  console.log(`    "${briefOnly.name}" v${briefOnly.version}: ${briefOnly.id}`);
  console.log(`    "${briefResearch.name}" v${briefResearch.version}: ${briefResearch.id}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
