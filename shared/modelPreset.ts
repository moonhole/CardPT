/**
 * ModelPreset - Curated, system-approved model option abstraction
 * 
 * A ModelPreset is not a raw model. It binds:
 * - a provider (routing only)
 * - a concrete model identifier (adapter only)
 * - exactly one CapabilityBucket (authority)
 * 
 * Conceptual Rules:
 * - CapabilityBucket determines authority
 * - Model strength only affects stability
 * - All business logic must go through CapabilityBucket
 * - UI-only flags never influence permission or gating
 * 
 * Hard Constraints:
 * - No runtime mutation
 * - No dynamic registration
 * - Flags must never influence permission or gating
 */

import { CapabilityLevel } from "./capability.js";

/**
 * UI-only flags for display purposes.
 * These flags must NEVER influence permission checks or gating logic.
 */
export type ModelPresetUIFlags = {
  /**
   * Mark as experimental for UI display only
   */
  experimental?: boolean;

  /**
   * Mark as agent-style for UI display only
   */
  agentStyle?: boolean;

  /**
   * Additional UI-only metadata (display only)
   */
  [key: string]: unknown;
};

/**
 * ModelPreset represents a curated, system-approved model option.
 * 
 * All business logic must reason about CapabilityBucket, not model names.
 * Provider and model name are for routing/adapter purposes only.
 */
export type ModelPreset = {
  /**
   * Globally unique preset identifier (stable, human-readable)
   * Used for referencing presets in configuration
   */
  readonly id: string;

  /**
   * Display name for UI presentation only
   */
  readonly displayName: string;

  /**
   * Provider identifier for routing purposes only
   * Examples: "dashscope", "openai", "anthropic"
   */
  readonly provider: string;

  /**
   * Concrete model name/identifier for adapter purposes only
   * Examples: "qwen-plus", "gpt-4", "claude-3-opus"
   */
  readonly modelName: string;

  /**
   * CapabilityBucket - the ONLY source of authority
   * All permission checks must depend on this field
   */
  readonly capability: CapabilityLevel;

  /**
   * UI-only flags for display purposes
   * These flags must NEVER influence permission checks or gating logic
   */
  readonly uiFlags?: ModelPresetUIFlags;
};

