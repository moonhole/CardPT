/**
 * Credential Failure Semantics
 * 
 * Defines system behavior when credentials are missing or invalid.
 * 
 * Cases:
 * - No key provided for selected provider
 * - Key provided but provider returns auth error
 * - Key revoked / rate-limited
 * 
 * Required Behavior:
 * - LLM invocation must be skipped or aborted
 * - Decision flow must fallback to manual control
 * - UI must show a human-readable reason
 * 
 * Hard Constraints:
 * - No retries with other providers' keys
 * - No silent failure
 * 
 * Goal: Credential failure is visible, recoverable, and non-destructive.
 */

/**
 * Credential failure reason codes.
 * These represent credential-related failures, not exceptional errors.
 */
export type CredentialFailureReason =
  | "NO_KEY_PROVIDED"
  | "AUTH_ERROR"
  | "KEY_REVOKED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

/**
 * Credential failure details.
 * 
 * This represents a credential-related failure that prevents LLM invocation.
 * The system should gracefully fallback to manual control.
 */
export type CredentialFailure = {
  /**
   * Indicates this is a credential failure (not success).
   */
  readonly type: "CREDENTIAL_FAILURE";

  /**
   * Structured reason code for programmatic handling.
   */
  readonly reason: CredentialFailureReason;

  /**
   * Human-readable message explaining the failure.
   * Suitable for display to users.
   */
  readonly message: string;

  /**
   * Provider identifier that failed (if applicable).
   */
  readonly provider?: string;

  /**
   * Whether LLM invocation should be skipped.
   * Always true for failures.
   */
  readonly skipLlmInvocation: true;

  /**
   * Whether manual control fallback is allowed.
   * Always true - credential failures should not block the hand.
   */
  readonly allowManualFallback: true;

  /**
   * Whether the failure is recoverable (user can fix).
   * True for missing/invalid keys, false for provider errors.
   */
  readonly recoverable: boolean;
};

/**
 * Success state - credential is valid and LLM invocation can proceed.
 */
export type CredentialSuccess = {
  /**
   * Indicates this is a success (not a failure).
   */
  readonly type: "CREDENTIAL_SUCCESS";

  /**
   * Whether LLM invocation can proceed.
   * Always true for success.
   */
  readonly permitLlmInvocation: true;
};

/**
 * Result of credential check.
 * 
 * Either success (permit LLM) or failure (skip LLM, allow manual fallback).
 */
export type CredentialResult = CredentialSuccess | CredentialFailure;

/**
 * Create a credential failure for missing key.
 * 
 * @param provider - The provider identifier (optional)
 * @returns Credential failure indicating no key provided
 */
export function createNoKeyFailure(
  provider?: string
): CredentialFailure {
  const providerText = provider ? ` for ${provider}` : "";
  return {
    type: "CREDENTIAL_FAILURE",
    reason: "NO_KEY_PROVIDED",
    message: `No API key provided${providerText}. Please configure your API key to use this provider.`,
    provider,
    skipLlmInvocation: true,
    allowManualFallback: true,
    recoverable: true,
  };
}

/**
 * Create a credential failure for authentication error.
 * 
 * @param provider - The provider identifier
 * @param details - Optional error details from provider
 * @returns Credential failure indicating auth error
 */
export function createAuthErrorFailure(
  provider: string,
  details?: string
): CredentialFailure {
  const detailsText = details ? `: ${details}` : "";
  return {
    type: "CREDENTIAL_FAILURE",
    reason: "AUTH_ERROR",
    message: `Authentication failed for ${provider}${detailsText}. Please check your API key.`,
    provider,
    skipLlmInvocation: true,
    allowManualFallback: true,
    recoverable: true,
  };
}

/**
 * Create a credential failure for revoked key.
 * 
 * @param provider - The provider identifier
 * @returns Credential failure indicating key revoked
 */
