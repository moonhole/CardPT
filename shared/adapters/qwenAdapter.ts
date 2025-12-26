/**
 * Qwen Provider Adapter - Reference Implementation
 * 
 * This is the baseline adapter implementation for Qwen (DashScope) provider.
 * Other adapters should match this pattern and behavior.
 * 
 * Supported Models (from ModelPresets):
 * - "flash" (qwen-flash)
 * - "plus" (qwen-plus)
 * - "max" (qwen-max)
 * 
 * API Format:
 * - Endpoint: DashScope OpenAI-compatible mode
 * - URL: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 * - Request: OpenAI-compatible chat completions format
 * - Response: OpenAI-compatible format with choices[0].message.content
 * 
 * Hard Constraints:
 * - No side effects
 * - No shared mutable state
 * - No provider-specific types exposed
 * - Preserve current behavior exactly
 * - Do NOT "improve" prompts or add retries
 */

import type { ProviderAdapter } from "../providerAdapter.js";

/**
 * Qwen adapter implementation.
 * 
 * Stateless adapter - can be reused across invocations.
 * This is the reference implementation that other adapters should follow.
 */
export class QwenAdapter implements ProviderAdapter {
  /**
   * Base URL for DashScope API (OpenAI-compatible mode).
   * 
   * This matches the original implementation exactly.
   */
  private readonly baseUrl =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  /**
   * Invoke Qwen/DashScope API.
   * 
   * @param provider - Provider identifier (must be "qwen")
   * @param modelName - Model name: "flash", "plus", or "max"
   * @param prompt - Full prompt payload (already constructed by gateway)
   * @param apiKey - DashScope API key
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
    // Send it as a single user message (gateway handles system instruction)
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
    // Preserve original error handling behavior
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
      // Network-level errors
      throw new Error(
        `Network error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Read response body
    // Preserve original parsing behavior
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      // Response body is not valid JSON
      throw new Error(
        `Failed to parse response body: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Check HTTP status
    // Preserve original error handling
    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      throw new Error(`HTTP error: ${response.status} ${statusText}`);
    }

    // Extract raw text content from provider response
    // Adapter does NOT validate structure - just extracts text if present
    // This matches the original extraction logic exactly
    const content = extractTextFromQwenResponse(responseBody);

    if (content === null) {
      throw new Error("Response does not contain text content");
    }

    return content;
  }
}

/**
 * Extract raw text from Qwen/DashScope response.
 * 
 * This function preserves the exact extraction logic from the original implementation.
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
function extractTextFromQwenResponse(responseBody: unknown): string | null {
  // Match original extraction pattern exactly
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
