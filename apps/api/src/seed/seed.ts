import "dotenv/config";
import { createDb } from "../db/client";
import { projects, pipelineTemplates } from "../db/schema";
import type { ProjectConfig, TemplateStepsDef } from "@sensai/shared";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  const config: ProjectConfig = {
    toneOfVoice: "profesjonalny, konkretny, bez żargonu",
    targetAudience: "małe i średnie polskie firmy prowadzące działalność online",
    guidelines: "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków.",
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
    .onConflictDoNothing({ target: [pipelineTemplates.name, pipelineTemplates.version] })
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
