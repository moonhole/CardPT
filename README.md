# CardPT v0.1

Deterministic, offline, single-table Texas Hold'em rule engine with a minimal UI and LLM-proposed actions gated by human confirmation.

## Scope
- No-Limit Texas Hold'em, 6 seats only.
- Seats can be human-controlled or LLM-assisted (proposal only).
- LLM output is always validated and never auto-applied.
- Engine is authoritative; UI is display + action submission only.
- Non-goals: autonomous agents, self-play, EV optimization.

## Structure
- `engine/` deterministic rules, state, and evaluation.
- `public/` sandbox UI (browser-only).
- `server.js` Node server (static file host + LLM proxy).
- `shared/` (reserved; unused in v0.1).

## Architecture
- Engine: deterministic rules and state transitions. No UI, no LLM.
- UI: renders state and submits actions. Never patches rules.
- Server: serves static UI and proxies `/api/llm` requests to Bailian.

## LLM Integration (v0.1)
- LLM is an untrusted proposal generator.
- Flow: propose → validate → human confirm → apply.
- Invalid proposals are rejected and fall back to manual input.

## Build
This repo uses TypeScript for the engine and plain HTML/JS for the UI.

```sh
tsc
```

Build output goes to `dist/engine/index.js`.

## Run
Install dependencies, set the API key, and start the Node server:

```sh
npm install
set DASHSCOPE_API_KEY=your_key_here
npm run dev
```

```powershell
npm install
$env:DASHSCOPE_API_KEY="your_key_here"
npm run dev
```

Then open:
```
http://localhost:8000/
```

## Determinism
- RNG is seeded from `config.seed` and `handId`.
- Same seed + same action list => same result.

## Notes
- Betting actions are `fold`, `check`, `call`, `bet`, `raise`.
- All-in is represented by a bet/raise/call that uses the player's full stack.
- Side pots and odd chip distribution are handled by the engine.
