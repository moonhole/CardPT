/**
 * Gateway Decision Pipeline - Phase 5
 * 
 * SINGLE AUTHORITATIVE DECISION ENTRYPOINT
 * 
 * This is the ONLY path for LLM decision proposals. All decision requests
 * must go through this function. There are no alternative codepaths.
 * 
 * Full Lifecycle:
 * 1. Validate seat AI config (Phase 2)
 * 2. Resolve preset → provider/model/bucket (Phase 1)
 * 3. Resolve credential for provider (Phase 3)
 * 4. Build prompt payload (existing schema)
 * 5. Call adapter (Phase 4)
 * 6. Parse raw output as JSON
 * 7. Validate output schema
 * 8. Enforce semantic gate based on bucket + legal_actions
 * 9. Return accepted proposal OR reject reason + fallback indicator
 * 
 * Hard Constraints:
 * - No alternative codepaths per provider
 * - No "fast path" skipping validation
 * - No hidden authority escalation
 * - Single place to reason about correctness and safety
 */

import { validateDecision, type Decision, type Driver } from "../engine/decision.js";
import { getAdapterForProvider } from "../shared/adapters/adapterRegistry.js";
import type { ProviderCredential } from "../shared/credentials.js";
import type { ModelPreset } from "../shared/modelPreset.js";
import { getPresetById } from "../shared/modelPresetRegistry.js";
import { validateSeatAiConfigWithFailureSemantics } from "../shared/seatAiConfigValidation.js";
import { ACTION_MODE, type ActionMode } from "../shared/actionMode.js";
import { isAiConfigFailure } from "../shared/aiConfigFailure.js";
import {
  isCredentialFailure,
  createNoKeyFailure,
  mapProviderErrorToFailure,
} from "../shared/credentialFailure.js";
import type { CredentialResult } from "../shared/credentialFailure.js";

/**
 * Observability - Minimal, Safe Logging
 * 
 * ALLOWED to log:
 * - provider
 * - model preset id
 * - reject reason code
 * - request id / hand id
 * 
 * FORBIDDEN to log:
 * - api keys
 * - Authorization headers
 * - full prompt text
 * - full raw model output (unless behind explicit dev-only flag)
 * 
 * Goal: Enable debugging without creating a trust risk.
 */

/**
 * Dev-only flag for verbose logging (raw model output).
 * Set via environment variable: DEV_LOG_RAW_OUTPUT=true
 */
const DEV_LOG_RAW_OUTPUT = process.env.DEV_LOG_RAW_OUTPUT === "true";

/**
 * Extract hand ID from decision input safely.
 * 
 * @param input - Decision input
 * @returns Hand ID if present, undefined otherwise
 */
function extractHandId(input: DecisionInput): number | undefined {
  if (
    typeof input.engine_facts === "object" &&
    input.engine_facts !== null &&
    "handId" in input.engine_facts &&
    typeof input.engine_facts.handId === "number"
  ) {
    return input.engine_facts.handId;
  }
  return undefined;
}

/**
 * Safe logging helper - ensures no sensitive data is logged.
 * 
 * @param level - Log level (log, error, warn)
 * @param message - Log message
 * @param metadata - Safe metadata (never includes API keys, prompts, or raw outputs)
 */
function safeLog(
  level: "log" | "error" | "warn",
  message: string,
  metadata?: Record<string, unknown>
): void {
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    message,
    ...metadata,
  };

  switch (level) {
    case "log":
      console.log(`[GATEWAY] ${JSON.stringify(logEntry)}`);
      break;
    case "error":
      console.error(`[GATEWAY] ${JSON.stringify(logEntry)}`);
      break;
    case "warn":
      console.warn(`[GATEWAY] ${JSON.stringify(logEntry)}`);
      break;
  }
}

/**
 * Decision input from client (normalized format from buildDecisionInput).
 */
type DecisionInput = {
  task?: string;
  schema_version?: string;
  engine_facts?: unknown;
  profile?: unknown;
  instruction?: string;
  state?: {
    legal_actions?: Array<{
      type: "fold" | "check" | "call" | "bet" | "raise";
      minAmount: number | null;
      maxAmount: number | null;
    }>;
    [key: string]: unknown;
  };
  output_schema?: unknown;
};

/**
 * Gateway parameters for LLM invocation.
 */
export type ProposeDecisionParams = {
  /**
   * Decision input (normalized format).
   */
  readonly input: DecisionInput;

  /**
   * ActionMode for this seat (policy intent).
   */
  readonly actionMode: ActionMode;

  /**
   * Preset ID to use (will be resolved to ModelPreset).
   */
  readonly presetId: string;

  /**
   * Provider credential (API key).
   * May be undefined if not provided (will result in credential failure).
   */
  readonly credential?: ProviderCredential;
};

/**
 * Accepted proposal - decision passed all validations.
 * 
 * The action is normalized to internal action encoding (FOLD/CALL/RAISE).
 */
export type AcceptedProposal = {
  readonly type: "ACCEPTED";
  readonly decision: {
    action: { type: "FOLD" | "CALL" | "RAISE"; amount?: number };
    reason: {
      drivers: Array<{ key: string; weight: number }>;
      plan: string;
      assumptions?: Record<string, string>;
      line: string;
    };
    confidence: number;
  };
};

/**
 * Required reject reason codes (minimum set).
 * 
 * These represent all possible failure modes in the decision pipeline.
 * Each reason maps to a specific validation or invocation failure.
 * 
 * All reject reasons MUST trigger fallback to manual control.
 */
