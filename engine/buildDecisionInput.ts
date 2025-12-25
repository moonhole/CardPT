type BuildDecisionInputParams = {
  engineFacts: unknown;
  profile: unknown;
  state: {
    position: unknown;
    pot: unknown;
    to_call: unknown;
    legal_actions: unknown;
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

export function buildDecisionInput(params: BuildDecisionInputParams) {
  const toCall = Number(params.state.to_call);
  const pot = Number(params.state.pot);
  if (Number.isFinite(toCall) && Number.isFinite(pot) && toCall > 0 && pot === 0) {
    throw new Error("Invalid state: to_call > 0 but pot is 0.");
  }
  return {
    task: "propose_decision",
    schema_version: "cardpt.v0.2",
    engine_facts: params.engineFacts,
    profile: params.profile,
    instruction: actionEncodingRules,
    state: {
      position: params.state.position,
      pot: params.state.pot,
      to_call: params.state.to_call,
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
          FOLD: "Avoid folding solely due to hand strength if other factors are neutral",
          RAISE: "risk should not be the main reason",
        },
      },
      confidence: "number",
    }

    // output_schema: {
    //   action: {
    //     type: "ENUM: exactly one of [FOLD, CALL, RAISE]",
    //     amount: "number",
    //   },
    //   reason: {
    //     drivers: [
    //       {
    //         key:
    //           "hand_strength | pot_odds | implied_odds | position | risk | variance | bluff_value | entertainment | table_image | opponent_model",
    //         weight: "normalized proportion (all weights must sum to ~1.0)",
    //       },
    //     ],
    //     plan: "see_turn | control_pot | apply_pressure",
    //     assumptions: { string: "string" },
    //     line: "short in-character sentence",

    //     constraints: {
    //       FOLD: "hand_strength must NOT be the highest-weight driver",
    //       RAISE: "risk must NOT be the highest-weight driver",
    //     },
    //   },
    //   confidence: "number between 0 and 1",
    // }    
  };
}
