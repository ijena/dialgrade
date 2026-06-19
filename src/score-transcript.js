/**
 * score-transcript.js — score a transcript WITHOUT placing a call.
 * Useful for testing the rubric, and for the "is the scoring real?" demo moment.
 *
 *   npm run score -- "AI: what's a pipe repair cost? BIZ: starts at $99, Saturday open"
 *   npm run score -- --voicemail            (scores a no-answer)
 */
import "dotenv/config";
import { scoreWithNebius } from "./nebius.js";

async function main() {
  const args = process.argv.slice(2);
  const voicemail = args.includes("--voicemail");
  const transcript = args.filter(a => !a.startsWith("--")).join(" ")
    || "AI: What would an outdoor pipe leak repair run? BIZ: It starts at $99 plus parts, and we've got Saturday at 10 — want me to book you?";

  const result = await scoreWithNebius({ connected: !voicemail, transcript: voicemail ? "" : transcript });

  console.log(`\nreadiness: ${result.score}/100 (${result.rating})`);
  for (const [k, v] of Object.entries(result.signals)) {
    console.log(`  ${k.padEnd(14)} ${String(v.points).padStart(2)}/${v.max}  ${v.detail || ""}`);
  }
  if (result.fixes?.length) {
    console.log("\nfixes:");
    result.fixes.forEach(f => console.log(`  +${f.points_recoverable} ${f.fix}`));
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