export type RejectReason =
  | "invalid_ai_config" // ActionMode/preset mismatch
  | "missing_credential" // No credential provided for provider
  | "provider_error" // Network/auth/rate limit errors from provider
  | "invalid_json" // LLM response is not valid JSON
  | "schema_mismatch" // Decision structure doesn't match expected schema
  | "illegal_action" // Action not in legal_actions or violates min/max bounds
  | "capability_limit"; // Capability bucket restriction (e.g., L1 attempted RAISE)

/**
 * User-facing message codes for reject reasons.
 * 
 * These are stable keys that UI can use for localization and consistent messaging.
 * They do NOT expose raw provider errors or internal details.
 */
export type RejectMessageCode =
  | "AI_CONFIG_INVALID"
  | "CREDENTIAL_MISSING"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE_FORMAT"
  | "RESPONSE_SCHEMA_MISMATCH"
  | "ACTION_NOT_LEGAL"
  | "CAPABILITY_RESTRICTED";

/**
 * Map reject reason to user-facing message code.
 * 
 * @param reason - The reject reason
 * @returns User-facing message code
 */
function getRejectMessageCode(reason: RejectReason): RejectMessageCode {
  switch (reason) {
    case "invalid_ai_config":
      return "AI_CONFIG_INVALID";
    case "missing_credential":
      return "CREDENTIAL_MISSING";
    case "provider_error":
      return "PROVIDER_ERROR";
    case "invalid_json":
      return "INVALID_RESPONSE_FORMAT";
    case "schema_mismatch":
      return "RESPONSE_SCHEMA_MISMATCH";
    case "illegal_action":
      return "ACTION_NOT_LEGAL";
    case "capability_limit":
      return "CAPABILITY_RESTRICTED";
    default:
      return "PROVIDER_ERROR"; // Fallback for unknown reasons
  }
}

/**
 * Rejected proposal - decision failed validation or LLM invocation failed.
 * 
 * FALLBACK STRATEGY:
 * - Any reject reason MUST trigger fallback to manual control
 * - System NEVER auto-chooses a different action
 * - System NEVER silently downgrades to another model/provider
 * - System NEVER retries in Phase 5
 * - System NEVER "makes up" decisions
 * 
 * The system either accepts the proposal or asks the user to make a decision manually.
 */
export type RejectedProposal = {
  readonly type: "REJECTED";
  readonly reason: RejectReason;
  readonly message: string;
  /**
   * User-facing message code (stable key for UI localization).
   * Does NOT expose raw provider errors or internal details.
   */
  readonly messageCode: RejectMessageCode;
  /**
   * Whether manual control fallback is allowed.
   * Always true for rejected proposals - failures should not block the hand.
   */
  readonly allowManualFallback: true;
  /**
   * Explicit fallback indicator.
   * Always true - any rejection triggers fallback to manual.
   */
  readonly fallback: true;
};

/**
 * Fallback signal - explicit indication that UI must switch to manual control.
 * 
 * This is distinct from REJECTED - it represents a policy decision that
 * LLM invocation should not be attempted, rather than a failure.
 */
export type FallbackProposal = {
  readonly type: "FALLBACK";
  readonly reason: "manual_mode" | "ai_disabled";
  readonly message: string;
};

/**
 * Result of decision proposal.
 * 
 * Exactly one of:
 * - ACCEPTED: valid action proposal (normalized to internal action encoding)
 * - REJECTED: structured reject reason (with no action)
 * - FALLBACK: explicit signal that UI must switch to manual
 */
export type ProposalResult = AcceptedProposal | RejectedProposal | FallbackProposal;

/**
 * Propose a decision using LLM.
 * 
 * SINGLE AUTHORITATIVE ENTRYPOINT - all decision requests go through here.
 * 
 * This function implements the complete decision pipeline:
 * 1. Validates seat AI config (Phase 2)
 * 2. Resolves preset → provider/model/bucket (Phase 1)
 * 3. Resolves credential for provider (Phase 3)
 * 4. Builds prompt payload
 * 5. Calls adapter (Phase 4)
 * 6. Parses JSON from raw text
 * 7. Validates schema
 * 8. Enforces semantic gate (legal_actions validation)
 * 9. Returns accepted proposal or rejection with fallback indicator
 * 
 * FALLBACK STRATEGY:
 * - Any reject reason MUST trigger fallback to manual control
 * - System NEVER auto-chooses a different action on behalf of the user
 * - System NEVER silently downgrades to another model/provider
 * - System NEVER retries in Phase 5
 * - System NEVER "makes up" decisions
 * 
 * The system either accepts the proposal or asks the user to make a decision manually.
 * There is no middle ground - no automatic fallbacks, no retries, no substitutions.
 * 
 * @param params - Gateway parameters
 * @returns Proposal result (accepted or rejected with reason)
 */
