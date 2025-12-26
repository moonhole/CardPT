/**
 * Provider Adapter Layer - Phase 4
 * 
 * Adapters are "dumb wires" - they only handle transport, not intelligence.
 * 
 * Adapter Responsibility:
 * - Translate normalized request → provider-specific HTTP call
 * - Return raw textual output from provider
 * 
 * Adapter Must NOT:
 * - Parse JSON
 * - Validate schema
 * - Enforce game rules
 * - Retry requests
 * - Fallback to other providers
 * - Swallow errors
 * - Perform agent-style reasoning
 * - Modify prompts
 * 
 * Error Handling:
 * - Network/HTTP/auth errors: Propagate as structured failures
 * - Do NOT retry
 * - Do NOT fallback to other providers
 * - Do NOT swallow errors
 * - Adapters report failure; policy decides recovery
 * 
 * Hard Constraints:
 * - No provider-specific types exposed to callers
 * - No side effects
 * - No shared mutable state
 * 
 * Goal: Provider diversity must not leak into business logic.
 * Make all providers interchangeable from the Gateway's perspective.
 */

/**
 * Unified Provider Adapter Interface
 * 
 * System-level contract that all adapters must implement.
 * 
 * Input:
 * - provider identifier (string)
 * - concrete model name (string)
 * - full prompt payload (string, already constructed)
 * - apiKey (string, opaque)
 * 
 * Output:
 * - raw text content produced by the model (string)
 * 
 * Errors are communicated via thrown exceptions.
 * No provider-specific types are exposed to callers.
 */
export interface ProviderAdapter {
  /**
   * Invoke the LLM provider.
   * 
   * @param provider - Provider identifier (e.g., "qwen", "doubao", "deepseek", "gemini")
   * @param modelName - Concrete model name/identifier (e.g., "plus", "max", "flash")
   * @param prompt - Full prompt payload (already constructed, ready to send)
   * @param apiKey - API key (opaque string)
   * @returns Raw textual output from the model
   * @throws Error if invocation fails (network error, HTTP error, etc.)
   */
  invoke(
    provider: string,
    modelName: string,
    prompt: string,
    apiKey: string
  ): Promise<string>;
}
