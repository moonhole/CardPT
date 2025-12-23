import {
  GameConfig,
  GameState,
  PlayerState,
  SEAT_COUNT,
  SeatIndex,
} from "./types.js";

const SEATS: SeatIndex[] = [0, 1, 2, 3, 4, 5];

export function createInitialState(config: GameConfig): GameState {
  if (config.startingStacks.length !== SEAT_COUNT) {
    throw new Error("startingStacks must have 6 entries.");
  }

  const players: PlayerState[] = SEATS.map((seat) => ({
    seat,
    stack: config.startingStacks[seat],
    totalCommitted: 0,
    streetCommitted: 0,
    status: "active",
    holeCards: [],
  }));

  return {
    handId: 1,
    dealerSeat: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    actionSeat: 3,
    phase: "preflop",
    board: [],
    deck: [],
    burn: [],
    players,
    pots: [],
    currentBet: 0,
    minRaiseTo: config.bigBlind,
    lastRaiseSize: config.bigBlind,
    actionsThisStreet: 0,
    canRaise: SEATS.map(() => true),
  };
}
