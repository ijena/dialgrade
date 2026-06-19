/**
 * server.js — local API for the dashboard.
 *   POST /audit   -> place a Vapi call, score it (Nebius), save to Insforge
 *   GET  /audits  -> return all saved audits (dashboard builds the roster from these)
 *
 * Run:  npm run serve
 * Needs the same .env as the rest of the app.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { runVapiCall } from "./vapi.js";
import { scoreWithNebius } from "./nebius.js";
import { saveAudit, loadAudits } from "./insforge.js";

const PORT = process.env.PORT || 8787;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(payload));
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  // --- place a call, score it, save it ---
  if (req.method === "POST" && req.url === "/audit") {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { number, businessName } = body ? JSON.parse(body) : {};
      const target = number || process.env.TARGET_NUMBER;
      const name = businessName || "Unknown business";

      console.log(`Placing call to ${target} for "${name}" …`);
      const call = await runVapiCall(target);            // Vapi
      const score = await scoreWithNebius(call);         // Nebius
      const saved = await saveAudit(name, call, score);  // Insforge

      return json(res, 200, { ok: true, call, score, saved });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  // --- read all saved audits (newest first) ---
  if (req.method === "GET" && req.url === "/audits") {
    try {
      const audits = await loadAudits();
      return json(res, 200, { ok: true, audits });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  res.writeHead(404, CORS); res.end();
}).listen(PORT, () => console.log(`Dialgrade server on http://localhost:${PORT}  (POST /audit, GET /audits)`));