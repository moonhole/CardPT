/**
 * Provider Adapter Registry
 * 
 * Maps provider identifiers to adapter implementations.
 * 
 * Hard Constraints:
 * - Adapters are stateless and can be reused
 * - Registry is read-only (no runtime registration)
 * - Each provider has exactly one adapter
 * - No shared mutable state
 */

import type { ProviderAdapter } from "../providerAdapter.js";
import { QwenAdapter } from "./qwenAdapter.js";
import { DoubaoAdapter } from "./doubaoAdapter.js";
import { DeepSeekAdapter } from "./deepseekAdapter.js";
import { GeminiAdapter } from "./geminiAdapter.js";

/**
 * Get adapter for a provider.
 * 
 * @param provider - Provider identifier (e.g., "qwen", "doubao", "deepseek", "gemini")
 * @returns Adapter instance, or undefined if provider not supported
 */
export function getAdapterForProvider(
  provider: string
): ProviderAdapter | undefined {
  switch (provider) {
    case "qwen":
      return new QwenAdapter();
    case "doubao":
      return new DoubaoAdapter();
    case "deepseek":
      return new DeepSeekAdapter();
    case "gemini":
      return new GeminiAdapter();
    default:
      return undefined;
  }
}

/**
 * Check if a provider has an adapter available.
 * 
 * @param provider - Provider identifier
 * @returns true if adapter exists, false otherwise
 */
export function hasAdapterForProvider(provider: string): boolean {
  return getAdapterForProvider(provider) !== undefined;
}
