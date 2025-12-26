/**
 * Provider-Scoped Credential Model
 * 
 * Credentials are stored per provider, not per model.
 * Each provider has at most one active key at a time.
 * 
 * Hard Constraints:
 * - No cross-provider sharing
 * - No automatic fallback to other providers' keys
 * 
 * Goal: Avoid accidental privilege escalation via key reuse.
 */

/**
 * Credential metadata (local only, not sent to providers).
 * Used for UI display and local management.
 */
export type CredentialMetadata = {
  /**
   * Credential version/format identifier (if applicable).
   * Optional, provider-specific.
   */
  version?: string;

  /**
   * Timestamp when credential was saved (local time).
   * Used for UI display only.
   */
  savedAt?: number;
};

/**
 * Provider-scoped credential.
 * 
 * Each provider has at most one active credential at a time.
 * Credentials are scoped by provider identifier, not by model.
 */
export type ProviderCredential = {
  /**
   * Provider identifier (e.g., "qwen", "doubao", "deepseek", "gemini").
   * Must match the provider field in ModelPreset.
   */
  readonly provider: string;

  /**
   * API key (opaque string).
   * Never logged, never stored server-side, never shared across providers.
   */
  readonly apiKey: string;

  /**
   * Optional metadata for local use only.
   * Not sent to providers, not used for authentication.
   */
  readonly metadata?: CredentialMetadata;
};

/**
 * Credential store (provider → credential mapping).
 * 
 * Each provider maps to at most one credential.
 * Empty object means no credentials are stored.
 */
export type CredentialStore = {
  readonly [provider: string]: ProviderCredential | undefined;
};

/**
 * Get credential for a specific provider.
 * 
 * @param store - The credential store
 * @param provider - The provider identifier
 * @returns The credential for the provider, or undefined if not found
 */
export function getCredentialForProvider(
  store: CredentialStore,
  provider: string
): ProviderCredential | undefined {
  return store[provider];
}

/**
 * Check if a provider has a credential stored.
 * 
 * @param store - The credential store
 * @param provider - The provider identifier
 * @returns true if provider has a credential, false otherwise
 */
export function hasCredentialForProvider(
  store: CredentialStore,
  provider: string
): boolean {
  return store[provider] !== undefined;
}

/**
 * Create a new credential store with a single provider credential.
 * 
 * @param provider - The provider identifier
 * @param apiKey - The API key
 * @param metadata - Optional metadata
 * @returns A new credential store with the single credential
 */
export function createCredentialStore(
  provider: string,
  apiKey: string,
  metadata?: CredentialMetadata
): CredentialStore {
  return {
    [provider]: {
      provider,
      apiKey,
      metadata,
    },
  };
}

/**
 * Add or update a credential for a provider.
 * 
 * This creates a new store with the updated credential.
 * The original store is not modified (immutable pattern).
 * 
 * @param store - The existing credential store
 * @param credential - The credential to add or update
 * @returns A new credential store with the updated credential
 */
export function setCredentialForProvider(
  store: CredentialStore,
  credential: ProviderCredential
): CredentialStore {
  return {
    ...store,
    [credential.provider]: credential,
  };
}

/**
 * Remove a credential for a provider.
 * 
 * This creates a new store without the specified provider's credential.
 * 
 * @param store - The existing credential store
 * @param provider - The provider identifier to remove
 * @returns A new credential store without the provider's credential
 */
export function removeCredentialForProvider(
  store: CredentialStore,
  provider: string
): CredentialStore {
  const { [provider]: _, ...rest } = store;
  return rest;
}

/**
 * Get all providers that have credentials stored.
 * 
 * @param store - The credential store
 * @returns Array of provider identifiers that have credentials
 */
export function getProvidersWithCredentials(
  store: CredentialStore
): readonly string[] {
  return Object.keys(store).filter((provider) => store[provider] !== undefined);
}

