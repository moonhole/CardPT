/**
 * Credential Storage Strategy: Local First, Explicit Opt-in
 * 
 * Default behavior:
 * - Keys exist in memory only
 * - Page refresh clears them
 * 
 * Persistent storage (localStorage):
 * - Requires explicit user action ("Save locally")
 * 
 * Hard Constraints:
 * - Do NOT store keys in cookies (to avoid automatic request attachment)
 * - Do NOT auto-save keys
 * 
 * Goal: Persistence must feel like a conscious tradeoff, not a default.
 */

import type {
  CredentialStore,
  ProviderCredential,
} from "./credentials.js";

/**
 * Storage key prefix for localStorage.
 * All credential storage uses this prefix.
 */
const STORAGE_PREFIX = "cardpt_credentials_";

/**
 * In-memory credential store (default).
 * 
 * This store is ephemeral:
 * - Exists only in memory
 * - Cleared on page refresh
 * - No persistence
 */
let inMemoryStore: CredentialStore = {};

/**
 * Get the current in-memory credential store.
 * 
 * @returns The current in-memory store (may be empty)
 */
export function getInMemoryStore(): CredentialStore {
  return inMemoryStore;
}

/**
 * Set the in-memory credential store.
 * 
 * This replaces the entire in-memory store.
 * Changes are NOT persisted to localStorage.
 * 
 * @param store - The credential store to set in memory
 */
export function setInMemoryStore(store: CredentialStore): void {
  inMemoryStore = store;
}

/**
 * Clear the in-memory credential store.
 * 
 * This removes all credentials from memory.
 * Does NOT affect localStorage.
 */
export function clearInMemoryStore(): void {
  inMemoryStore = {};
}

/**
 * Get localStorage key for a specific provider.
 * 
 * @param provider - The provider identifier
 * @returns The localStorage key for the provider
 */
function getStorageKeyForProvider(provider: string): string {
  return `${STORAGE_PREFIX}${provider}`;
}

/**
 * Save a credential to localStorage (explicit opt-in).
 * 
 * This function requires explicit user action to call.
 * It persists the credential to localStorage.
 * 
 * @param credential - The credential to save
 * @throws Error if localStorage is not available
 */
export function saveCredentialToLocalStorage(
  credential: ProviderCredential
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("localStorage is not available");
  }

  const storageKey = getStorageKeyForProvider(credential.provider);
  
  // Store credential as JSON
  // Note: apiKey is stored as-is (opaque string)
  const serialized = JSON.stringify({
    provider: credential.provider,
    apiKey: credential.apiKey,
    metadata: credential.metadata,
  });

  try {
    window.localStorage.setItem(storageKey, serialized);
  } catch (err) {
    // Handle quota exceeded or other localStorage errors
    const error = new Error("Failed to save credential to localStorage");
    if (err instanceof Error) {
      error.message = `Failed to save credential to localStorage: ${err.message}`;
    }
    throw error;
  }
}

/**
 * Load a credential from localStorage.
 * 
 * @param provider - The provider identifier
 * @returns The credential if found, undefined otherwise
 */
export function loadCredentialFromLocalStorage(
  provider: string
): ProviderCredential | undefined {
  if (typeof window === "undefined" || !window.localStorage) {
    return undefined;
  }

  const storageKey = getStorageKeyForProvider(provider);
  const serialized = window.localStorage.getItem(storageKey);

  if (!serialized) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(serialized);
    
    // Validate structure
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.provider === "string" &&
      typeof parsed.apiKey === "string"
    ) {
      return {
        provider: parsed.provider,
        apiKey: parsed.apiKey,
        metadata: parsed.metadata,
      };
    }
  } catch (err) {
    // Invalid JSON or structure - treat as not found
    console.warn(`Failed to parse credential for provider ${provider}`, err);
    return undefined;
  }

  return undefined;
}

/**
 * Remove a credential from localStorage.
 * 
 * @param provider - The provider identifier
 */
export function removeCredentialFromLocalStorage(provider: string): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const storageKey = getStorageKeyForProvider(provider);
  window.localStorage.removeItem(storageKey);
}

/**
 * Load all credentials from localStorage.
 * 
 * This scans localStorage for all credential keys and loads them.
 * 
 * @returns A credential store with all loaded credentials
 */
export function loadAllCredentialsFromLocalStorage(): CredentialStore {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  const store: Record<string, ProviderCredential> = {};
  const prefix = STORAGE_PREFIX;

  // Scan localStorage for credential keys
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const provider = key.slice(prefix.length);
      const credential = loadCredentialFromLocalStorage(provider);
      if (credential) {
        store[provider] = credential;
      }
    }
  }

  return store as CredentialStore;
}

/**
 * Clear all credentials from localStorage.
 * 
 * This removes all persisted credentials.
 * Requires explicit user action.
 */
export function clearAllCredentialsFromLocalStorage(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const prefix = STORAGE_PREFIX;
  const keysToRemove: string[] = [];

  // Collect all credential keys
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  // Remove all credential keys
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

/**
 * Check if localStorage is available.
 * 
 * @returns true if localStorage is available, false otherwise
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    // Test localStorage availability
    const testKey = "__cardpt_storage_test__";
    window.localStorage.setItem(testKey, "test");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get the current active credential store (in-memory).
 * 
 * This is the default store that exists only in memory.
 * It does NOT include credentials from localStorage unless
 * explicitly loaded.
 * 
 * @returns The current in-memory credential store
 */
export function getActiveStore(): CredentialStore {
  return getInMemoryStore();
}

/**
 * Explicitly load credentials from localStorage into memory.
 * 
 * This function requires explicit user action to call.
 * It merges localStorage credentials into the in-memory store.
 * 
 * @param merge - If true, merge with existing in-memory store. If false, replace.
 */
export function loadCredentialsIntoMemory(merge: boolean = false): void {
  const persisted = loadAllCredentialsFromLocalStorage();
  
  if (merge) {
    // Merge persisted credentials into in-memory store
    const current = getInMemoryStore();
    setInMemoryStore({ ...current, ...persisted });
  } else {
    // Replace in-memory store with persisted credentials
    setInMemoryStore(persisted);
  }
}

