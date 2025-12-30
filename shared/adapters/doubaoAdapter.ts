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
   * According to Volcengine documentation, Doubao uses Responses API:
   * - Base: https://ark.cn-beijing.volces.com/api/v3
   * - Endpoint: /responses (not /chat/completions)
   * - Request format: { model: "...", input: "..." }
   */
  private readonly baseUrl =
    "https://ark.cn-beijing.volces.com/api/v3/responses";

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
    // Use model name directly without mapping
    // For single application scenarios, Doubao accepts standard model names
    const fullModelId = modelName;

    // Build Doubao Responses API request body
    // Format: { model: "...", input: "..." }
    // The prompt is already fully constructed by the gateway
    // Send it verbatim - no modification, no interpretation
    const requestBody = {
      model: fullModelId,
      input: prompt,
    };

    // Make HTTP request
    // No special handling for agent-style models
    // Note: fetch follows redirects by default (like curl --location)
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        redirect: "follow", // Explicitly follow redirects (default behavior)
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

    console.log("[DEBUG] Doubao raw response:", JSON.stringify(responseBody, null, 2));

    // Check HTTP status
    if (!response.ok) {
      const statusText = response.statusText || "Unknown";
      // Try to extract error details from response body
      let errorDetails = "";
      if (responseBody && typeof responseBody === "object") {
        if ("error" in responseBody) {
          const error = (responseBody as { error?: unknown }).error;
          if (error && typeof error === "object" && "message" in error) {
            errorDetails = `: ${String((error as { message?: unknown }).message)}`;
          }
        }
        // Also check for direct message field
        if ("message" in responseBody && typeof (responseBody as { message?: unknown }).message === "string") {
          errorDetails = errorDetails || `: ${(responseBody as { message: string }).message}`;
        }
      }
      throw new Error(`HTTP error: ${response.status} ${statusText}${errorDetails}`);
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
 * Response formats (Doubao Responses API):
 * Format 1: Output array format (primary format)
 * {
 *   output: [
 *     {
 *       type: "reasoning",
 *       summary: [...]
 *     },
 *     {
 *       type: "message",
 *       role: "assistant",
 *       content: [
 *         {
 *           type: "output_text",
 *           text: "..."
 *         }
 *       ]
 *     }
 *   ]
 * }
 * 
 * Format 2: Direct output string (fallback)
 * {
 *   output: "..." // raw text here
 * }
 * 
 * Format 3: Nested in data object
 * {
 *   data: {
 *     output: "..." or [...]
 *   }
 * }
 * 
 * Format 4: OpenAI-compatible format (fallback)
 * {
 *   choices: [
 *     {
 *       message: {
 *         content: "..."
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
  // Try multiple possible response formats
  if (typeof responseBody === "object" && responseBody !== null) {
    const obj = responseBody as Record<string, unknown>;
    
    // Format 1: Output array format (primary format for Responses API)
    // output is an array containing objects with type: "message" and content array
    if ("output" in obj && Array.isArray(obj.output)) {
      // Find the last message-type item in the output array
      for (let i = obj.output.length - 1; i >= 0; i--) {
        const outputItem = obj.output[i];
        if (
          typeof outputItem === "object" &&
          outputItem !== null &&
          "type" in outputItem &&
          outputItem.type === "message" &&
          "role" in outputItem &&
          outputItem.role === "assistant" &&
          "content" in outputItem &&
          Array.isArray(outputItem.content)
        ) {
          // Look for output_text content items
          for (const contentItem of outputItem.content) {
            if (
              typeof contentItem === "object" &&
              contentItem !== null &&
              "type" in contentItem &&
              contentItem.type === "output_text" &&
              "text" in contentItem &&
              typeof contentItem.text === "string"
            ) {
              return contentItem.text;
            }
          }
        }
      }
    }
    
    // Format 2: Direct output string (fallback)
    if ("output" in obj && typeof obj.output === "string") {
      return obj.output;
    }
    
    // Format 3: Nested in data object
    if ("data" in obj && typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      // Check if data.output is an array
      if ("output" in data && Array.isArray(data.output)) {
        // Same logic as Format 1
        for (let i = data.output.length - 1; i >= 0; i--) {
          const outputItem = data.output[i];
          if (
            typeof outputItem === "object" &&
            outputItem !== null &&
            "type" in outputItem &&
            outputItem.type === "message" &&
            "role" in outputItem &&
            outputItem.role === "assistant" &&
            "content" in outputItem &&
            Array.isArray(outputItem.content)
          ) {
            for (const contentItem of outputItem.content) {
              if (
                typeof contentItem === "object" &&
                contentItem !== null &&
                "type" in contentItem &&
                contentItem.type === "output_text" &&
                "text" in contentItem &&
                typeof contentItem.text === "string"
              ) {
                return contentItem.text;
              }
            }
          }
        }
      }
      // Check if data.output is a string
      if ("output" in data && typeof data.output === "string") {
        return data.output;
      }
    }
    
    // Format 4: OpenAI-compatible format (fallback)
    if ("choices" in obj && Array.isArray(obj.choices) && obj.choices.length > 0) {
      const firstChoice = obj.choices[0];
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
  }
  return null;
}
