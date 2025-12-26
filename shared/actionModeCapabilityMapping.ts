/**
 * ActionMode → CapabilityBucket Permission Mapping
 * 
 * This is the CORE RULE that defines which CapabilityBuckets are allowed
 * for each ActionMode. This mapping prevents accidentally granting more
 * authority than intended by switching models.
 * 
 * Required Mapping:
 * - manual: No CapabilityBucket allowed (LLM invocation forbidden)
 * - ai_basic: Allowed buckets: L1_BASIC only
 * - ai_standard: Allowed buckets: L1_BASIC, L2_STANDARD
 * - ai_experimental: Allowed buckets: L1_BASIC, L2_STANDARD, L3_EXPERIMENTAL
 * 
 * Hard Constraints:
 * - This mapping must be explicit and hard-coded
 * - No inference based on model strength
 * - No dynamic overrides
 * 
 * Goal: Make it impossible to "accidentally" grant more authority by switching models.
 */

import { ACTION_MODE, type ActionMode } from "./actionMode.js";
import { CAPABILITY_LEVEL, type CapabilityLevel } from "./capability.js";

/**
 * Explicit mapping of ActionMode to allowed CapabilityBuckets.
 * 
 * This is HARD-CODED and must not be modified without careful review.
 * Changing this mapping affects security boundaries.
 */
const ACTION_MODE_ALLOWED_CAPABILITIES: Readonly<
  Record<ActionMode, readonly CapabilityLevel[]>
> = {
  /**
   * manual: No LLM invocation allowed.
   * Empty array means no CapabilityBucket is permitted.
   */
  [ACTION_MODE.MANUAL]: [],

  /**
   * ai_basic: Only L1_BASIC capability allowed.
   * Policy intent: Minimal authority only.
   */
  [ACTION_MODE.AI_BASIC]: [CAPABILITY_LEVEL.L1_BASIC],

  /**
   * ai_standard: L1_BASIC and L2_STANDARD capabilities allowed.
   * Policy intent: Standard authority, but not experimental.
   */
  [ACTION_MODE.AI_STANDARD]: [
    CAPABILITY_LEVEL.L1_BASIC,
    CAPABILITY_LEVEL.L2_STANDARD,
  ],

  /**
   * ai_experimental: All capabilities allowed.
   * Policy intent: Full authority including experimental features.
   */
  [ACTION_MODE.AI_EXPERIMENTAL]: [
    CAPABILITY_LEVEL.L1_BASIC,
    CAPABILITY_LEVEL.L2_STANDARD,
    CAPABILITY_LEVEL.L3_EXPERIMENTAL,
  ],
} as const;

/**
 * Check if a CapabilityBucket is allowed for a given ActionMode.
 * 
 * This is the primary permission check function.
 * All authorization logic must use this function.
 * 
 * @param actionMode - The ActionMode to check
 * @param capability - The CapabilityBucket to verify
 * @returns true if the CapabilityBucket is allowed for the ActionMode, false otherwise
 */
export function isCapabilityAllowedForActionMode(
  actionMode: ActionMode,
  capability: CapabilityLevel
): boolean {
  const allowedCapabilities = ACTION_MODE_ALLOWED_CAPABILITIES[actionMode];
  return allowedCapabilities.includes(capability);
}

/**
 * Get all allowed CapabilityBuckets for a given ActionMode.
 * 
 * @param actionMode - The ActionMode to query
 * @returns Readonly array of allowed CapabilityBuckets (empty array if none allowed)
 */
export function getAllowedCapabilitiesForActionMode(
  actionMode: ActionMode
): readonly CapabilityLevel[] {
  return ACTION_MODE_ALLOWED_CAPABILITIES[actionMode];
}

/**
 * Check if an ActionMode allows any LLM invocation.
 * 
 * @param actionMode - The ActionMode to check
 * @returns true if LLM invocation is allowed, false if manual-only
 */
export function isLlmInvocationAllowed(actionMode: ActionMode): boolean {
  return ACTION_MODE_ALLOWED_CAPABILITIES[actionMode].length > 0;
}

