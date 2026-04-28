import "dotenv/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAME } from "../apps/api/src/orchestrator/queue.constants";

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });

  const counts = await queue.getJobCounts(
    "active",
    "waiting",
    "delayed",
    "completed",
    "failed",
    "paused",
    "wait",
  );
  console.log("counts", counts);

  for (const state of ["active", "waiting", "delayed", "completed", "failed"] as const) {
    const jobs = await queue.getJobs([state], 0, 100, false);
    const recent = jobs
      .filter((j) => (j.timestamp ?? 0) > Date.now() - 24 * 3600 * 1000)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    console.log(`\n=== ${state} last 24h (${recent.length}/${jobs.length}) ===`);
    for (const j of recent) {
      console.log({
        id: j.id,
        name: j.name,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp ? new Date(j.timestamp).toISOString() : null,
        processedOn: j.processedOn ? new Date(j.processedOn).toISOString() : null,
        finishedOn: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        data: j.data,
        failedReason: j.failedReason,
      });
    }
  }

  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
