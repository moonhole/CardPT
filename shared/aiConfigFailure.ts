/**
 * AI Configuration Failure Semantics
 * 
 * Invalid AI configuration is a POLICY FAILURE, not a runtime error.
 * This represents governance boundaries, not exceptional conditions.
 * 
 * Failure Semantics:
 * - Refuse LLM invocation (do not crash)
 * - Provide human-readable reason
 * - Allow the hand to continue via manual control
 * 
 * Hard Constraints:
 * - Do NOT throw or crash
 * - Do NOT silently auto-upgrade authority
 * 
 * Goal: Make authority boundaries visible and predictable.
 */

import type { SeatAiConfigValidationResult } from "./seatAiConfigValidation.js";

/**
 * Policy failure reason codes.
 * These represent governance boundaries, not errors.
 */
export type AiConfigFailureReason =
  | "MANUAL_MODE_NO_PRESET_ALLOWED"
  | "AI_MODE_PRESET_REQUIRED"
  | "PRESET_CAPABILITY_NOT_ALLOWED";

/**
 * AI configuration policy failure.
 * 
 * This represents a governance boundary violation, not an exceptional error.
 * The system should gracefully refuse LLM invocation and fall back to manual control.
 */
export type AiConfigFailure = {
  /**
   * Indicates this is a policy failure (not success).
   */
  readonly type: "AI_CONFIG_FAILURE";

  /**
   * Structured reason code for programmatic handling.
   */
  readonly reason: AiConfigFailureReason;

  /**
   * Human-readable message explaining the policy boundary.
   * Suitable for display to users.
   */
  readonly message: string;

  /**
   * Whether LLM invocation should be refused.
   * Always true for failures.
   */
  readonly refuseLlmInvocation: true;

  /**
   * Whether manual control fallback is allowed.
   * Always true - policy failures should not block the hand.
   */
  readonly allowManualFallback: true;
};

/**
 * Success state - configuration is valid and LLM invocation is permitted.
 */
export type AiConfigSuccess = {
  /**
   * Indicates this is a success (not a failure).
   */
  readonly type: "AI_CONFIG_SUCCESS";

  /**
   * Whether LLM invocation is permitted.
   * Always true for success.
   */
  readonly permitLlmInvocation: true;
};

/**
 * Result of AI configuration check.
 * 
 * Either success (permit LLM) or failure (refuse LLM, allow manual fallback).
 */
export type AiConfigResult = AiConfigSuccess | AiConfigFailure;

/**
 * Convert validation result to failure semantics.
 * 
 * This transforms a validation result into the governance failure semantics
 * that the system should use for policy enforcement.
 * 
 * @param validationResult - The validation result to convert
 * @returns AI configuration result with proper failure semantics
 */
export function toAiConfigResult(
  validationResult: SeatAiConfigValidationResult
): AiConfigResult {
  if (validationResult.ok) {
    return {
      type: "AI_CONFIG_SUCCESS",
      permitLlmInvocation: true,
    };
  }

  // Map validation reasons to human-readable messages
  const failureMessages: Record<AiConfigFailureReason, string> = {
    MANUAL_MODE_NO_PRESET_ALLOWED:
      "AI is disabled for this seat. Manual mode does not allow model selection.",
    AI_MODE_PRESET_REQUIRED:
      "A model must be selected for AI mode. Please configure a model preset.",
    PRESET_CAPABILITY_NOT_ALLOWED:
      "Selected model exceeds the authority allowed by this seat's AI mode.",
  };

  return {
    type: "AI_CONFIG_FAILURE",
    reason: validationResult.reason,
    message: failureMessages[validationResult.reason] || validationResult.message,
    refuseLlmInvocation: true,
    allowManualFallback: true,
  };
}

/**
 * Check if a result represents a policy failure.
 * 
 * @param result - The AI configuration result to check
 * @returns true if this is a failure, false if success
 */
export function isAiConfigFailure(
  result: AiConfigResult
): result is AiConfigFailure {
  return result.type === "AI_CONFIG_FAILURE";
}

/**
 * Check if a result permits LLM invocation.
 * 
 * @param result - The AI configuration result to check
 * @returns true if LLM invocation is permitted, false otherwise
 */
export function isLlmInvocationPermitted(result: AiConfigResult): boolean {
  return result.type === "AI_CONFIG_SUCCESS";
}

/**
 * Get human-readable failure message if result is a failure.
 * 
 * @param result - The AI configuration result
 * @returns Failure message if result is a failure, undefined otherwise
 */
export function getFailureMessage(
  result: AiConfigResult
): string | undefined {
  return isAiConfigFailure(result) ? result.message : undefined;
}

