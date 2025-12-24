export type Action = {
  type: "FOLD" | "CALL" | "RAISE";
  amount?: number;
};

export type DriverKey =
  | "hand_strength"
  | "pot_odds"
  | "implied_odds"
  | "position"
  | "risk"
  | "variance"
  | "bluff_value"
  | "entertainment"
  | "table_image"
  | "opponent_model";

export type Driver = {
  key: DriverKey;
  weight: number;
};

export type Reason = {
  drivers: Driver[];
  plan: "see_turn" | "control_pot" | "apply_pressure";
  assumptions?: Record<string, string>;
  line: string;
};

export type Decision = {
  action: Action;
  reason: Reason;
  confidence: number;
};

export function validateDecision(decision: Decision): void {
  const { action, reason, confidence } = decision;
  const drivers = reason.drivers;

  if (!Array.isArray(drivers) || drivers.length < 2) {
    throw new Error("Decision must include at least 2 drivers.");
  }

  let sum = 0;
  let maxWeight = -Infinity;
  for (const driver of drivers) {
    if (driver.weight < 0 || driver.weight > 1) {
      throw new Error(`Driver weight out of range: ${driver.key}.`);
    }
    sum += driver.weight;
    if (driver.weight > maxWeight) {
      maxWeight = driver.weight;
    }
  }

  if (sum < 0.8 || sum > 1.2) {
    throw new Error("Sum of driver weights must be between 0.8 and 1.2.");
  }

  if (confidence < 0 || confidence > 1) {
    throw new Error("Confidence must be between 0 and 1.");
  }

  if (!reason.line || reason.line.trim().length === 0) {
    throw new Error("Reason line must be non-empty.");
  }

  const highestKeys = drivers
    .filter((driver) => driver.weight === maxWeight)
    .map((driver) => driver.key);

  if (action.type === "FOLD" && highestKeys.includes("hand_strength")) {
    throw new Error("FOLD cannot have hand_strength as highest-weight driver.");
  }

  if (action.type === "RAISE" && highestKeys.includes("risk")) {
    throw new Error("RAISE cannot have risk as highest-weight driver.");
  }
}
