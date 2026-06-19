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

// endedReason substrings that mean "no human picked up" -> connected: false.
// VERIFY these against your own test calls and add any you see. An answered
// call typically ends with "hangup".
const NOT_CONNECTED_HINTS = [
  "voicemail", "no-answer", "did-not-answer", "customer-did-not-answer",
  "busy", "failed", "no-pickup"
];

export function deriveConnected(endedReason = "") {
  const r = endedReason.toLowerCase();
  return !NOT_CONNECTED_HINTS.some(h => r.includes(h));
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
  return {
    callId: id,
    endedReason: call.endedReason,
    connected: deriveConnected(call.endedReason),
    transcript: call.transcript || "",
    messages: call.messages || [],
    recordingUrl: call.recordingUrl || call.artifact?.recording?.url || null
  };
}
