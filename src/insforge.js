/**
 * insforge.js — persist audits to Insforge (Postgres BaaS) and read them back.
 * All server-side. Degrades gracefully: if Insforge isn't configured, save/load
 * become no-ops so the rest of the app keeps working.
 */
import { createClient } from "@insforge/sdk";

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.INSFORGE_BASE_URL) return null; // not configured -> no-op mode
  client = createClient({
    baseUrl: process.env.INSFORGE_BASE_URL,
    anonKey: process.env.INSFORGE_ANON_KEY,
    isServerMode: true            // we're calling from Node, not a browser
  });
  return client;
}

// Save one audit row. Returns the saved row, or null if Insforge is off/fails.
export async function saveAudit(businessName, call, score) {
  const c = getClient();
  if (!c) { console.warn("[insforge] not configured — skipping save"); return null; }
  try {
    const { data, error } = await c
      .database
      .from("audits")
      .insert([{
        business_name: businessName,
        connected: call.connected,
        score: score.score,
        rating: score.rating,
        signals: score.signals,
        fixes: score.fixes,
        transcript: call.transcript || "",
        ended_reason: call.endedReason || ""
      }])
      .select();
    if (error) throw new Error(JSON.stringify(error));
    return data?.[0] ?? null;
  } catch (err) {
    console.warn("[insforge] save failed:", err.message);
    return null;
  }
}

// Load all audits, newest first. The dashboard groups these by business.
export async function loadAudits() {
  const c = getClient();
  if (!c) return [];
  try {
    const { data, error } = await c
      .database
      .from("audits")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(JSON.stringify(error));
    return data ?? [];
  } catch (err) {
    console.warn("[insforge] load failed:", err.message);
    return [];
  }
}