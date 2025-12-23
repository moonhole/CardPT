export const SEAT_COUNT = 6 as const;

export type SeatIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type ChipAmount = number;
export type HandId = number;
export type Seed = string;

export type Suit = "c" | "d" | "h" | "s";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type Phase =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "ended";

export type PlayerStatus = "active" | "folded" | "all_in" | "out";

export type PlayerState = {
  seat: SeatIndex;
  stack: ChipAmount;
  totalCommitted: ChipAmount;
  streetCommitted: ChipAmount;
  status: PlayerStatus;
  holeCards: Card[];
};

export type Pot = {
  amount: ChipAmount;
  eligibleSeats: SeatIndex[];
};

export type ActionType = "fold" | "check" | "call" | "bet" | "raise";

export type Action = {
  actor: SeatIndex;
  type: ActionType;
  amount: ChipAmount | null;
};

export type LegalAction = {
  type: ActionType;
  minAmount: ChipAmount | null;
  maxAmount: ChipAmount | null;
};

export type GameConfig = {
  seed: Seed;
  startingStacks: ChipAmount[];
  smallBlind: ChipAmount;
  bigBlind: ChipAmount;
};

export type GameState = {
  handId: HandId;
  dealerSeat: SeatIndex;
  smallBlindSeat: SeatIndex;
  bigBlindSeat: SeatIndex;
  actionSeat: SeatIndex;
  phase: Phase;
  board: Card[];
  deck: Card[];
  burn: Card[];
  players: PlayerState[];
  pots: Pot[];
  currentBet: ChipAmount;
  minRaiseTo: ChipAmount;
  lastRaiseSize: ChipAmount;
  actionsThisStreet: number;
  canRaise: boolean[];
  hasActedThisRound: boolean[];
  betThisRound: ChipAmount[];
};

export type EventType =
  | "hand_started"
  | "blind_posted"
  | "action_taken"
  | "street_dealt"
  | "pot_awarded"
  | "hand_ended"
  | "hand_summary";

export type Event = {
  type: EventType;
  handId: HandId;
  data: Record<string, unknown>;
};

export type EngineSnapshot = {
  config: GameConfig;
  state: GameState;
  events: Event[];
  actionHistory: Action[];
};
