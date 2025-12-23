import {
  Action,
  EngineSnapshot,
  GameConfig,
  GameState,
  LegalAction,
  Phase,
  PlayerState,
  SeatIndex,
} from "./types.js";
import { createInitialState } from "./state.js";
import { createDeck, shuffleDeck } from "./deck.js";
import { createRng } from "./rng.js";
import { compareHands, evaluate7 } from "./evaluate.js";

export type Engine = {
  getSnapshot: () => EngineSnapshot;
  getLegalActions: () => LegalAction[];
  applyAction: (action: Action) => void;
  startNextHand: () => void;
};

const SEATS: SeatIndex[] = [0, 1, 2, 3, 4, 5];

function nextSeat(seat: SeatIndex): SeatIndex {
  return ((seat + 1) % 6) as SeatIndex;
}

function countEligiblePlayers(players: PlayerState[]): number {
  return players.filter((p) => p.status !== "folded" && p.status !== "out")
    .length;
}

function firstActiveFrom(
  state: GameState,
  start: SeatIndex
): SeatIndex | null {
  let seat = start;
  for (let i = 0; i < 6; i += 1) {
    const player = state.players[seat];
    if (player.status === "active" && player.stack > 0) {
      return seat;
    }
    seat = nextSeat(seat);
  }
  return null;
}

function resetStreet(state: GameState, config: GameConfig) {
  for (const player of state.players) {
    player.streetCommitted = 0;
  }
  state.canRaise = state.players.map(
    (player) => player.status === "active" && player.stack > 0
  );
  state.betThisRound = state.players.map(() => 0);
  state.hasActedThisRound = state.players.map(
    (player) => player.status === "all_in" || player.status === "out"
  );
  state.currentBet = 0;
  state.lastRaiseSize = config.bigBlind;
  state.minRaiseTo = config.bigBlind;
  state.actionsThisStreet = 0;
}

function postBlind(
  state: GameState,
  seat: SeatIndex,
  amount: number
): number {
  const player = state.players[seat];
  const posted = Math.min(player.stack, amount);
  player.stack -= posted;
  player.totalCommitted += posted;
  player.streetCommitted += posted;
  state.betThisRound[seat] = player.streetCommitted;
  if (player.stack === 0) {
    player.status = "all_in";
    state.hasActedThisRound[seat] = true;
  }
  return posted;
}

function dealToSeat(
  state: GameState,
  seat: SeatIndex,
  count: number
) {
  const player = state.players[seat];
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) {
      throw new Error("Deck exhausted.");
    }
    player.holeCards.push(card);
  }
}

function dealBoard(state: GameState, count: number) {
  const burn = state.deck.shift();
  if (!burn) {
    throw new Error("Deck exhausted.");
  }
  state.burn.push(burn);
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) {
      throw new Error("Deck exhausted.");
    }
    state.board.push(card);
  }
}

function computePots(players: PlayerState[]) {
  const commitments = players.map((p) => p.totalCommitted);
  const uniqueLevels = Array.from(
    new Set(commitments.filter((v) => v > 0))
  ).sort((a, b) => a - b);

  const pots = [];
  let previous = 0;
  for (const level of uniqueLevels) {
    const contributors = players.filter((p) => p.totalCommitted >= level);
    const amount = (level - previous) * contributors.length;
    const eligibleSeats = contributors
      .filter((p) => p.status !== "folded" && p.status !== "out")
      .map((p) => p.seat);
    pots.push({ amount, eligibleSeats });
    previous = level;
  }
  return pots;
}

function distributeOddChips(
  total: number,
  winners: SeatIndex[],
  dealerSeat: SeatIndex
): Record<SeatIndex, number> {
  const per = Math.floor(total / winners.length);
  const remainder = total % winners.length;
  const payouts: Record<SeatIndex, number> = Object.create(null);
  for (const seat of winners) {
    payouts[seat] = per;
  }
  let seat = nextSeat(dealerSeat);
  let awarded = 0;
  while (awarded < remainder) {
    if (winners.includes(seat)) {
      payouts[seat] += 1;
      awarded += 1;
    }
    seat = nextSeat(seat);
  }
  return payouts;
}

