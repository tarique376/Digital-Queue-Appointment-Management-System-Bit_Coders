import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { runJobs } from "../src/lib/jobs";
import { closeDatabase } from "../src/lib/db";
let stopping = false;
async function tick() {
  try {
    console.log(new Date().toISOString(), await runJobs());
  } catch {
    console.error("Job run failed; check database and email configuration.");
  }
  if (!stopping) setTimeout(tick, 60000);
}
process.on("SIGINT", async () => {
  stopping = true;
  await closeDatabase();
  process.exit(0);
});
tick();
