/**
 * ModelPreset Registry - CardPT v0.5 Frozen Preset Set
 * 
 * This registry is HARD-CODED and READ-ONLY.
 * It cannot be configured via UI or runtime input.
 * 
 * To add a new model preset, you MUST edit this file directly.
 * 
 * Goal: Prevent "192-model chaos" by enforcing a small, opinionated preset set.
 * 
 * ACCESS CONTROL:
 * - Business logic must NOT import the preset list directly
 * - Business logic must NOT iterate presets ad-hoc
 * - Use the minimal registry interface: getPresetById() and getAllPresets()
 * - No mutation APIs are provided
 * - No filtering by provider is allowed (prevents business logic coupling)
 */

import { CAPABILITY_LEVEL } from "./capability.js";
import type { ModelPreset } from "./modelPreset.js";

/**
 * Internal frozen registry of all system-approved ModelPresets for CardPT v0.5.
 * 
 * DO NOT EXPORT THIS DIRECTLY.
 * Use the registry interface functions instead: getPresetById() and getAllPresets()
 * 
 * This array is readonly and must not be mutated at runtime.
 * All presets are defined at compile time.
 */
const MODEL_PRESET_REGISTRY: readonly ModelPreset[] = [
  // Qwen presets
  {
    id: "qwen-flash",
    displayName: "Qwen Flash",
    provider: "qwen",
    modelName: "qwen-turbo",
    capability: CAPABILITY_LEVEL.L1_BASIC,
  },
  {
    id: "qwen-plus",
    displayName: "Qwen Plus",
    provider: "qwen",
    modelName: "qwen-plus",
    capability: CAPABILITY_LEVEL.L2_STANDARD,
  },
  {
    id: "qwen-max",
    displayName: "Qwen Max",
    provider: "qwen",
    modelName: "qwen-max",
    capability: CAPABILITY_LEVEL.L3_EXPERIMENTAL,
  },

  // Doubao presets
  // Model IDs from Volcengine official model list
  {
    id: "doubao-seed-1.6-lite",
    displayName: "Doubao Seed 1.6 Lite",
    provider: "doubao",
    modelName: "ep-20251226202334-45f5l",
    capability: CAPABILITY_LEVEL.L1_BASIC,
  },
  {
    id: "doubao-seed-1.8",
    displayName: "Doubao Seed 1.6",
    provider: "doubao",
    modelName: "ep-20251226202046-b6svb",
    capability: CAPABILITY_LEVEL.L3_EXPERIMENTAL,
    uiFlags: {
      experimental: true,
      agentStyle: true,
    },
  },

  // DeepSeek presets
  {
    id: "deepseek-v3.2",
    displayName: "DeepSeek V3",
    provider: "deepseek",
    modelName: "ep-20251226201345-bb46w",
    capability: CAPABILITY_LEVEL.L2_STANDARD,
  },

  // Gemini presets
  {
    id: "gemini-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "gemini",
    modelName: "2.5-flash",
    capability: CAPABILITY_LEVEL.L1_BASIC,
  },
  {
    id: "gemini-pro",
    displayName: "Gemini 3 Flash Preview",
    provider: "gemini",
    modelName: "3-flash-preview",
    capability: CAPABILITY_LEVEL.L2_STANDARD,
  },
] as const;

/**
 * Minimal Registry Interface
 * 
 * This is the ONLY access path to ModelPresets for business logic.
 * 
 * Hard Constraints:
 * - No mutation APIs
 * - No filtering by provider (prevents business logic coupling)
 * - No ad-hoc iteration (use getAllPresets() instead)
 */

/**
 * Lookup a preset by its unique identifier.
 * 
 * @param id - The preset identifier (e.g., "qwen-plus")
 * @returns The ModelPreset if found, undefined otherwise
 */
export function getPresetById(id: string): ModelPreset | undefined {
  return MODEL_PRESET_REGISTRY.find((preset) => preset.id === id);
}

/**
 * Get all presets in the registry (read-only).
 * 
 * Returns a readonly array of all system-approved ModelPresets.
 * Business logic should use this instead of importing the registry directly.
 * 
 * @returns Readonly array of all ModelPresets
 */
export function getAllPresets(): readonly ModelPreset[] {
  return MODEL_PRESET_REGISTRY;
}

