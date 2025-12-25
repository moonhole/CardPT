import { createEngine } from "./engine";
import { GameConfig } from "./types";

const config: GameConfig = {
  seed: "test",
  startingStacks: [1000, 1000, 1000, 1000, 1000, 1000],
  smallBlind: 10,
  bigBlind: 20,
};

test("Blind rotation: Case 1 - Intended BB seat stack=0", () => {
  const engine = createEngine(config);
  const state = engine.getSnapshot().state;

  // Hand 1
  // D=0, SB=1, BB=2
  expect(state.dealerSeat).toBe(0);
  expect(state.smallBlindSeat).toBe(1);
  expect(state.bigBlindSeat).toBe(2);

  // End hand 1 manually
  state.phase = "ended";

  // Setup for Hand 2
  // Previous BB was 2. Anchor = 2.
  // Normal rotation: SB=2 (Old BB), BB=3.
  // We make seat 3 (intended BB) ineligible.
  state.players[3].stack = 0;
  state.players[3].status = "out";

  engine.startNextHand();

  // Anchor = 2.
  // Scan starts at 2.
  // 2 is eligible -> SB=2.
  // 3 is ineligible.
  // 4 is eligible -> BB=4.
  
  expect(state.smallBlindSeat).toBe(2);
  expect(state.bigBlindSeat).toBe(4);
  // Button rotates linearly
  expect(state.dealerSeat).toBe(1);
});

test("Blind rotation: Case 2 - Intended SB seat stack=0", () => {
  const engine = createEngine(config);
  const state = engine.getSnapshot().state;

  // Hand 1
  // D=0, SB=1, BB=2
  state.phase = "ended";

  // Setup for Hand 2
  // Previous BB was 2. Anchor = 2.
  // Normal rotation: SB=2, BB=3.
  // We make seat 2 (intended SB) ineligible.
  state.players[2].stack = 0;
  state.players[2].status = "out";

  engine.startNextHand();

  // Anchor = 2.
  // Scan starts at 2 -> ineligible.
  // 3 is eligible -> SB=3.
  // 4 is eligible -> BB=4.

  expect(state.smallBlindSeat).toBe(3);
  expect(state.bigBlindSeat).toBe(4);
  expect(state.dealerSeat).toBe(1);
});