function resolveShowdown(state: GameState) {
  const pots = computePots(state.players);
  const results: {
    potIndex: number;
    payouts: Record<SeatIndex, number>;
  }[] = [];
  const seatRanks: Record<SeatIndex, ReturnType<typeof evaluate7>> =
    Object.create(null);

  for (let i = 0; i < pots.length; i += 1) {
    const pot = pots[i];
    const contenders = pot.eligibleSeats;
    if (contenders.length === 0) {
      continue;
    }
    let bestRank = null;
    let winners: SeatIndex[] = [];
    for (const seat of contenders) {
      const player = state.players[seat];
      const rank =
        seatRanks[seat] ??
        evaluate7([...player.holeCards, ...state.board]);
      seatRanks[seat] = rank;
      if (!bestRank || compareHands(rank, bestRank) > 0) {
        bestRank = rank;
        winners = [seat];
      } else if (bestRank && compareHands(rank, bestRank) === 0) {
        winners.push(seat);
      }
    }
    const payouts = distributeOddChips(pot.amount, winners, state.dealerSeat);
    results.push({ potIndex: i, payouts });
  }
  return { pots, results, seatRanks };
}

function awardPots(state: GameState): {
  pots: ReturnType<typeof computePots>;
  awards: { seat: SeatIndex; amount: number; potIndex: number }[];
  seatRanks: ReturnType<typeof resolveShowdown>["seatRanks"];
} {
  const showdown = resolveShowdown(state);
  const awards: { seat: SeatIndex; amount: number; potIndex: number }[] = [];
  for (const result of showdown.results) {
    for (const seat of Object.keys(result.payouts)) {
      const seatIndex = Number(seat) as SeatIndex;
      const amount = result.payouts[seatIndex];
      state.players[seatIndex].stack += amount;
      awards.push({ seat: seatIndex, amount, potIndex: result.potIndex });
    }
  }
  state.pots = showdown.pots;
  return { pots: showdown.pots, awards, seatRanks: showdown.seatRanks };
}

function rankToText(rank: ReturnType<typeof evaluate7>): string {
  switch (rank.category) {
    case 8:
      return "Straight Flush";
    case 7:
      return "Four of a Kind";
    case 6:
      return "Full House";
    case 5:
      return "Flush";
    case 4:
      return "Straight";
    case 3:
      return "Three of a Kind";
    case 2:
      return "Two Pair";
    case 1:
      return "One Pair";
    default:
      return "High Card";
  }
}

function collectUncontested(state: GameState) {
  const remaining = state.players.filter(
    (p) => p.status !== "folded" && p.status !== "out"
  );
  if (remaining.length !== 1) {
    return null;
  }
  const winner = remaining[0];
  const potTotal = state.players.reduce(
    (sum, p) => sum + p.totalCommitted,
    0
  );
  winner.stack += potTotal;
  state.pots = [{ amount: potTotal, eligibleSeats: [winner.seat] }];
  return { winner: winner.seat, amount: potTotal };
}