export function createKeyRevokedFailure(
  provider: string
): CredentialFailure {
  return {
    type: "CREDENTIAL_FAILURE",
    reason: "KEY_REVOKED",
    message: `API key for ${provider} has been revoked. Please update your API key.`,
    provider,
    skipLlmInvocation: true,
    allowManualFallback: true,
    recoverable: true,
  };
}

/**
 * Create a credential failure for rate limiting.
 * 
 * @param provider - The provider identifier
 * @param retryAfter - Optional retry-after information
 * @returns Credential failure indicating rate limit
 */
export function createRateLimitedFailure(
  provider: string,
  retryAfter?: number
): CredentialFailure {
  const retryText = retryAfter
    ? ` Please try again after ${retryAfter} seconds.`
    : "";
  return {
    type: "CREDENTIAL_FAILURE",
    reason: "RATE_LIMITED",
    message: `Rate limit exceeded for ${provider}.${retryText}`,
    provider,
    skipLlmInvocation: true,
    allowManualFallback: true,
    recoverable: false, // Rate limits are temporary but not immediately recoverable
  };
}

/**
 * Create a credential failure for provider error.
 * 
 * @param provider - The provider identifier
 * @param details - Optional error details
 * @returns Credential failure indicating provider error
 */
export function createProviderErrorFailure(
  provider: string,
  details?: string
): CredentialFailure {
  const detailsText = details ? `: ${details}` : "";
  return {
    type: "CREDENTIAL_FAILURE",
    reason: "PROVIDER_ERROR",
    message: `Provider error for ${provider}${detailsText}. Please try again later.`,
    provider,
    skipLlmInvocation: true,
    allowManualFallback: true,
    recoverable: false,
  };
}

/**
 * Check if a result represents a credential failure.
 * 
 * @param result - The credential result to check
 * @returns true if this is a failure, false if success
 */
export function isCredentialFailure(
  result: CredentialResult
): result is CredentialFailure {
  return result.type === "CREDENTIAL_FAILURE";
}

/**
 * Check if a result permits LLM invocation.
 * 
 * @param result - The credential result to check
 * @returns true if LLM invocation is permitted, false otherwise
 */
export function isLlmInvocationPermitted(result: CredentialResult): boolean {
  return result.type === "CREDENTIAL_SUCCESS";
}

/**
 * Get human-readable failure message if result is a failure.
 * 
 * @param result - The credential result
 * @returns Failure message if result is a failure, undefined otherwise
 */
export function getCredentialFailureMessage(
  result: CredentialResult
): string | undefined {
  return isCredentialFailure(result) ? result.message : undefined;
}

/**
 * Map provider HTTP error to credential failure.
 * 
 * This function interprets provider API errors and converts them
 * to appropriate credential failure types.
 * 
 * @param provider - The provider identifier
 * @param statusCode - HTTP status code from provider
 * @param errorBody - Optional error body from provider
 * @returns Credential failure appropriate for the error
 */
export function mapProviderErrorToFailure(
  provider: string,
  statusCode: number,
  errorBody?: unknown
): CredentialFailure {
  // Extract error message if available
  const errorMessage =
    typeof errorBody === "object" &&
    errorBody !== null &&
    "message" in errorBody &&
    typeof errorBody.message === "string"
      ? errorBody.message
      : undefined;

  // Map HTTP status codes to failure types
  switch (statusCode) {
    case 401:
    case 403:
      // Authentication/authorization errors
      return createAuthErrorFailure(provider, errorMessage);

    case 429:
      // Rate limiting
      const retryAfter =
        typeof errorBody === "object" &&
        errorBody !== null &&
        "retry_after" in errorBody &&
        typeof errorBody.retry_after === "number"
          ? errorBody.retry_after
          : undefined;
      return createRateLimitedFailure(provider, retryAfter);

    case 500:
    case 502:
    case 503:
    case 504:
      // Provider errors
      return createProviderErrorFailure(provider, errorMessage);

    default:
      // Generic provider error
      return createProviderErrorFailure(
        provider,
        errorMessage || `HTTP ${statusCode}`
      );
  }
}

