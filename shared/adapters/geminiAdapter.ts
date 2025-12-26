/**
 * Gemini Provider Adapter
 * 
 * Implements transport to Google Gemini API.
 * 
 * Supported Models (from ModelPresets):
 * - "flash" (gemini-flash)
 * - "pro" (gemini-pro)
 * 
 * Important Context:
 * - Gemini uses a different API format than OpenAI-compatible providers
 * - This adapter validates that the unified interface works across different API styles
 * - All Gemini-specific details are contained within this adapter
 * - No Gemini-specific abstractions leak upstream
 * 
 * Hard Constraints:
 * - Normalize output to raw text only
 * - Do not introduce Gemini-specific abstractions upstream
 * - All Gemini API details stay in this adapter
 * - No side effects
 * - No shared mutable state
 * - No provider-specific types exposed
 * 
 * Goal: Prove that provider heterogeneity does not affect system design.
 */

import type { ProviderAdapter } from "../providerAdapter.js";

/**
 * Gemini adapter implementation.
 * 
 * Stateless adapter - can be reused across invocations.
 * This adapter normalizes Gemini's different API format to the unified interface.
 * All Gemini-specific details are contained here - nothing leaks upstream.
 */
export class GeminiAdapter implements ProviderAdapter {
  /**
   * Base URL for Gemini API.
   * 
   * Gemini uses a different endpoint format than OpenAI-compatible providers.
   * The model name is embedded in the URL path.
   */
  private readonly baseUrlTemplate =
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

  /**
   * Invoke Gemini API.
   * 
   * This adapter normalizes Gemini's API format to the unified interface.
   * All Gemini-specific details (request format, response parsing) are handled here.
   * 
   * @param provider - Provider identifier (must be "gemini")
   * @param modelName - Model name: "flash" or "pro"
   * @param prompt - Full prompt payload (already constructed by gateway)
   * @param apiKey - Gemini API key
   * @returns Raw text content from model response
   * @throws Error if invocation fails
   */
  async invoke(
    provider: string,
    modelName: string,
    prompt: string,
    apiKey: string
  ): Promise<string> {
    // Build Gemini-specific request body
    // Gemini uses a different format: contents array with parts
    // This is normalized from the unified interface (prompt string)
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    // Construct Gemini-specific endpoint URL
    // Model name is embedded in the URL path
    const modelId = `gemini-${modelName}`;
    const url = this.baseUrlTemplate.replace("{model}", modelId);

    // Make HTTP request
    // Same error handling pattern as other adapters
    let response: Response;
    try {
      response = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: {
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
    // Same error handling as other adapters
    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      throw new Error(`HTTP error: ${response.status} ${statusText}`);
    }

    // Extract raw text content from Gemini response
    // Gemini uses a different response structure: candidates[0].content.parts[0].text
    // This is normalized to raw text string - same output as other adapters
    const content = extractTextFromGeminiResponse(responseBody);

    if (content === null) {
      throw new Error("Response does not contain text content");
    }

    // Return raw text - normalized output, same as other adapters
    return content;
  }
}

/**
 * Extract raw text from Gemini response.
 * 
 * This function normalizes Gemini's different response format to raw text.
 * All Gemini-specific parsing is contained here - nothing leaks upstream.
 * 
 * Response format (Gemini-specific):
 * {
 *   candidates: [
 *     {
 *       content: {
 *         parts: [
 *           {
 *             text: "..." // raw text here
 *           }
 *         ]
 *       }
 *     }
 *   ]
 * }
 * 
 * Returns null if text cannot be extracted.
 * Does NOT validate response structure beyond extraction.
 */
function extractTextFromGeminiResponse(responseBody: unknown): string | null {
  // Extract text from Gemini's response structure
  // Normalize to raw text string - same output format as other adapters
  if (
    typeof responseBody === "object" &&
    responseBody !== null &&
    "candidates" in responseBody &&
    Array.isArray(responseBody.candidates) &&
    responseBody.candidates.length > 0
  ) {
    const firstCandidate = responseBody.candidates[0];
    if (
      typeof firstCandidate === "object" &&
      firstCandidate !== null &&
      "content" in firstCandidate
    ) {
      const content = firstCandidate.content;
      if (
        typeof content === "object" &&
        content !== null &&
        "parts" in content &&
        Array.isArray(content.parts) &&
        content.parts.length > 0
      ) {
        const firstPart = content.parts[0];
        if (
          typeof firstPart === "object" &&
          firstPart !== null &&
          "text" in firstPart &&
          typeof firstPart.text === "string"
        ) {
          // Return raw text - normalized output
          return firstPart.text;
        }
      }
    }
  }
  return null;
}