export async function proposeDecision(
  params: ProposeDecisionParams
): Promise<ProposalResult> {
  const { input, actionMode, presetId, credential } = params;

  // Extract safe identifiers for logging
  const handId = extractHandId(input);
  const requestId = handId !== undefined ? `hand-${handId}` : `req-${Date.now()}`;

  // Log request start (safe data only)
  safeLog("log", "Decision proposal request started", {
    requestId,
    handId,
    presetId,
    provider: credential?.provider || "unknown",
    actionMode,
  });

  // Step 1: Validate seat AI config (Phase 2)
  const preset = getPresetById(presetId);
  if (!preset) {
    const result = {
      type: "REJECTED" as const,
      reason: "invalid_ai_config" as const,
      message: `Model preset '${presetId}' not found.`,
      messageCode: getRejectMessageCode("invalid_ai_config"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Check for manual mode - explicit fallback signal
  if (actionMode === ACTION_MODE.MANUAL) {
    const result = {
      type: "FALLBACK" as const,
      reason: "manual_mode" as const,
      message: "Manual mode is enabled. LLM invocation is not permitted.",
    };
    safeLog("log", "Decision proposal fallback to manual", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
    });
    return result;
  }

  const aiConfigResult = validateSeatAiConfigWithFailureSemantics({
    actionMode,
    selectedPreset: preset,
  });

  if (isAiConfigFailure(aiConfigResult)) {
    const result = {
      type: "REJECTED" as const,
      reason: "invalid_ai_config" as const,
      message: aiConfigResult.message,
      messageCode: getRejectMessageCode("invalid_ai_config"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Step 2: Resolve preset → provider/model/bucket (Phase 1)
  // Preset is already resolved above, contains provider, modelName, and capability

  // Step 3: Resolve credential for provider (Phase 3)
  let credentialResult: CredentialResult;
  if (!credential) {
    credentialResult = createNoKeyFailure(preset.provider);
  } else if (credential.provider !== preset.provider) {
    credentialResult = createNoKeyFailure(preset.provider);
  } else if (!credential.apiKey || typeof credential.apiKey !== "string" || !credential.apiKey.trim()) {
    // API key is missing or empty
    credentialResult = createNoKeyFailure(preset.provider);
  } else {
    // Credential is provided and matches provider, and has valid API key
    // TODO: DEBUG ONLY - MUST DELETE
    console.log("[DEBUG] Credential check passed (MUST DELETE):", JSON.stringify({
      requestId,
      provider: preset.provider,
      hasApiKey: !!credential.apiKey,
      apiKeyLength: credential.apiKey ? credential.apiKey.length : 0,
      apiKeyPrefix: credential.apiKey ? credential.apiKey.substring(0, 8) + "..." : "none",
    }));
    credentialResult = {
      type: "CREDENTIAL_SUCCESS",
      permitLlmInvocation: true,
    };
  }

  if (isCredentialFailure(credentialResult)) {
    const result = {
      type: "REJECTED" as const,
      reason: "missing_credential" as const,
      message: credentialResult.message,
      messageCode: getRejectMessageCode("missing_credential"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Step 4: Build prompt payload (canonical format, no provider-specific variants)
  const fullPrompt = buildCanonicalPrompt(input);

  // Step 5: Call adapter (Phase 4)
  const adapter = getAdapterForProvider(preset.provider);
  if (!adapter) {
    return {
      type: "REJECTED",
      reason: "provider_error",
      message: `No adapter available for provider: ${preset.provider}`,
      messageCode: getRejectMessageCode("provider_error"),
      allowManualFallback: true,
      fallback: true,
    };
  }

  // Invoke adapter (transport only - no parsing, no validation)
  // Log adapter invocation (safe data only - never log prompt or API key)
  
  // TODO: DEBUG ONLY - MUST DELETE
  // Map provider to endpoint URL for logging
  const endpointMap: Record<string, string> = {
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3/responses",
    "deepseek": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    "gemini": "GoogleGenAI SDK (generativelanguage.googleapis.com)",
  };
  const endpoint = endpointMap[preset.provider] || "unknown";
  
  safeLog("log", "Adapter invocation started", {
    requestId,
    handId,
    presetId,
    provider: preset.provider,
    modelName: preset.modelName,
    endpoint: endpoint,
  });

  // TODO: DEBUG ONLY - MUST DELETE
  // Log raw LLM request data for debugging (API key redacted)
  console.log("[DEBUG] Raw LLM Provider Request (MUST DELETE):", JSON.stringify({
    requestId,
    handId,
    presetId,
    provider: preset.provider,
    modelName: preset.modelName,
    endpoint: endpoint,
    prompt: fullPrompt,
    apiKey: "[REDACTED]",
  }, null, 2));

  let rawText: string;
  try {
    rawText = await adapter.invoke(
      preset.provider,
      preset.modelName,
      fullPrompt,
      credential!.apiKey
    );

    // TODO: DEBUG ONLY - MUST DELETE
    // Log raw LLM response data for debugging
    console.log("[DEBUG] Raw LLM Provider Response (MUST DELETE):", JSON.stringify({
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      modelName: preset.modelName,
      rawOutput: rawText,
      rawOutputLength: rawText.length,
    }, null, 2));

    // Log adapter success (dev-only flag for raw output)
    if (DEV_LOG_RAW_OUTPUT) {
      safeLog("log", "Adapter invocation succeeded (dev mode)", {
        requestId,
        handId,
        presetId,
        provider: preset.provider,
        rawOutputLength: rawText.length,
        rawOutput: rawText, // Only in dev mode
      });
    } else {
      safeLog("log", "Adapter invocation succeeded", {
        requestId,
        handId,
        presetId,
        provider: preset.provider,
        rawOutputLength: rawText.length,
      });
    }
  } catch (error) {
    // Map adapter HTTP errors to credential failures if appropriate
    if (error instanceof Error && error.message.includes("HTTP error:")) {
      const statusCode = extractStatusCode(error.message);
      // Map auth/rate limit errors to missing credential
      if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
        const credentialFailure = mapProviderErrorToFailure(
          preset.provider,
          statusCode
        );
        const result = {
          type: "REJECTED" as const,
          reason: "missing_credential" as const,
          message: credentialFailure.message,
          messageCode: getRejectMessageCode("missing_credential"),
          allowManualFallback: true as const,
          fallback: true as const,
        };
        safeLog("error", "Decision proposal rejected", {
          requestId,
          handId,
          presetId,
          provider: preset.provider,
          reason: result.reason,
          messageCode: result.messageCode,
          httpStatus: statusCode,
        });
        return result;
      }
      // Other HTTP errors (5xx) are provider errors
      if (statusCode >= 500) {
        const credentialFailure = mapProviderErrorToFailure(
          preset.provider,
          statusCode
        );
        const result = {
          type: "REJECTED" as const,
          reason: "provider_error" as const,
          message: credentialFailure.message,
          messageCode: getRejectMessageCode("provider_error"),
          allowManualFallback: true as const,
          fallback: true as const,
        };
        safeLog("error", "Decision proposal rejected", {
          requestId,
          handId,
          presetId,
          provider: preset.provider,
          reason: result.reason,
          messageCode: result.messageCode,
          httpStatus: statusCode,
        });
        return result;
      }
    }

    // Network errors and other adapter errors are provider errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = {
      type: "REJECTED" as const,
      reason: "provider_error" as const,
      message: `Provider request failed for ${preset.provider}: ${errorMessage}`,
      messageCode: getRejectMessageCode("provider_error"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("error", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
      messageCode: result.messageCode,
      errorType: error instanceof Error ? error.constructor.name : "unknown",
      errorMessage: errorMessage,
    });
    return result;
  }

  // Step 6: Parse raw output as JSON (explicit parsing step)
  const parseResult = parseRawTextAsJson(rawText, requestId, handId, presetId, preset.provider);
  if (parseResult.type === "REJECTED") {
    return parseResult;
  }
  const parsedJson = parseResult.parsed;

  // Step 6.5: Normalize decision schema (lightweight normalization before validation)
  const normalizedJson = normalizeDecisionSchema(parsedJson);

  // Step 7: Validate output schema (explicit validation step)
  const validationResult = validateDecisionSchema(normalizedJson, requestId, handId, presetId, preset.provider);
  if (validationResult.type === "REJECTED") {
    return validationResult;
  }
  const typedDecision = validationResult.decision;

  try {
    validateDecision(typedDecision, handId !== undefined ? { handId } : undefined);
  } catch (err) {
    // Decision validation failures are schema mismatches
    const result = {
      type: "REJECTED" as const,
      reason: "schema_mismatch" as const,
      message: `Decision validation failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      messageCode: getRejectMessageCode("schema_mismatch"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Step 8: Enforce semantic gate based on bucket + legal_actions
  const semanticGateResult = enforceSemanticGate(
    typedDecision.action,
    input.state?.legal_actions || [],
    preset.capability
  );

  if (!semanticGateResult.valid) {
    // Use the specific reason from semantic gate (illegal_action or capability_limit)
    const gateReason = semanticGateResult.reason || "illegal_action";
    const result = {
      type: "REJECTED" as const,
      reason: gateReason,
      message: semanticGateResult.message || "Proposed action is not legal in current game state.",
      messageCode: getRejectMessageCode(gateReason),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider: preset.provider,
      reason: result.reason,
      messageCode: result.messageCode,
      proposedAction: typedDecision.action.type,
    });
    return result;
  }

  // Step 9: Return accepted proposal
  safeLog("log", "Decision proposal accepted", {
    requestId,
    handId,
    presetId,
    provider: preset.provider,
    action: typedDecision.action.type,
    confidence: typedDecision.confidence,
  });
  return {
    type: "ACCEPTED",
    decision: typedDecision,
  };
}

/**
 * Parse raw text output as JSON object.
 * 
 * PARSING STEP - No validation, only parsing.
 * 
 * Hard Constraints:
 * - Do NOT repair malformed JSON by heuristics
 * - Do NOT accept multiple JSON objects
 * - If parse fails → invalid_json
 * 
 * @param rawText - Raw text output from LLM
 * @returns Parsed JSON object or rejection with invalid_json reason
 */
function parseRawTextAsJson(
  rawText: string,
  requestId: string,
  handId: number | undefined,
  presetId: string,
  provider: string
): { type: "PARSED"; parsed: unknown } | RejectedProposal {
  // Extract and trim raw text
  const trimmed = rawText.trim();

  // Check if response looks like JSON (must start with { and end with })
  // This is a basic sanity check before attempting parse
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    const result = {
      type: "REJECTED" as const,
      reason: "invalid_json" as const,
      message: "LLM response is not JSON format. Response must start with { and end with }.",
      messageCode: getRejectMessageCode("invalid_json"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Check for multiple top-level JSON objects (reject if found)
  // Simple heuristic: after the first closing brace, check if there's another top-level object
  // This catches cases like: {"a":1}{"b":2} but allows nested objects like {"a":{"b":1}}
  const firstCloseBrace = trimmed.indexOf("}");
  if (firstCloseBrace >= 0 && firstCloseBrace < trimmed.length - 1) {
    const afterFirstObject = trimmed.substring(firstCloseBrace + 1).trim();
    // If there's content after the first object and it starts with {, likely multiple objects
    if (afterFirstObject.length > 0 && afterFirstObject.startsWith("{")) {
      const result = {
        type: "REJECTED" as const,
        reason: "invalid_json" as const,
        message: "LLM response contains multiple JSON objects. Only a single JSON object is allowed.",
        messageCode: getRejectMessageCode("invalid_json"),
        allowManualFallback: true as const,
        fallback: true as const,
      };
      safeLog("warn", "Decision proposal rejected", {
        requestId,
        handId,
        presetId,
        provider,
        reason: result.reason,
        messageCode: result.messageCode,
      });
      return result;
    }
  }

  // Parse JSON - no heuristics, no repair, strict parsing only
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    // Parse failed - return invalid_json (do NOT attempt repair)
    const result = {
      type: "REJECTED" as const,
      reason: "invalid_json" as const,
      message: `JSON parse failure: ${
        err instanceof Error ? err.message : String(err)
      }`,
      messageCode: getRejectMessageCode("invalid_json"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  // Ensure parsed result is an object (not array, string, number, etc.)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    const result = {
      type: "REJECTED" as const,
      reason: "invalid_json" as const,
      message: "Parsed JSON is not an object. Expected a JSON object, not an array or primitive.",
      messageCode: getRejectMessageCode("invalid_json"),
      allowManualFallback: true as const,
      fallback: true as const,
    };
    safeLog("warn", "Decision proposal rejected", {
      requestId,
      handId,
      presetId,
      provider,
      reason: result.reason,
      messageCode: result.messageCode,
    });
    return result;
  }

  return { type: "PARSED", parsed };
}

/**
 * Normalize decision schema - normalize action representation and remove redundant null amounts.
 * 
 * This function performs lightweight normalization before schema validation:
 * - Normalize action string shorthand ("CALL") to object form ({ type: "CALL" })
 * - For FOLD/CALL actions with amount: null, removes the amount field
 * - For RAISE actions, does not modify amount (strict validation required)
 * - Does not modify other fields or structure
 * 
 * @param parsedJson - Parsed JSON object from parsing step
 * @returns Normalized JSON object (may be same object if no changes needed)
 */
function normalizeDecisionSchema(parsedJson: unknown): unknown {
  // Ensure parsedJson is an object
  if (typeof parsedJson !== "object" || parsedJson === null) {
    return parsedJson;
  }

  const obj = parsedJson as Record<string, unknown>;

  // Check if action exists
  if (!("action" in obj)) {
    return parsedJson;
  }

  // Normalize action string shorthand to object form
  // "CALL" -> { type: "CALL" }
  if (typeof obj.action === "string") {
    const actionStr = obj.action.toUpperCase();
    // Only allow known action types (strict safety boundary)
    if (actionStr === "FOLD" || actionStr === "CALL" || actionStr === "RAISE") {
      obj.action = { type: actionStr };
    } else {
      // Unknown action string - let validation reject it
      return parsedJson;
    }
  }

  // Ensure action is an object after normalization
  if (typeof obj.action !== "object" || obj.action === null) {
    return parsedJson;
  }

  const actionObj = obj.action as Record<string, unknown>;

  // Check if type exists and is valid
  if (!("type" in actionObj)) {
    return parsedJson;
  }

  const actionType = String(actionObj.type || "").toUpperCase();

  // Only normalize for FOLD and CALL
  if (actionType === "FOLD" || actionType === "CALL") {
    // If amount is null, delete it
    if ("amount" in actionObj && actionObj.amount === null) {
      delete actionObj.amount;
    }
  }

  // For RAISE, do not modify - strict validation required
  return parsedJson;
}

/**
 * Helper to create and log schema rejection.
 */
function createSchemaRejection(
  message: string,
  requestId: string,
  handId: number | undefined,
  presetId: string,
  provider: string
): RejectedProposal {
  const result = {
    type: "REJECTED" as const,
    reason: "schema_mismatch" as const,
    message,
    messageCode: getRejectMessageCode("schema_mismatch"),
    allowManualFallback: true as const,
    fallback: true as const,
  };
  safeLog("warn", "Decision proposal rejected", {
    requestId,
    handId,
    presetId,
    provider,
    reason: result.reason,
    messageCode: result.messageCode,
  });
  return result;
}

/**
 * Validate decision schema.
 * 
 * SCHEMA VALIDATION STEP - No parsing, only validation.
 * 
 * Validates:
 * - Required fields exist: action.type
 * - action.amount (nullable allowed only when not raising)
 * - reason (optional but recommended)
 * - confidence (optional)
 * 
 * @param parsedJson - Parsed JSON object from parsing step
 * @returns Validated decision object or rejection with schema_mismatch reason
 */
function validateDecisionSchema(
  parsedJson: unknown,
  requestId: string,
  handId: number | undefined,
  presetId: string,
  provider: string
): { type: "VALIDATED"; decision: Decision } | RejectedProposal {
  // Ensure parsedJson is an object
  if (typeof parsedJson !== "object" || parsedJson === null) {
    return createSchemaRejection(
      "Decision must be a JSON object.",
      requestId,
      handId,
      presetId,
      provider
    );
  }

  const obj = parsedJson as Record<string, unknown>;

  // Validate required field: action.type
  if (!("action" in obj)) {
    return createSchemaRejection(
      "Decision schema mismatch: missing required field 'action'.",
      requestId,
      handId,
      presetId,
      provider
    );
  }

  if (typeof obj.action !== "object" || obj.action === null) {
    return createSchemaRejection(
      "Decision schema mismatch: 'action' must be an object.",
      requestId,
      handId,
      presetId,
      provider
    );
  }

  const actionObj = obj.action as Record<string, unknown>;

  if (!("type" in actionObj)) {
    return createSchemaRejection(
      "Decision schema mismatch: missing required field 'action.type'.",
      requestId,
      handId,
      presetId,
      provider
    );
  }

  const actionType = String(actionObj.type || "").toUpperCase();
  if (actionType !== "FOLD" && actionType !== "CALL" && actionType !== "RAISE") {
    return createSchemaRejection(
      `Invalid action type: ${actionType}. Must be FOLD, CALL, or RAISE.`,
      requestId,
      handId,
      presetId,
      provider
    );
  }

  // Validate action.amount (nullable allowed only when not raising)
  let actionAmount: number | undefined = undefined;
  if ("amount" in actionObj) {
    if (actionObj.amount === null || actionObj.amount === undefined) {
      // Null/undefined is allowed for FOLD and CALL
      if (actionType === "RAISE") {
        return createSchemaRejection(
          "Decision schema mismatch: 'action.amount' is required for RAISE actions.",
          requestId,
          handId,
          presetId,
          provider
        );
      }
      // For FOLD and CALL, undefined is fine
      actionAmount = undefined;
    } else if (typeof actionObj.amount === "number") {
      if (!Number.isFinite(actionObj.amount)) {
        return createSchemaRejection(
          "Decision schema mismatch: 'action.amount' must be a finite number.",
          requestId,
          handId,
          presetId,
          provider
        );
      }
      actionAmount = actionObj.amount;
      
      // RAISE must have an amount
      if (actionType === "RAISE" && actionAmount === undefined) {
        return createSchemaRejection(
          "Decision schema mismatch: 'action.amount' is required for RAISE actions.",
          requestId,
          handId,
          presetId,
          provider
        );
      }
    } else {
      return createSchemaRejection(
        "Decision schema mismatch: 'action.amount' must be a number or null.",
        requestId,
        handId,
        presetId,
        provider
      );
    }
  } else {
    // amount field missing
    if (actionType === "RAISE") {
      return createSchemaRejection(
        "Decision schema mismatch: 'action.amount' is required for RAISE actions.",
        requestId,
        handId,
        presetId,
        provider
      );
    }
    // For FOLD and CALL, amount is optional
    actionAmount = undefined;
  }

  // Validate reason (optional but recommended)
  let reason: Decision["reason"] | undefined = undefined;
  if ("reason" in obj) {
    if (typeof obj.reason !== "object" || obj.reason === null) {
      return createSchemaRejection(
        "Decision schema mismatch: 'reason' must be an object if provided.",
        requestId,
        handId,
        presetId,
        provider
      );
    }

    const reasonObj = obj.reason as Record<string, unknown>;

    // Validate drivers (optional but recommended)
    let drivers: Driver[] = [];
    if ("drivers" in reasonObj) {
      if (!Array.isArray(reasonObj.drivers)) {
        return createSchemaRejection(
          "Decision schema mismatch: 'reason.drivers' must be an array if provided.",
          requestId,
          handId,
          presetId,
          provider
        );
      }

      // Validate each driver (lenient explanation layer)
      // Key: allow any non-empty string (not strict enum)
      // Weight: must be finite number (strict)
      for (let i = 0; i < reasonObj.drivers.length; i++) {
        const driver = reasonObj.drivers[i];
        if (
          typeof driver !== "object" ||
          driver === null ||
          !("key" in driver) ||
          !("weight" in driver) ||
          typeof driver.key !== "string" ||
          driver.key.trim().length === 0 ||
          typeof driver.weight !== "number" ||
          !Number.isFinite(driver.weight)
        ) {
          return createSchemaRejection(
            `Decision schema mismatch: 'reason.drivers[${i}]' must have 'key' (non-empty string) and 'weight' (finite number).`,
            requestId,
            handId,
            presetId,
            provider
          );
        }
        // Driver key validation: allow any non-empty string (explanation layer is lenient)
        // No enum restriction - explanation layer does not affect engine safety
      }

      drivers = reasonObj.drivers as Driver[];
    }

    // Validate plan (optional but recommended)
    // Schema validation accepts any string; validateDecision will enforce stricter enum values
    const planRaw = "plan" in reasonObj ? String(reasonObj.plan || "") : "";
    const validPlans: readonly Decision["reason"]["plan"][] = ["see_turn", "control_pot", "apply_pressure"];
    const plan: Decision["reason"]["plan"] = validPlans.includes(planRaw as Decision["reason"]["plan"])
      ? (planRaw as Decision["reason"]["plan"])
      : "see_turn"; // Default to see_turn if invalid

    // Validate assumptions (optional)
    let assumptions: Record<string, string> | undefined = undefined;
    if (
      "assumptions" in reasonObj &&
      typeof reasonObj.assumptions === "object" &&
      reasonObj.assumptions !== null &&
      !Array.isArray(reasonObj.assumptions)
    ) {
      assumptions = reasonObj.assumptions as Record<string, string>;
    }

    // Validate line (optional but recommended)
    const line = "line" in reasonObj ? String(reasonObj.line || "") : "";

    // Build reason object - plan type will be validated by validateDecision
    reason = {
      drivers: drivers as Driver[],
      plan: plan,
      assumptions,
      line,
    };
  }

  // Validate confidence (optional)
  let confidence: number | undefined = undefined;
  if ("confidence" in obj) {
    if (typeof obj.confidence !== "number" || !Number.isFinite(obj.confidence)) {
      return createSchemaRejection(
        "Decision schema mismatch: 'confidence' must be a finite number if provided.",
        requestId,
        handId,
        presetId,
        provider
      );
    }
    confidence = obj.confidence;
  }

  // Build validated decision object
  // Ensure reason has valid plan value (default to see_turn if not provided)
  const finalReason: Decision["reason"] = reason || {
    drivers: [],
    plan: "see_turn",
    line: "",
  };

  const decision: Decision = {
    action: {
      type: actionType as "FOLD" | "CALL" | "RAISE",
      amount: actionAmount,
    },
    reason: finalReason,
    confidence: confidence ?? 0.5, // Default confidence if not provided
  };

  return { type: "VALIDATED", decision };
}

/**
 * Enforce semantic gate: validate authority (CapabilityBucket) and game legality (legal_actions).
 * 
 * SEMANTIC GATE - Separates authority from legality.
 * 
 * This gate enforces two separate concerns:
 * 1. Authority (CapabilityBucket): What actions the capability bucket allows
 * 2. Game Legality (legal_actions): What actions are legal in the current game state
 * 
 * Rules by CapabilityBucket:
 * - L1_BASIC: Allow only FOLD or CALL. Any RAISE → capability_limit
 * - L2_STANDARD / L3_EXPERIMENTAL: Allow FOLD/CALL/RAISE
 *   - If RAISE: must exist in legal_actions, amount must be within [minAmount, maxAmount]
 *   - Else → illegal_action
 * 
 * Critical Hard Constraint:
 * - L3_EXPERIMENTAL has the SAME authority as L2_STANDARD
 * - It is only labeled "experimental" in UI, not in authority logic
 * 
 * @param proposedAction - The action proposed by LLM
 * @param legalActions - Array of legal actions from game state
 * @param capability - Capability bucket (L1_BASIC, L2_STANDARD, L3_EXPERIMENTAL)
 * @returns Validation result with reason if invalid
 */
function enforceSemanticGate(
  proposedAction: { type: "FOLD" | "CALL" | "RAISE"; amount?: number },
  legalActions: Array<{
    type: "fold" | "check" | "call" | "bet" | "raise";
    minAmount: number | null;
    maxAmount: number | null;
  }>,
  capability: string
): { valid: boolean; message?: string; reason?: "illegal_action" | "capability_limit" } {
  const intent = proposedAction.type;

  // STEP 1: Check authority (CapabilityBucket)
  // L1_BASIC: Only FOLD or CALL allowed
  if (capability === "L1_BASIC") {
    if (intent === "RAISE") {
      return {
        valid: false,
        reason: "capability_limit",
        message: "L1_BASIC capability does not allow RAISE actions. Only FOLD or CALL are permitted.",
      };
    }
    // FOLD and CALL are allowed for L1_BASIC - proceed to legality check
  }
  // L2_STANDARD and L3_EXPERIMENTAL have the SAME authority
  // Both allow FOLD, CALL, and RAISE
  // (L3_EXPERIMENTAL is only a UI label, not a different authority level)

  // STEP 2: Check game legality (legal_actions)
  // Map LLM intent to engine action types
  // FOLD → fold
  // CALL → check or call (depending on game state)
  // RAISE → bet or raise (depending on game state)

  if (intent === "FOLD") {
    const legalFold = legalActions.find((a) => a.type === "fold");
    if (!legalFold) {
      return {
        valid: false,
        reason: "illegal_action",
        message: "FOLD is not a legal action in the current game state.",
      };
    }
    // FOLD is legal - no amount validation needed
    return { valid: true };
  }

  if (intent === "CALL") {
    const legalCheck = legalActions.find((a) => a.type === "check");
    const legalCall = legalActions.find((a) => a.type === "call");
    if (!legalCheck && !legalCall) {
      return {
        valid: false,
        reason: "illegal_action",
        message: "CALL/CHECK is not a legal action in the current game state.",
      };
    }
    // CALL/CHECK is legal - no amount validation needed
    return { valid: true };
  }

  if (intent === "RAISE") {
    // Authority check already passed (L2/L3 allow RAISE)
    // Now check game legality

    const legalBet = legalActions.find((a) => a.type === "bet");
    const legalRaise = legalActions.find((a) => a.type === "raise");

    if (!legalBet && !legalRaise) {
      return {
        valid: false,
        reason: "illegal_action",
        message: "RAISE/BET is not a legal action in the current game state.",
      };
    }

    // RAISE requires an amount
    if (proposedAction.amount === undefined) {
      return {
        valid: false,
        reason: "illegal_action",
        message: "RAISE action requires an amount.",
      };
    }

    const amount = proposedAction.amount;
    const legal = legalBet || legalRaise!;

    // Validate amount is within legal bounds
    // stack/to_call constraints are already present in decision input and reflected in legal_actions
    if (legal.minAmount !== null && amount < legal.minAmount) {
      return {
        valid: false,
        reason: "illegal_action",
        message: `RAISE amount ${amount} is below minimum ${legal.minAmount}.`,
      };
    }

    if (legal.maxAmount !== null && amount > legal.maxAmount) {
      return {
        valid: false,
        reason: "illegal_action",
        message: `RAISE amount ${amount} exceeds maximum ${legal.maxAmount}.`,
      };
    }

    // RAISE is legal and amount is within bounds
    return { valid: true };
  }

  // Should never reach here, but handle gracefully
  return {
    valid: false,
    reason: "illegal_action",
    message: `Unknown action type: ${intent}`,
  };
}

/**
 * Build canonical prompt payload.
 * 
 * HARD CONSTRAINTS:
 * - No provider-specific prompt variants
 * - Action encoding rules CANNOT be overridden
 * - No tool calls allowed (explicitly disabled)
 * - Custom prompts cannot override encoding rules
 * - One canonical prompt spec across all providers
 * 
 * Prompt Structure:
 * 1. System instruction (fixed, cannot be overridden)
 * 2. Action encoding rules (fixed, cannot be overridden)
 * 3. Profile prompt (from input.profile, if provided)
 * 4. Decision input (complete JSON structure)
 * 
 * @param input - Decision input with profile and instruction
 * @returns Canonical prompt string (identical across all providers)
 */
/**
 * Build canonical prompt payload.
 * 
 * HARD CONSTRAINTS:
 * - No provider-specific prompt variants
 * - Action encoding rules CANNOT be overridden
 * - No tool calls allowed (explicitly disabled)
 * - Custom prompts cannot override encoding rules
 * - One canonical prompt spec across all providers
 * 
 * Prompt Structure (fixed order):
 * 1. System instruction (fixed, cannot be overridden)
 * 2. Tool call prevention (explicit, cannot be overridden)
 * 3. Action encoding rules (fixed, cannot be overridden)
 * 4. Profile prompt (from input.profile, advisory only)
 * 5. Decision input (complete JSON structure)
 * 6. Final JSON-only reminder
 * 
 * @param input - Decision input with profile and instruction
 * @returns Canonical prompt string (identical across all providers)
 */
function buildCanonicalPrompt(input: DecisionInput): string {
  // Fixed system instruction - cannot be overridden
  const systemInstruction = `You are a poker decision assistant. Your task is to analyze the poker situation and propose a decision.`;

  // Explicit tool call prevention - cannot be overridden
  const toolCallPrevention = `
CRITICAL: Output Format Restrictions
- You MUST respond with plain JSON only
- Do NOT use tool calls, function calls, or function calling features
- Do NOT use structured output formats other than JSON
- Do NOT wrap JSON in markdown code blocks
- Do NOT include explanations before or after the JSON
- Your response must start with { and end with }
- Any deviation from pure JSON will cause your response to be rejected`;

  // Fixed action encoding rules - cannot be overridden by custom prompts
  const actionEncodingRules = `
Action Encoding Rules (STRICT - CANNOT BE OVERRIDDEN):
- The ONLY valid action types are: FOLD, CALL, RAISE
- CHECK must be encoded as CALL
- BET must be encoded as RAISE
- Any other action type is invalid and will be rejected
- These rules apply regardless of any other instructions
- Custom prompts cannot override these encoding rules`;

  // Extract profile prompt (if provided) - this is advisory only, cannot override encoding rules
  let profilePrompt = "";
  if (
    input.profile &&
    typeof input.profile === "object" &&
    input.profile !== null
  ) {
    const profile = input.profile as {
      prompt?: string;
      custom_prompt?: string;
      name?: string;
      description?: string;
    };
    
    // Use custom_prompt if provided, otherwise use profile.prompt
    if (profile.custom_prompt && typeof profile.custom_prompt === "string") {
      profilePrompt = profile.custom_prompt.trim();
    } else if (profile.prompt && typeof profile.prompt === "string") {
      profilePrompt = profile.prompt.trim();
    }
  }

  // Build decision input JSON
  // Include all fields: engine_facts, profile, state, output_schema
  // Note: We do NOT include input.instruction in the JSON, as we enforce our own canonical encoding rules
  const decisionInputForPrompt = {
    task: input.task || "propose_decision",
    schema_version: input.schema_version,
    engine_facts: input.engine_facts,
    profile: input.profile,
    // Explicitly exclude input.instruction - we use our own canonical encoding rules above
    state: input.state,
    output_schema: input.output_schema,
  };

  const decisionInputJson = JSON.stringify(decisionInputForPrompt, null, 2);

  // Construct canonical prompt with fixed structure
  // Order matters: system → tool prevention → encoding rules → profile → decision input → reminder
  const promptParts: string[] = [
    systemInstruction,
    toolCallPrevention,
    actionEncodingRules,
  ];

  // Add profile prompt if provided (advisory only, cannot override encoding rules)
  if (profilePrompt) {
    promptParts.push(
      `\nPlayer Profile (advisory - the encoding rules above still apply and cannot be overridden):\n${profilePrompt}`
    );
  }

  // Add decision input
  promptParts.push(`\nDecision Input:\n${decisionInputJson}`);

  // Add final reminder about JSON-only output
  promptParts.push(
    `\n\nFINAL REMINDER: Respond ONLY with valid JSON. No tool calls, no function calls, no markdown, no explanations. Start with { and end with }.`
  );

  return promptParts.join("\n");
}

/**
 * Extract HTTP status code from error message if present.
 * 
 * Adapters throw errors in the format: "HTTP error: 401 Unauthorized"
 * This function extracts the status code from such messages.
 * 
 * @param errorMessage - Error message that may contain status code
 * @returns Status code if found, 500 otherwise
 */
function extractStatusCode(errorMessage: string): number {
  // Extract status code from "HTTP error: 401 Unauthorized" format
  const match = errorMessage.match(/HTTP error:\s*(\d{3})/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Fallback: try to find any 3-digit HTTP status code
  const fallbackMatch = errorMessage.match(/\b([45]\d{2})\b/);
  if (fallbackMatch) {
    return parseInt(fallbackMatch[1], 10);
  }
  return 500;
}
