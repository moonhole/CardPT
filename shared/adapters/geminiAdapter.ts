/**
 * Gemini Provider Adapter
 * 
 * Implements transport to Google Gemini API using @google/genai SDK.
 * 
 * Supported Models (from ModelPresets):
 * - "flash" (gemini-flash) -> gemini-2.5-flash
 * - "pro" (gemini-pro) -> gemini-1.5-pro
 * 
 * Important Context:
 * - Uses official @google/genai SDK for better reliability
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

import { GoogleGenAI } from "@google/genai";
import type { ProviderAdapter } from "../providerAdapter.js";

/**
 * Gemini adapter implementation.
 * 
 * Stateless adapter - can be reused across invocations.
 * This adapter normalizes Gemini's SDK format to the unified interface.
 * All Gemini-specific details are contained here - nothing leaks upstream.
 */
export class GeminiAdapter implements ProviderAdapter {
  /**
   * Invoke Gemini API using @google/genai SDK.
   * 
   * This adapter normalizes Gemini's SDK format to the unified interface.
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
    // Map short names to full Gemini model identifiers
    const modelIdMap: Record<string, string> = {
      flash: "gemini-2.5-flash",
      pro: "gemini-3-flash", // Use 3-flash instead of 2.5-pro (free tier compatible)
    };
    const modelId = modelIdMap[modelName] || `gemini-${modelName}`;

    // Initialize Gemini client with API key
    // The SDK can read from environment variable, but we pass it explicitly for consistency
    const ai = new GoogleGenAI({ apiKey });

    try {
      // Call Gemini API using SDK
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
      });

      // Extract text from response
      // The SDK normalizes the response structure
      if (!response.text) {
        throw new Error("Response does not contain text content");
      }

      // Return raw text - normalized output, same as other adapters
      return response.text;
    } catch (error) {
      // Normalize SDK errors to Error format for consistent error handling
      if (error instanceof Error) {
        // Check if it's an HTTP error (SDK might wrap it)
        if (error.message.includes("HTTP") || error.message.includes("status")) {
          throw error;
        }
        throw new Error(`Gemini API error: ${error.message}`);
      }
      throw new Error(`Gemini API error: ${String(error)}`);
    }
  }
}

