/**
 * Doubao Provider Adapter
 * 
 * Implements transport to Doubao API.
 * 
 * Supported Models (from ModelPresets):
 * - "seed-1.6-lite" (doubao-seed-1.6-lite)
 * - "seed-1.8" (doubao-seed-1.8) - Agent-style model
 * 
 * Important Context:
 * - Some Doubao models (e.g., seed-1.8) are agent-oriented and may attempt overreach
 * - The adapter must remain neutral - it is a "dumb wire"
 * - Any agent behavior must be handled by the Gateway, not the adapter
 * 
 * Hard Constraints:
 * - Pass prompt verbatim (no modification)
 * - Return raw output verbatim (no interpretation)
 * - Do NOT interpret tool calls or agent instructions
 * - No special casing for "agent-style" models
 * - No attempt to "help" the model behave better
 * - No side effects
 * - No shared mutable state
 * - No provider-specific types exposed
 */

import type { ProviderAdapter } from "../providerAdapter.js";

/**
 * Doubao adapter implementation.
 * 
 * Stateless adapter - can be reused across invocations.
 * This adapter is completely neutral - it does not distinguish between
 * agent-style and non-agent-style models. All models are treated identically.
 */
export class DoubaoAdapter implements ProviderAdapter {
  /**
   * Base URL for Doubao API.
   * 
   * Note: This assumes OpenAI-compatible format. If Doubao uses a different
   * format, this endpoint should be updated accordingly.
   */
  private readonly baseUrl =
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

  /**
   * Invoke Doubao API.
   * 
   * This adapter is completely neutral - it does not care if the model
   * is agent-style or not. It simply transports the prompt and returns
   * the raw response.
   * 
   * @param provider - Provider identifier (must be "doubao")
   * @param modelName - Model name: "seed-1.6-lite" or "seed-1.8"
   * @param prompt - Full prompt payload (already constructed by gateway)
   * @param apiKey - Doubao API key
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
    // Send it verbatim - no modification, no interpretation
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
    // No special handling for agent-style models
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
    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      throw new Error(`HTTP error: ${response.status} ${statusText}`);
    }

    // Extract raw text content from provider response
    // Adapter does NOT validate structure - just extracts text if present
    // Adapter does NOT interpret tool calls, agent instructions, or any other content
    // It returns whatever text is in the response, verbatim
    const content = extractTextFromDoubaoResponse(responseBody);

    if (content === null) {
      throw new Error("Response does not contain text content");
    }

    // Return raw output verbatim - no interpretation, no filtering
    return content;
  }
}

/**
 * Extract raw text from Doubao response.
 * 
 * This function extracts text content from the response structure.
 * It does NOT interpret:
 * - Tool calls
 * - Agent instructions
 * - Function invocations
 * - Any structured content
 * 
 * It simply extracts the text content field and returns it verbatim.
 * 
 * Response format (assumed OpenAI-compatible):
 * {
 *   choices: [
 *     {
 *       message: {
 *         content: "..." // raw text here (may contain tool calls, agent instructions, etc.)
 *       }
 *     }
 *   ]
 * }
 * 
 * Returns null if text cannot be extracted.
 * Does NOT validate response structure beyond extraction.
 */
function extractTextFromDoubaoResponse(responseBody: unknown): string | null {
  // Extract text content - no interpretation, no filtering
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
        // Return content verbatim - even if it contains tool calls or agent instructions
        // The Gateway layer will handle interpretation, not the adapter
        return message.content;
      }
    }
  }
  return null;
}

