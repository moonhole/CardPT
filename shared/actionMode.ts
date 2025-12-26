/**
 * ActionMode - Policy intent for seat decision-making participation
 * 
 * ActionMode describes HOW a seat participates in decision making.
 * It represents policy intent, not capability.
 * 
 * Semantic Meaning:
 * - manual: Human-only. No LLM invocation under any circumstance.
 * - ai_basic: LLM allowed, but with minimal authority.
 * - ai_standard: LLM allowed with standard authority.
 * - ai_experimental: LLM allowed with full experimental authority.
 * 
 * Hard Constraints:
 * - ActionMode is NOT a model selector
 * - ActionMode must NOT reference providers or models
 * - Do NOT add extensibility or custom modes
 * - ActionMode represents policy intent, not capability
 */

export const ACTION_MODE = {
  /**
   * Human-only mode.
   * No LLM invocation under any circumstance.
   */
  MANUAL: "manual",

  /**
   * LLM allowed with minimal authority.
   * Policy intent: Basic AI assistance permitted.
   */
  AI_BASIC: "ai_basic",

  /**
   * LLM allowed with standard authority.
   * Policy intent: Standard AI assistance permitted.
   */
  AI_STANDARD: "ai_standard",

  /**
   * LLM allowed with full experimental authority.
   * Policy intent: Full experimental AI features permitted.
   */
  AI_EXPERIMENTAL: "ai_experimental",
} as const;

export type ActionMode =
  | typeof ACTION_MODE.MANUAL
  | typeof ACTION_MODE.AI_BASIC
  | typeof ACTION_MODE.AI_STANDARD
  | typeof ACTION_MODE.AI_EXPERIMENTAL;

