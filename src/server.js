/**
 * server.js — tiny local API so the dashboard button can place a real call
 * without exposing your Vapi key in the browser.
 *
 * Run:  node src/server.js   (then open the dashboard, button hits this)
 * Needs the same .env as the rest of the app.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { runVapiCall } from "./vapi.js";
import { scoreWithNebius } from "./nebius.js"; // add back when you do scoring

const PORT = process.env.PORT || 8787;

// allow the dashboard (opened from file:// or another port) to call us
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  if (req.method === "POST" && req.url === "/audit") {
    try {
      // read optional { number } from the request body; fall back to .env
      let body = "";
      for await (const chunk of req) body += chunk;
      const { number } = body ? JSON.parse(body) : {};
      const target = number || process.env.TARGET_NUMBER;

      console.log(`Placing call to ${target} …`);
      const call = await runVapiCall(target);          // real Vapi call
      const score = await scoreWithNebius(call);     // <- add scoring later

      res.writeHead(200, { "Content-Type": "application/json", ...CORS });
      return res.end(JSON.stringify({ ok: true, call /*, score */ }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json", ...CORS });
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  res.writeHead(404, CORS); res.end();
}).listen(PORT, () => console.log(`Dialgrade server on http://localhost:${PORT}  (POST /audit)`));
