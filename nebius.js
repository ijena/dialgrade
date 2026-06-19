/**
 * nebius.js — score a transcript with Nebius Token Factory (OpenAI-compatible).
 * Falls back to the local rubric if Nebius isn't configured or the response
 * doesn't parse.
 */
import { scoreAudit } from "./score.js";

const SYSTEM_PROMPT = `You are a scoring engine for "AI-caller readiness." Google's AI calls local businesses on a shopper's behalf to get a price and availability, then ranks them. A business that doesn't answer, stalls, or won't give a clear price gets dropped.

Score how the business handled ONE such call, using ONLY these signals and weights:
1. Answered the call — 20 pts (connected true=20, false=0)
2. Time to first price — 20 pts. <=20s=20, <=45s=12, <=90s=6, never=0 (estimate from transcript order if no timestamps)
3. Price clarity — 25 pts. Clear number/range=25, vague("it depends")=8, none=0
4. Availability given — 20 pts. Gave a day/time or clear yes=20, else 0
5. Lead capture — 15 pts. Offered to book / took a callback=15, else 0

HARD RULE: if call_connected is false, total score is capped at 5.

Then list ranked fixes (max 4), biggest points-recoverable first, written to the business owner.

Return ONLY valid JSON, no markdown:
{"readiness_score":0,"rating":"not_ready|needs_work|ready","signals":{"answered":{"points":0,"max":20,"detail":""},"time_to_price":{"points":0,"max":20,"detail":""},"price_clarity":{"points":0,"max":25,"detail":""},"availability":{"points":0,"max":20,"detail":""},"lead_capture":{"points":0,"max":15,"detail":""}},"fixes":[{"signal":"","fix":"","points_recoverable":0}]}
Thresholds: >=75 ready, 45-74 needs_work, <45 not_ready.`;

export async function scoreWithNebius({ connected, transcript }) {
  const useLocal = process.env.SCORER === "local" || !process.env.NEBIUS_API_KEY;
  if (useLocal) {
    // crude signal extraction for the local fallback; the LLM does this better
    return localScore(connected, transcript);
  }

  try {
    const res = await fetch(`${process.env.NEBIUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.NEBIUS_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `call_connected: ${connected}\n\ntranscript:\n${transcript || "(no transcript — voicemail/no answer)"}` }
        ]
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Nebius ${res.status}: ${JSON.stringify(body)}`);
    const raw = body.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch (err) {
    console.warn("Nebius scoring failed, using local rubric:", err.message);
    return localScore(connected, transcript);
  }
}

// Normalize Nebius JSON to the same shape the dashboard expects.
function normalize(p) {
  return {
    score: p.readiness_score ?? 0,
    rating: p.rating ?? "not_ready",
    signals: p.signals ?? {},
    fixes: (p.fixes ?? []).map(f => ({
      signal: f.signal, fix: f.fix, points_recoverable: f.points_recoverable ?? 0
    }))
  };
}

// Local fallback: naive keyword extraction -> rubric. Good enough to test the
// pipeline; replace with Nebius for real scoring.
function localScore(connected, transcript = "") {
  const t = transcript.toLowerCase();
  const hasPrice = /\$|\bdollar|\bprice|\bstarts at|\bquote|\b\d{2,}\b/.test(t);
  const vague = /(it depends|come in|have to see|can't say|hard to say|without seeing)/.test(t);
  const avail = /(saturday|sunday|monday|tomorrow|today|available|we have|open at|book you|am\b|pm\b)/.test(t);
  const lead  = /(book|your name|callback|call you back|schedule|grab your)/.test(t);
  const r = scoreAudit({
    connected,
    secondsToPrice: hasPrice && !vague ? 10 : null,
    priceClarity: hasPrice && !vague ? "range" : vague ? "vague" : "none",
    availabilityGiven: avail,
    leadCaptured: lead
  });
  return { score: r.score, rating: r.rating, signals: r.signals, fixes: r.fixes };
}
