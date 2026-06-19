/**
 * vapi.js — place an outbound call and pull the transcript + endedReason.
 */
const BASE = "https://api.vapi.ai";

function headers() {
  return {
    Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
    "Content-Type": "application/json"
  };
}

// Reasons that mean a human DID pick up and the call ran normally.
// A normal answered call ends when someone hangs up.
const CONNECTED_REASONS = [
  "hangup",            // either side hung up after a real conversation
  "assistant-ended",   // the assistant ended the call after completing its goals
  "customer-ended"     // the customer ended the call
];

// Reasons that explicitly mean nobody picked up. Kept for clarity/logging.
const NOT_CONNECTED_HINTS = [
  "voicemail", "no-answer", "did-not-answer", "customer-did-not-answer",
  "busy", "failed", "no-pickup", "twilio", "canceled", "cancelled"
];

// Decide whether a human actually answered.
// SAFE DEFAULT: only count as connected if the endedReason clearly indicates a
// completed, answered call. Anything else (voicemail, no-answer, error, unknown)
// counts as NOT connected -> scored as a missed call (hard-zero). Better to
// under-credit an ambiguous call than to give points for one nobody answered.
export function deriveConnected(endedReason = "") {
  const r = endedReason.toLowerCase();
  if (NOT_CONNECTED_HINTS.some(h => r.includes(h))) return false;
  if (CONNECTED_REASONS.some(h => r.includes(h))) return true;
  // unknown reason -> treat as NOT answered, and flag it so you can tune the lists
  console.warn(`[deriveConnected] unrecognized endedReason "${endedReason}" -> treating as NOT answered. Add it to CONNECTED_REASONS if it was actually answered.`);
  return false;
}

export async function placeCall(targetNumber) {
  const res = await fetch(`${BASE}/call/phone`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      assistantId: process.env.VAPI_ASSISTANT_ID,
      customer: { number: targetNumber }
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`placeCall ${res.status}: ${JSON.stringify(body)}`);
  return body.id;
}

export async function getCall(id) {
  const res = await fetch(`${BASE}/call/${id}`, { headers: headers() });
  const body = await res.json();
  if (!res.ok) throw new Error(`getCall ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function waitForEnd(id, { everyMs = 4000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (true) {
    const call = await getCall(id);
    process.stdout.write(`\r  status: ${call.status}        `);
    if (call.status === "ended") { process.stdout.write("\n"); return call; }
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for call to end.");
    await new Promise(r => setTimeout(r, everyMs));
  }
}

// Place a call and return everything the scorer needs.
export async function runVapiCall(targetNumber) {
  const id = await placeCall(targetNumber);
  const call = await waitForEnd(id);
  const connected = deriveConnected(call.endedReason);
  console.log(`[call] endedReason="${call.endedReason}" -> connected=${connected}` +
    (connected ? "" : "  (will be scored as a missed call: hard-zero)"));
  return {
    callId: id,
    endedReason: call.endedReason,
    connected,
    transcript: call.transcript || "",
    messages: call.messages || [],
    recordingUrl: call.recordingUrl || call.artifact?.recording?.url || null
  };
}