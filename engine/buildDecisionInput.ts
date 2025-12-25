type BuildDecisionInputParams = {
  engineFacts: unknown;
  profile: unknown;
  state: {
    position: unknown;
    pot: unknown;
    to_call: unknown;
    legal_actions: unknown;
    phase?: string;
    holeCards?: Array<{ rank: string; suit: string }>;
    board?: Array<{ rank: string; suit: string }>;
    players?: Array<{
      id: number;
      stack: number;
      committed: number;
      status: string;
    }>;
  };
  legalActions: unknown;
};

const actionEncodingRules = `
Action Encoding Rules (STRICT):
- The only valid action types are: FOLD, CALL, RAISE.
- CHECK must be encoded as CALL.
- BET must be encoded as RAISE.
- Any other action type is invalid and will be rejected.

`;

// Map engine phase to street context
function phaseToStreet(phase: string | undefined): "PREFLOP" | "FLOP" | "TURN" | "RIVER" {
  if (!phase) return "PREFLOP";
  const normalized = phase.toLowerCase();
  if (normalized === "preflop") return "PREFLOP";
  if (normalized === "flop") return "FLOP";
  if (normalized === "turn") return "TURN";
  if (normalized === "river") return "RIVER";
  return "PREFLOP";
}

// Format card object to short string (e.g. "8c", "2d")
function formatCard(card: { rank: string; suit: string } | undefined): string {
  if (!card || !card.rank || !card.suit) return "";
  return `${card.rank}${card.suit}`.toLowerCase();
}

export function buildDecisionInput(params: BuildDecisionInputParams) {
  const toCall = Number(params.state.to_call);
  const pot = Number(params.state.pot);
  if (Number.isFinite(toCall) && Number.isFinite(pot) && toCall > 0 && pot === 0) {
    throw new Error("Invalid state: to_call > 0 but pot is 0.");
  }
  
  // Derive street from phase
  const street = phaseToStreet(params.state.phase);
  
  // Format hole cards
  const hole = Array.isArray(params.state.holeCards)
    ? params.state.holeCards.map(formatCard).filter((c) => c !== "")
    : [];
  
  // Format board cards (empty array for preflop)
  const board = street === "PREFLOP"
    ? []
    : Array.isArray(params.state.board)
      ? params.state.board.map(formatCard).filter((c) => c !== "")
      : [];
  
  // Full table stack & commitment state is required for correct poker reasoning
  const players = Array.isArray(params.state.players)
    ? params.state.players
    : [];
  const actingPlayerStack = players.find((p) => p.id === params.state.position)?.stack ?? null;

  return {
    task: "propose_decision",
    schema_version: "cardpt.v0.2",
    engine_facts: params.engineFacts,
    profile: params.profile,
    instruction: actionEncodingRules,
    state: {
      street,
      position: params.state.position,
      hole,
      board,
      pot: params.state.pot,
      to_call: params.state.to_call,
      stack: actingPlayerStack,
      players,
      legal_actions: params.state.legal_actions,
    },
    output_schema: {
      action: {
        type: "FOLD, CALL, or RAISE",
        amount: "number (used when raising)",
      },
      reason: {
        drivers: [
          {
            key:
              "hand_strength | pot_odds | implied_odds | position | risk | variance | bluff_value | entertainment | table_image | opponent_model",
            weight: "relative importance",
          },
        ],
        plan: "see_turn | control_pot | apply_pressure",
        assumptions: "object with free-form notes",
        line: "short in-character sentence",
        constraints: {
          RAISE: "risk should not be the main reason",
        },
      },
      confidence: "number",
    }
  };
}
