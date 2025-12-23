# CardPT v0.1

Deterministic, offline, single-table Texas Hold'em rule engine with a minimal UI.

## Scope
- No-Limit Texas Hold'em, 6 seats only.
- All seats controlled by a human (no AI).
- Engine is authoritative; UI is display + action submission only.

## Structure
- `engine/` deterministic rules, state, and evaluation.
- `ui/` minimal manual-action UI.
- `shared/` (reserved; unused in v0.1).

## Build
This repo uses TypeScript for the engine and plain HTML/JS for the UI.

```sh
tsc
```

Build output goes to `dist/engine/index.js`.

## Run
Serve the `ui/` folder with a local static server so ES modules load correctly.

Example (any static server works):
```sh
python -m http.server 8000
```

Then open:
```
http://localhost:8000/ui/index.html
```

## Determinism
- RNG is seeded from `config.seed` and `handId`.
- Same seed + same action list => same result.

## Notes
- Betting actions are `fold`, `check`, `call`, `bet`, `raise`.
- All-in is represented by a bet/raise/call that uses the player's full stack.
- Side pots and odd chip distribution are handled by the engine.
