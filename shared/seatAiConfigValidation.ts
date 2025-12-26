/**
 * Seat AI Configuration Validation
 * 
 * BACKEND VALIDATION IS AUTHORITATIVE.
 * 
 * This validation step checks whether a seat's AI configuration is permitted
 * BEFORE any LLM invocation occurs. Invalid configurations never reach the
 * decision pipeline.
 * 
 * UI/Backend Consistency Principle:
 * - Backend validation is AUTHORITATIVE - it must reject invalid configurations
 * - UI validation is ADVISORY - it may prevent invalid selections for UX
 * - Backend NEVER trusts UI validation
 * - Backend MUST validate regardless of UI behavior
 * 
 * Validation Rules:
 * - If actionMode is manual: Any selected ModelPreset is invalid. LLM invocation must be skipped entirely.
 * - If actionMode is AI-based: A ModelPreset must be selected. The preset's CapabilityBucket must be allowed by the ActionMode.
 * 
 * Hard Constraints:
 * - This validation happens BEFORE building decision input
 * - This validation happens BEFORE calling LLM
 * - Do NOT rely on LLM errors as a safety net
 * - Do NOT trust UI validation - backend must always validate
 * 
 * Goal: Invalid configurations never reach the decision pipeline.
 */

import { ACTION_MODE, type ActionMode } from "./actionMode.js";
import type { ModelPreset } from "./modelPreset.js";
import { isCapabilityAllowedForActionMode } from "./actionModeCapabilityMapping.js";
import { toAiConfigResult, type AiConfigResult } from "./aiConfigFailure.js";

/**
 * Seat AI configuration input for validation.
 */
export type SeatAiConfig = {
  /**
   * The ActionMode for this seat.
   */
  actionMode: ActionMode;

  /**
   * The selected ModelPreset (optional if manual mode).
   * Must be provided for AI-based modes.
   */
  selectedPreset?: ModelPreset | null;
};

/**
 * Validation result indicating whether the configuration is valid.
 */
export type SeatAiConfigValidationResult =
  | {
      /**
       * Configuration is valid and LLM invocation is permitted.
       */
      ok: true;
    }
  | {
      /**
       * Configuration is invalid with a structured reason.
       */
      ok: false;
      reason:
        | "MANUAL_MODE_NO_PRESET_ALLOWED"
        | "AI_MODE_PRESET_REQUIRED"
        | "PRESET_CAPABILITY_NOT_ALLOWED";
      /**
       * Human-readable message describing the validation failure.
       */
      message: string;
    };

/**
 * Validate seat AI configuration before LLM invocation.
 * 
 * BACKEND AUTHORITATIVE VALIDATION.
 * 
 * This function MUST be called in backend code before:
 * - Building decision input
 * - Calling LLM
 * 
 * This is the authoritative validation that enforces security boundaries.
 * UI validation is advisory only and cannot be trusted.
 * 
 * @param config - The seat AI configuration to validate
 * @returns Validation result with ok status and optional error reason
 */
export function validateSeatAiConfig(
  config: SeatAiConfig
): SeatAiConfigValidationResult {
  const { actionMode, selectedPreset } = config;

  // Rule 1: If actionMode is manual, no preset is allowed
  if (actionMode === ACTION_MODE.MANUAL) {
    if (selectedPreset !== null && selectedPreset !== undefined) {
      return {
        ok: false,
        reason: "MANUAL_MODE_NO_PRESET_ALLOWED",
        message:
          "Manual mode does not allow ModelPreset selection. LLM invocation is forbidden.",
      };
    }
    // Manual mode with no preset is valid (human-only)
    return { ok: true };
  }

  // Rule 2: If actionMode is AI-based, a preset must be selected
  if (!selectedPreset) {
    return {
      ok: false,
      reason: "AI_MODE_PRESET_REQUIRED",
      message: `ActionMode '${actionMode}' requires a ModelPreset to be selected.`,
    };
  }

  // Rule 3: The preset's CapabilityBucket must be allowed by the ActionMode
  const presetCapability = selectedPreset.capability;
  const isAllowed = isCapabilityAllowedForActionMode(
    actionMode,
    presetCapability
  );

  if (!isAllowed) {
    return {
      ok: false,
      reason: "PRESET_CAPABILITY_NOT_ALLOWED",
      message: `ModelPreset '${selectedPreset.id}' with capability '${presetCapability}' is not allowed for ActionMode '${actionMode}'.`,
    };
  }

  // All validation rules passed
  return { ok: true };
}

/**
 * Check if LLM invocation is permitted for a seat configuration.
 * 
 * This is a convenience function that combines validation with LLM permission check.
 * Note: Manual mode always returns false, even if configuration is valid.
 * 
 * @param config - The seat AI configuration to check
 * @returns true if LLM invocation is permitted, false otherwise
 */
export function isLlmInvocationPermitted(
  config: SeatAiConfig
): boolean {
  // Manual mode never permits LLM invocation
  if (config.actionMode === ACTION_MODE.MANUAL) {
    return false;
  }

  // For AI modes, check if configuration is valid
  const validation = validateSeatAiConfig(config);
  return validation.ok;
}

/**
 * Validate seat AI configuration and return governance failure semantics.
 * 
 * BACKEND AUTHORITATIVE VALIDATION WITH FAILURE SEMANTICS.
 * 
 * This function combines validation with failure semantics, ensuring that
 * policy failures are represented as governance boundaries, not exceptions.
 * 
 * This is the recommended function for backend code that needs to:
 * - Enforce security boundaries authoritatively
 * - Provide human-readable failure messages
 * - Handle policy failures gracefully (no throwing)
 * 
 * @param config - The seat AI configuration to validate
 * @returns AI configuration result with proper failure semantics
 */
export function validateSeatAiConfigWithFailureSemantics(
  config: SeatAiConfig
): AiConfigResult {
  const validation = validateSeatAiConfig(config);
  return toAiConfigResult(validation);
}

