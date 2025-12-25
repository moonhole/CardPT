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

export function validateDecision(decision: Decision, context?: { handId?: number }): void {
  const { action, reason, confidence } = decision;
  const drivers = reason.drivers;

  if (!Array.isArray(drivers) || drivers.length < 2) {
    throw new Error("Decision must include at least 2 drivers.");
  }

  let sum = 0;
  let maxWeight = -Infinity;
  for (const driver of drivers) {
    // Validate individual weight is finite and non-negative
    if (!Number.isFinite(driver.weight)) {
      throw new Error(`Driver weight must be a finite number: ${driver.key}.`);
    }
    if (driver.weight < 0) {
      throw new Error(`Driver weight must be non-negative: ${driver.key}.`);
    }
    if (driver.weight > 1) {
      const handIdStr = context?.handId !== undefined ? ` handId=${context.handId}` : "";
      console.warn(
        `[Decision Validation] Driver weight exceeds 1.0: key=${driver.key}, weight=${driver.weight.toFixed(3)}, action=${action.type}${handIdStr}`
      );
      // Continue execution - do not reject decision
    }
    sum += driver.weight;
    if (driver.weight > maxWeight) {
      maxWeight = driver.weight;
    }
  }

  // Weight sum validation downgraded to warning in v0.4
  // Explain weights are observational, not normalized ratios
  if (sum < 0.8 || sum > 1.2) {
    const handIdStr = context?.handId !== undefined ? ` handId=${context.handId}` : "";
    console.warn(
      `[Decision Validation] Driver weight sum outside expected range [0.8, 1.2]: sum=${sum.toFixed(3)}, action=${action.type}${handIdStr}`
    );
    // Continue execution - do not reject decision
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

  if (action.type === "RAISE" && highestKeys.includes("risk")) {
    throw new Error("RAISE cannot have risk as highest-weight driver.");
  }
}
