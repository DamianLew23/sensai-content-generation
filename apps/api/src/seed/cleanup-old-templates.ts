import "dotenv/config";
import { inArray, ne, or } from "drizzle-orm";
import { createDb } from "../db/client";
import { pipelineRuns, pipelineTemplates } from "../db/schema";

const KEEP_NAME = "Blog SEO — full + disambiguation";
const KEEP_VERSION = 1;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  const stale = await db
    .select({ id: pipelineTemplates.id, name: pipelineTemplates.name, version: pipelineTemplates.version })
    .from(pipelineTemplates)
    .where(or(ne(pipelineTemplates.name, KEEP_NAME), ne(pipelineTemplates.version, KEEP_VERSION)));

  if (stale.length === 0) {
    console.log("Nothing to clean — only the kept template exists.");
    await pool.end();
    return;
  }

  const staleIds = stale.map((t) => t.id);
  const staleRuns = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(inArray(pipelineRuns.templateId, staleIds));

  console.log(`Templates to delete (${stale.length}):`);
  for (const t of stale) console.log(`  - "${t.name}" v${t.version} (${t.id})`);
  console.log(`Runs to delete (cascades to pipeline_steps, llm_calls, tool_calls): ${staleRuns.length}`);

  if (dryRun) {
    console.log("\n--dry-run set — nothing deleted.");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    if (staleRuns.length > 0) {
      await tx
        .delete(pipelineRuns)
        .where(inArray(pipelineRuns.templateId, staleIds));
    }
    await tx.delete(pipelineTemplates).where(inArray(pipelineTemplates.id, staleIds));
  });

  console.log(`\nDeleted ${stale.length} templates and ${staleRuns.length} runs.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
