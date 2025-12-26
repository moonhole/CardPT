# CardPT v0.5

An experimental, offline, single-player Texas Hold'em sandbox for observing LLM decision behavior.

## What CardPT Is

CardPT is a deterministic poker rule engine with a UI that allows you to:
- Configure multiple seats with different LLM personas (prompts)
- Run hands where LLMs propose actions for their assigned seats
- Observe how different prompts lead to different decision patterns
- Manually override any LLM proposal before it's applied

The engine enforces correct poker rules. The LLMs propose actions. You observe the behavior.

## What CardPT Is Not

CardPT is **not**:
- A poker solver or EV optimizer
- A competitive AI poker player
- A training system for improving play
- An autonomous agent framework
- A tool for finding optimal strategies

CardPT does not evaluate whether LLM decisions are "correct" or "strong." It provides a controlled environment to see what decisions different prompts produce under the same game conditions.

## Scope (v0.5)

**Game rules:**
- No-Limit Texas Hold'em, 6 seats
- Deterministic RNG (seed-based)
- Side pots and odd chip distribution handled correctly

**LLM integration:**
- LLMs propose actions (fold, check, call, bet, raise)
- All proposals require human confirmation
- Invalid proposals are rejected; manual input is available
- No auto-application of LLM decisions

**UI:**
- Seat configuration (controller mode, stack, prompt profile)
- Real-time hand visualization
- LLM proposal display with reasoning
- Manual action controls

**Intentional limitations:**
- Single table only
- No multi-hand statistics or analysis
- No learning or adaptation
- No comparison to optimal play
- No autonomous play mode

## Architecture

**Engine** (`engine/`):
- TypeScript implementation of poker rules
- Deterministic state transitions
- No UI dependencies, no LLM dependencies

**UI** (`public/`):
- Browser-based sandbox interface
- Renders engine state
- Submits actions to engine
- Never modifies engine rules

**Server** (`server.js`):
- Static file hosting
- LLM API proxy (`/api/llm`)

## Build

```sh
tsc
```

Build output: `dist/engine/index.js`

## Run

Install dependencies and set API key:

**Windows (Command Prompt):**
```sh
npm install
set DASHSCOPE_API_KEY=your_key_here
npm run dev
```

**Windows (PowerShell):**
```powershell
npm install
$env:DASHSCOPE_API_KEY="your_key_here"
npm run dev
```

**macOS / Linux:**
```sh
npm install
export DASHSCOPE_API_KEY=your_key_here
npm run dev
```

Open: `http://localhost:8000/`

## Determinism

- RNG seeded from `config.seed` and `handId`
- Same seed + same action sequence = identical result
- Enables reproducible observation of LLM behavior under controlled conditions

## Technical Notes

- Betting actions: `fold`, `check`, `call`, `bet`, `raise`
- All-in handled automatically when stack is exhausted
- Engine is authoritative; UI is display-only
- LLM proposals are validated before application
