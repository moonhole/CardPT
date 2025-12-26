/**
 * DeepSeek Provider Adapter
 * 
 * Implements transport to DeepSeek API.
 * 
 * Supported Models (from ModelPresets):
 * - "v3.2" (deepseek-v3.2)
 * 
 * Important Context:
 * - DeepSeek output is generally well-structured
 * - DeepSeek exhibits less agent-like behavior
 * - However, the adapter must treat it identically to other providers
 * - No reliance on its "stability" - same error handling as other adapters
 * - DeepSeek serves as a control group to validate adapter uniformity
 * 
 * Hard Constraints:
 * - Treat identically to other providers (Qwen, Doubao)
 * - No special handling based on assumed stability
 * - No reduced error handling
 * - No side effects
 * - No shared mutable state
 * - No provider-specific types exposed
 */

import type { ProviderAdapter } from "../providerAdapter.js";

/**
 * DeepSeek adapter implementation.
 * 
 * Stateless adapter - can be reused across invocations.
 * This adapter treats DeepSeek identically to other providers.
 * Despite DeepSeek's generally well-structured output, the adapter
 * does not assume stability or reduce error handling.
 */
export class DeepSeekAdapter implements ProviderAdapter {
  /**
   * Base URL for DeepSeek API.
   * 
   * DeepSeek uses OpenAI-compatible format.
   */
  private readonly baseUrl = "https://api.deepseek.com/chat/completions";

  /**
   * Invoke DeepSeek API.
   * 
   * This adapter treats DeepSeek identically to other providers.
   * No special handling, no assumptions about stability.
   * 
   * @param provider - Provider identifier (must be "deepseek")
   * @param modelName - Model name: "v3.2"
   * @param prompt - Full prompt payload (already constructed by gateway)
   * @param apiKey - DeepSeek API key
   * @returns Raw text content from model response
   * @throws Error if invocation fails
   */
  async invoke(
    provider: string,
    modelName: string,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    // Build provider-specific request body
    // The prompt is already fully constructed by the gateway
    // Send it verbatim - same as other adapters
    const requestBody = {
      model: modelName,
      messages: [
        {
          role: "user" as const,
          content: prompt,
        },
      ],
    };

    // Make HTTP request
    // Same error handling as other adapters - no reduced handling
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      // Network-level errors - same handling as other adapters
      throw new Error(
        `Network error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Read response body
    // Same parsing logic as other adapters
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      // Response body is not valid JSON - same error handling
      throw new Error(
        `Failed to parse response body: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Check HTTP status
    // Same error handling as other adapters - no assumptions about stability
    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      throw new Error(`HTTP error: ${response.status} ${statusText}`);
    }

    // Extract raw text content from provider response
    // Same extraction logic as other adapters
    // Adapter does NOT validate structure - just extracts text if present
    const content = extractTextFromDeepSeekResponse(responseBody);

    if (content === null) {
      throw new Error("Response does not contain text content");
    }

    // Return raw output - same as other adapters
    return content;
  }
}

/**
 * Extract raw text from DeepSeek response.
 * 
 * This function uses the exact same extraction pattern as other adapters.
 * No special handling based on assumed stability.
 * 
 * Response format (OpenAI-compatible):
 * {
 *   choices: [
 *     {
 *       message: {
 *         content: "..." // raw text here
 *       }
 *     }
 *   ]
 * }
 * 
 * Returns null if text cannot be extracted.
 * Does NOT validate response structure beyond extraction.
 */
function extractTextFromDeepSeekResponse(responseBody: unknown): string | null {
  // Same extraction pattern as Qwen and Doubao adapters
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "choices" in responseBody &&
    Array.isArray(responseBody.choices) &&
    responseBody.choices.length > 0
  ) {
    const firstChoice = responseBody.choices[0];
    if (
      typeof firstChoice === "object" &&
      firstChoice !== null &&
      "message" in firstChoice
    ) {
      const message = firstChoice.message;
      if (
        typeof message === "object" &&
        message !== null &&
        "content" in message &&
        typeof message.content === "string"
      ) {
        return message.content;
      }
    }
  }
  return null;
}

