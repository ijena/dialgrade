/**
 * score.js — the AI-caller readiness rubric. This is the core IP.
 * Same weights as the Nebius prompt; used as the deterministic fallback and
 * for scoring transcripts without an LLM.
 *
 * signals = {
 *   connected:         boolean,        // false = voicemail / no answer
 *   secondsToPrice:    number | null,  // when a price was first stated; null = never
 *   priceClarity:      "number" | "range" | "vague" | "none",
 *   availabilityGiven: boolean,
 *   leadCaptured:      boolean
 * }
 */
export function scoreAudit(sig) {
  const out = { signals: {}, fixes: [] };

  const aPts = sig.connected ? 20 : 0;
  out.signals.answered = {
    points: aPts, max: 20,
    detail: sig.connected ? "A person answered and handled the call."
                          : "Call went to voicemail / no answer."
  };

  // HARD RULE: a missed call is the worst outcome — cap at 5.
  if (!sig.connected) {
    out.signals.time_to_price = { points: 0, max: 20, detail: "No call to price." };
    out.signals.price_clarity = { points: 0, max: 25, detail: "No price given." };
    out.signals.availability  = { points: 0, max: 20, detail: "No availability given." };
    out.signals.lead_capture  = { points: 0, max: 15, detail: "No lead captured." };
    out.score = 0;
    out.rating = "not_ready";
    out.fixes = [{
      signal: "answered", points_recoverable: 20,
      fix: "Answer calls from unknown numbers — Google's AI shopper is often the first 'customer' to call, and a missed call drops you from the shortlist."
    }];
    return out;
  }

  let tPts = 0, tDetail;
  const s = sig.secondsToPrice;
  if (s == null)       { tPts = 0;  tDetail = "Never gave a price."; }
  else if (s <= 20)    { tPts = 20; tDetail = `Price stated in ${s}s — fast.`; }
  else if (s <= 45)    { tPts = 12; tDetail = `Price stated in ${s}s — a little slow.`; }
  else if (s <= 90)    { tPts = 6;  tDetail = `Price stated in ${s}s — too slow.`; }
  out.signals.time_to_price = { points: tPts, max: 20, detail: tDetail };

  let pPts, pDetail;
  if (sig.priceClarity === "number" || sig.priceClarity === "range") { pPts = 25; pDetail = "Gave a clear number or range."; }
  else if (sig.priceClarity === "vague") { pPts = 8; pDetail = "Vague — 'it depends / come in'."; }
  else { pPts = 0; pDetail = "No price at all."; }
  out.signals.price_clarity = { points: pPts, max: 25, detail: pDetail };

  const vPts = sig.availabilityGiven ? 20 : 0;
  out.signals.availability = {
    points: vPts, max: 20,
    detail: sig.availabilityGiven ? "Gave a day/time for the requested slot." : "Didn't give availability."
  };

  const lPts = sig.leadCaptured ? 15 : 0;
  out.signals.lead_capture = {
    points: lPts, max: 15,
    detail: sig.leadCaptured ? "Tried to book or take a callback." : "Didn't try to capture the lead."
  };

  const total = aPts + tPts + pPts + vPts + lPts;
  out.score = total;
  out.rating = total >= 75 ? "ready" : total >= 45 ? "needs_work" : "not_ready";

  const f = [];
  if (pPts < 25) f.push({ signal: "price_clarity", points_recoverable: 25 - pPts, fix: "Quote a clear starting price or range out loud — 'repairs start at $99 plus parts.' The AI needs a number to rank you." });
  if (vPts < 20) f.push({ signal: "availability", points_recoverable: 20 - vPts, fix: "State availability without being asked twice — 'we've got Saturday at 10.' Availability is half of what the shopper checks." });
  if (tPts < 20) f.push({ signal: "time_to_price", points_recoverable: 20 - tPts, fix: "Lead with the price fast. Hesitating or saying 'it depends' gets a weaker summary than quoting a range immediately." });
  if (lPts < 15) f.push({ signal: "lead_capture", points_recoverable: 15 - lPts, fix: "Try to book or take a callback number before the call ends — a captured lead is the whole point." });
  f.sort((a, b) => b.points_recoverable - a.points_recoverable);
  out.fixes = f.slice(0, 4);
  return out;
}