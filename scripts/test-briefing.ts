/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { generateBriefing } from "../features/briefing/lib/generateBriefing";

async function main() {
  console.log("Generating briefing (source=manual)...");
  const briefing = await generateBriefing({ source: "manual" });
  console.log("\n=== SUMMARY ===");
  console.log(briefing.summary);
  console.log(`\n=== ITEMS (${briefing.items.length}) ===`);
  for (const item of briefing.items) {
    console.log(
      `[${item.severity.toUpperCase()}] ${item.job_code} ${item.job_name}`
    );
    console.log(`  ${item.headline}`);
    console.log(`  why: ${item.reason}`);
    console.log(`  do:  ${item.suggested_action}`);
    console.log();
  }
  console.log(`\nModel: ${briefing.model}`);
  console.log(`Jobs considered: ${briefing.jobs_considered}`);
  console.log(`Saved as briefing id: ${briefing.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
