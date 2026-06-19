/**
 * index.js — the full pipeline: call the target, score the call, print + save.
 * Run with:  npm run audit
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { runVapiCall } from "./vapi.js";
import { scoreWithNebius } from "./nebius.js";

function check(name) {
  if (!process.env[name]) { console.error(`Missing ${name} in .env`); process.exit(1); }
}

async function main() {
  ["VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "VAPI_ASSISTANT_ID", "TARGET_NUMBER"].forEach(check);

  const target = process.env.TARGET_NUMBER;
  console.log(`Dialing ${target} … your phone should ring. Answer, talk, hang up.\n`);

  const call = await runVapiCall(target);

  console.log("\n--- CALL ---");
  console.log("endedReason :", call.endedReason);
  console.log("connected   :", call.connected, "(false = scored as voicemail/no-answer)");
  console.log("transcript  :\n" + (call.transcript || "(empty)"));

  const result = await scoreWithNebius({ connected: call.connected, transcript: call.transcript });

  console.log("\n--- SCORE ---");
  console.log(`readiness   : ${result.score}/100  (${result.rating})`);
  for (const [k, v] of Object.entries(result.signals)) {
    console.log(`  ${k.padEnd(14)} ${String(v.points).padStart(2)}/${v.max}  ${v.detail || ""}`);
  }
  if (result.fixes?.length) {
    console.log("\n  ranked fixes:");
    result.fixes.forEach(f => console.log(`   +${f.points_recoverable}  ${f.fix}`));
  }

  // persist (gitignored). Swap this for saveToInsforge() when the backend is wired.
  await mkdir("calls", { recursive: true });
  const file = `calls/${call.callId || Date.now()}.json`;
  await writeFile(file, JSON.stringify({ call, result }, null, 2));
  console.log(`\nsaved -> ${file}`);
}

main().catch(err => { console.error("\nERROR:", err.message); process.exit(1); });
