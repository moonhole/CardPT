import { Decision, validateDecision } from "./decision";

function baseDecision(): Decision {
  return {
    action: { type: "CALL" },
    confidence: 0.7,
    reason: {
      drivers: [
        { key: "hand_strength", weight: 0.4 },
        { key: "pot_odds", weight: 0.4 },
        { key: "position", weight: 0.1 },
      ],
      plan: "see_turn",
      line: "I want to see the next card.",
    },
  };
}

test("valid decision passes", () => {
  expect(() => validateDecision(baseDecision())).not.toThrow();
});

test("invalid driver weight throws", () => {
  const decision = baseDecision();
  decision.reason.drivers[0].weight = 1.2;
  expect(() => validateDecision(decision)).toThrow(
    "Driver weight out of range"
  );
});

test("invalid weight sum throws", () => {
  const decision = baseDecision();
  decision.reason.drivers[0].weight = 0.1;
  decision.reason.drivers[1].weight = 0.1;
  decision.reason.drivers[2].weight = 0.1;
  expect(() => validateDecision(decision)).toThrow(
    "Sum of driver weights must be between 0.8 and 1.2."
  );
});

test("invalid confidence throws", () => {
  const decision = baseDecision();
  decision.confidence = 1.4;
  expect(() => validateDecision(decision)).toThrow(
    "Confidence must be between 0 and 1."
  );
});

test("fold sanity violation throws", () => {
  const decision = baseDecision();
  decision.action = { type: "FOLD" };
  decision.reason.drivers[0].weight = 0.6;
  decision.reason.drivers[1].weight = 0.2;
  expect(() => validateDecision(decision)).toThrow(
    "FOLD cannot have hand_strength as highest-weight driver."
  );
});

test("raise sanity violation throws", () => {
  const decision = baseDecision();
  decision.action = { type: "RAISE", amount: 12 };
  decision.reason.drivers[0].key = "risk";
  decision.reason.drivers[0].weight = 0.6;
  decision.reason.drivers[1].weight = 0.2;
  expect(() => validateDecision(decision)).toThrow(
    "RAISE cannot have risk as highest-weight driver."
  );
});
