# Dialgrade

**AI-caller readiness audit.** Google's AI now calls local businesses on a
shopper's behalf, gets a price + availability, and ranks them. A business that
doesn't answer, stalls, or won't give a clear price gets dropped from the
shortlist — and loses the lead without ever knowing.

Dialgrade calls a business the way Google's AI does, then **scores how the line
handled it** and tells the owner exactly what to fix.

> Everyone audits whether Google's AI will *pick* you. We call your business like
> Google's AI does and score what actually happens on the line.

## What it does

1. **Vapi** places an outbound call playing the "AI shopper" (asks for a price on
   a job + Saturday availability).
2. Pulls the **transcript** and **endedReason** off the finished call.
3. **Nebius** scores the transcript against the readiness rubric (5 signals).
4. Prints a readiness score, per-signal breakdown, and a ranked fix list.

## Setup

```bash
git clone <your-repo-url> && cd dialgrade
npm install
cp .env.example .env       # then fill in your keys
```

Fill in `.env`:

- **Vapi** — create an assistant + a phone number in the Vapi dashboard, paste
  the assistant ID, phone number ID, and your PRIVATE api key. Set `TARGET_NUMBER`
  to your own cell (E.164: `+1` then 10 digits).
- **Nebius** — paste your Token Factory key. Confirm `NEBIUS_BASE_URL` and
  `NEBIUS_MODEL` in your Nebius dashboard (defaults are a guess — verify them).

## Run

```bash
# Place a real call to TARGET_NUMBER, then score it
npm run audit

# Score a transcript without calling (test the rubric / demo "is it real?")
npm run score -- "AI: pipe repair cost? BIZ: starts at $99, Saturday open"
npm run score -- --voicemail
```

`npm run audit` dials your phone. Answer it, talk, hang up — it prints the
transcript, whether it connected, and the score, and saves the full result to
`calls/<id>.json`.

## The before/after demo

You control both runs by how you answer your own phone:

- **Bad run:** let it ring to voicemail, or waffle — "uh, depends, come in."
  → low score, red.
- **Good run:** answer crisp — "Pipe repair starts at $99, Saturday at 10 open,
  can I book you?" → high score, green.

## Verify before you rely on it

The `connected` flag is derived from `endedReason` by matching known substrings
(see `NOT_CONNECTED_HINTS` in `src/vapi.js`). **Place one answered call and one
voicemail call, check what `endedReason` actually says, and add any missing
values to that list.** This is your hard-zero — get it right.

Set `SCORER=local` in `.env` to score without Nebius (keyword-based fallback) so
you can test the call path before your Nebius key works.

## Layout

```
src/
  index.js            full pipeline: call -> score -> print/save
  vapi.js             place call, poll, return transcript + connected
  nebius.js           score a transcript (Nebius, falls back to local rubric)
  score.js            the readiness rubric — core IP, shared
  score-transcript.js score a transcript offline (no call)
```

## Next

- Wire `saveToInsforge()` in place of the local `calls/*.json` write.
- Front the pipeline with the dashboard (roster + scorecard + before/after).
- Switch polling to a Vapi `end-of-call-report` webhook for production.
```
