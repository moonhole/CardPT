/**
 * Capability Bucket - System-wide authority source for LLM permissions
 * 
 * This is the single source of truth for AI authority in the system.
 * All future permission checks must depend on this abstraction only.
 * 
 * Hard constraints:
 * - No model names, providers, or vendors
 * - No logic
 * - No extensibility hooks (no custom levels, no plugins)
 * - Immutable at runtime
 */

export const CAPABILITY_LEVEL = {
  L1_BASIC: "L1_BASIC",
  L2_STANDARD: "L2_STANDARD",
  L3_EXPERIMENTAL: "L3_EXPERIMENTAL",
} as const;

export type CapabilityLevel =
  | typeof CAPABILITY_LEVEL.L1_BASIC
  | typeof CAPABILITY_LEVEL.L2_STANDARD
  | typeof CAPABILITY_LEVEL.L3_EXPERIMENTAL;