function ensureHandSetup(
  state: GameState,
  config: GameConfig,
  events: EngineSnapshot["events"]
) {
  const rng = createRng(`${config.seed}:${state.handId}`);
  state.deck = shuffleDeck(createDeck(), rng);
  state.board = [];
  state.burn = [];

  for (const player of state.players) {
    player.holeCards = [];
    player.totalCommitted = 0;
    player.streetCommitted = 0;
    if (player.stack === 0) {
      player.status = "out";
    } else {
      player.status = "active";
    }
  }

  state.dealerSeat = ((state.dealerSeat + 1) % 6) as SeatIndex;
  state.smallBlindSeat = nextSeat(state.dealerSeat);
  state.bigBlindSeat = nextSeat(state.smallBlindSeat);
  state.phase = "preflop";
  resetStreet(state, config);

  events.push({
    type: "hand_started",
    handId: state.handId,
    data: {
      dealerSeat: state.dealerSeat,
      smallBlindSeat: state.smallBlindSeat,
      bigBlindSeat: state.bigBlindSeat,
    },
  });

  const sbPosted = postBlind(state, state.smallBlindSeat, config.smallBlind);
  const bbPosted = postBlind(state, state.bigBlindSeat, config.bigBlind);
  state.currentBet = bbPosted;
  state.lastRaiseSize = config.bigBlind;
  state.minRaiseTo = state.currentBet + state.lastRaiseSize;
  state.canRaise = state.players.map(
    (player) => player.status === "active" && player.stack > 0
  );
  state.betThisRound = state.players.map(
    (player) => player.streetCommitted
  );
  state.hasActedThisRound = state.players.map(
    (player) => player.status === "all_in" || player.status === "out"
  );

  events.push({
    type: "blind_posted",
    handId: state.handId,
    data: { seat: state.smallBlindSeat, amount: sbPosted },
  });
  events.push({
    type: "blind_posted",
    handId: state.handId,
    data: { seat: state.bigBlindSeat, amount: bbPosted },
  });

  let dealSeat = state.smallBlindSeat;
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < 6; i += 1) {
      const player = state.players[dealSeat];
      if (player.status === "active") {
        dealToSeat(state, dealSeat, 1);
      }
      dealSeat = nextSeat(dealSeat);
    }
  }

  const actionSeat = firstActiveFrom(state, nextSeat(state.bigBlindSeat));
  if (actionSeat === null) {
    throw new Error("No active player to act.");
  }
  state.actionSeat = actionSeat;
}

function isBettingRoundComplete(state: GameState): boolean {
  const stillInHand = state.players.filter(
    (p) => p.status !== "folded" && p.status !== "out"
  );
  if (stillInHand.length === 0) {
    return true;
  }
  return stillInHand.every((p) => {
    if (p.status === "all_in") {
      return state.hasActedThisRound[p.seat];
    }
    return (
      state.betThisRound[p.seat] === state.currentBet &&
      state.hasActedThisRound[p.seat]
    );
  });
}

function advancePhase(
  state: GameState,
  config: GameConfig,
  events: EngineSnapshot["events"]
) {
  if (state.phase === "preflop") {
    dealBoard(state, 3);
    state.phase = "flop";
  } else if (state.phase === "flop") {
    dealBoard(state, 1);
    state.phase = "turn";
  } else if (state.phase === "turn") {
    dealBoard(state, 1);
    state.phase = "river";
  } else if (state.phase === "river") {
    state.phase = "showdown";
  }

  if (state.phase === "showdown") {
    return;
  }

  events.push({
    type: "street_dealt",
    handId: state.handId,
    data: { phase: state.phase, board: [...state.board] },
  });

  resetStreet(state, config);
  const actionSeat = firstActiveFrom(state, state.smallBlindSeat);
  if (actionSeat === null) {
    throw new Error("No active player to act.");
  }
  state.actionSeat = actionSeat;
}

function resolveHandEnd(
  state: GameState,
  events: EngineSnapshot["events"]
) {
  const uncontested = collectUncontested(state);
  if (uncontested) {
    events.push({
      type: "pot_awarded",
      handId: state.handId,
      data: { seat: uncontested.winner, amount: uncontested.amount },
    });
  } else {
    const awards = awardPots(state);
    for (const award of awards.awards) {
      events.push({
        type: "pot_awarded",
        handId: state.handId,
        data: award,
      });
    }
    const showdownSeats = Object.keys(awards.seatRanks).map(
      (seat) => Number(seat) as SeatIndex
    );
    const seatSummaries = showdownSeats.map((seat) => ({
      seat,
      handRank: rankToText(awards.seatRanks[seat]),
    }));
    const potWinners = awards.pots.map((pot, index) => ({
      potIndex: index,
      amount: pot.amount,
      eligibleSeats: pot.eligibleSeats,
      winners: awards.awards
        .filter((award) => award.potIndex === index)
        .map((award) => ({ seat: award.seat, amount: award.amount })),
    }));
    events.push({
      type: "hand_summary",
      handId: state.handId,
      data: {
        showdown: seatSummaries,
        pots: potWinners,
      },
    });
  }
  state.phase = "ended";
  events.push({
    type: "hand_ended",
    handId: state.handId,
    data: {},
  });
}

function advanceAfterAction(
  state: GameState,
  config: GameConfig,
  events: EngineSnapshot["events"]
) {
  const remaining = countEligiblePlayers(state.players);
  if (remaining <= 1) {
    resolveHandEnd(state, events);
    return;
  }

  if (state.phase === "showdown") {
    resolveHandEnd(state, events);
    return;
  }

  if (isBettingRoundComplete(state)) {
    advancePhase(state, config, events);
    // Check phase after advancePhase may have mutated it
    if ((state.phase as Phase) === "showdown") {
      resolveHandEnd(state, events);
      return;
    }
    return;
  }

  const nextAction = firstActiveFrom(state, nextSeat(state.actionSeat));
  if (nextAction === null) {
    resolveHandEnd(state, events);
    return;
  }
  state.actionSeat = nextAction;
}

function getPlayerToAct(state: GameState): PlayerState {
  const player = state.players[state.actionSeat];
  if (player.status !== "active") {
    throw new Error("Action seat is not active.");
  }
  return player;
}

function markActedAfterAggression(state: GameState, actorSeat: SeatIndex) {
  state.hasActedThisRound = state.players.map((player) => {
    if (player.seat === actorSeat) {
      return true;
    }
    if (player.status === "active") {
      return false;
    }
    return true;
  });
}

function legalActionsForPlayer(
  state: GameState,
  config: GameConfig
): LegalAction[] {
  const player = getPlayerToAct(state);
  const toCall = Math.max(0, state.currentBet - state.betThisRound[player.seat]);
  const maxTotal = state.betThisRound[player.seat] + player.stack;
  const actions: LegalAction[] = [];

  if (toCall > 0) {
    actions.push({ type: "fold", minAmount: null, maxAmount: null });
    actions.push({ type: "call", minAmount: null, maxAmount: null });
    if (maxTotal > state.currentBet && state.canRaise[player.seat]) {
      const minRaiseTo = state.minRaiseTo;
      const maxRaiseTo = maxTotal;
      actions.push({
        type: "raise",
        minAmount: Math.min(minRaiseTo, maxRaiseTo),
        maxAmount: maxRaiseTo,
      });
    }
  } else {
    actions.push({ type: "check", minAmount: null, maxAmount: null });
    if (player.stack > 0) {
      const minBet = config.bigBlind;
      const maxBet = maxTotal;
      actions.push({
        type: "bet",
        minAmount: Math.min(minBet, maxBet),
        maxAmount: maxBet,
      });
    }
  }

  return actions;
}

function applyPlayerAction(
  state: GameState,
  config: GameConfig,
  action: Action
) {
  const player = getPlayerToAct(state);
  if (action.actor !== player.seat) {
    throw new Error("Action actor does not match action seat.");
  }

  const toCall = Math.max(0, state.currentBet - state.betThisRound[player.seat]);
  const maxTotal = state.betThisRound[player.seat] + player.stack;

  if (action.type === "fold") {
    if (toCall === 0) {
      throw new Error("Cannot fold when checking is available.");
    }
    player.status = "folded";
    state.canRaise[player.seat] = false;
    state.hasActedThisRound[player.seat] = true;
    return;
  }

  if (action.type === "check") {
    if (toCall !== 0) {
      throw new Error("Cannot check when facing a bet.");
    }
    state.canRaise[player.seat] = false;
    state.hasActedThisRound[player.seat] = true;
    return;
  }

  if (action.type === "call") {
    const callAmount = Math.min(player.stack, toCall);
    player.stack -= callAmount;
    player.totalCommitted += callAmount;
    player.streetCommitted += callAmount;
    state.betThisRound[player.seat] += callAmount;
    if (player.stack === 0) {
      player.status = "all_in";
      state.canRaise[player.seat] = false;
    }
    state.canRaise[player.seat] = false;
    state.hasActedThisRound[player.seat] = true;
    return;
  }

  if (action.type === "bet") {
    if (toCall !== 0) {
      throw new Error("Cannot bet when facing a bet.");
    }
    if (action.amount === null) {
      throw new Error("Bet requires amount.");
    }
    const betTo = action.amount;
    if (betTo <= 0 || betTo > maxTotal) {
      throw new Error("Bet amount out of range.");
    }
    const minBet = config.bigBlind;
    if (betTo < minBet && betTo !== maxTotal) {
      throw new Error("Bet below minimum and not all-in.");
    }
    const betAmount = betTo - state.betThisRound[player.seat];
    player.stack -= betAmount;
    player.totalCommitted += betAmount;
    player.streetCommitted += betAmount;
    state.betThisRound[player.seat] = betTo;
    state.currentBet = state.betThisRound[player.seat];
    const raiseSize = state.currentBet - 0;
    state.lastRaiseSize = raiseSize;
    state.minRaiseTo = state.currentBet + state.lastRaiseSize;
    if (player.stack === 0) {
      player.status = "all_in";
    }
    state.canRaise = state.players.map(
      (p) => p.status === "active" && p.stack > 0
    );
    markActedAfterAggression(state, player.seat);
    return;
  }

  if (action.type === "raise") {
    if (toCall <= 0) {
      throw new Error("Cannot raise without a bet to call.");
    }
    if (action.amount === null) {
      throw new Error("Raise requires amount.");
    }
    const raiseTo = action.amount;
    if (raiseTo <= state.currentBet || raiseTo > maxTotal) {
      throw new Error("Raise amount out of range.");
    }
    const minRaiseTo = state.minRaiseTo;
    const isAllIn = raiseTo === maxTotal;
    if (raiseTo < minRaiseTo && !isAllIn) {
      throw new Error("Raise below minimum and not all-in.");
    }
    const raiseAmount = raiseTo - state.betThisRound[player.seat];
    player.stack -= raiseAmount;
    player.totalCommitted += raiseAmount;
    player.streetCommitted += raiseAmount;
    state.betThisRound[player.seat] = raiseTo;
    if (raiseTo >= minRaiseTo) {
      const raiseSize = raiseTo - state.currentBet;
      state.lastRaiseSize = raiseSize;
      state.minRaiseTo = raiseTo + state.lastRaiseSize;
      state.canRaise = state.players.map(
        (p) => p.status === "active" && p.stack > 0
      );
    }
    state.currentBet = Math.max(state.currentBet, raiseTo);
    if (player.stack === 0) {
      player.status = "all_in";
    }
    if (raiseTo < minRaiseTo || player.stack === 0) {
      state.canRaise[player.seat] = false;
    }
    markActedAfterAggression(state, player.seat);
    return;
  }

  const never: never = action.type;
  throw new Error(`Unknown action type: ${never}`);
}

export function createEngine(config: GameConfig): Engine {
  let state: GameState = createInitialState(config);
  const events: EngineSnapshot["events"] = [];
  const actionHistory: Action[] = [];

  ensureHandSetup(state, config, events);

  return {
    getSnapshot: () => ({
      config,
      state,
      events: [...events],
      actionHistory: [...actionHistory],
    }),
    getLegalActions: () => {
      if (state.phase === "ended") {
        return [];
      }
      return legalActionsForPlayer(state, config);
    },
    applyAction: (action: Action) => {
      if (state.phase === "ended") {
        throw new Error("Hand is over.");
      }
      applyPlayerAction(state, config, action);
      actionHistory.push(action);
      events.push({
        type: "action_taken",
        handId: state.handId,
        data: { action },
      });
      advanceAfterAction(state, config, events);
    },
    startNextHand: () => {
      if (state.phase !== "ended") {
        throw new Error("Current hand is not finished.");
      }
      state.handId += 1;
      ensureHandSetup(state, config, events);
    },
  };
}
