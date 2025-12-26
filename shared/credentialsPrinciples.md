# Credentials Principles: CardPT v0.5

## Core Philosophy

**API keys belong to the user, not the system.**

Credentials are a temporary capability bridge, not an account system.

## Fundamental Principles

### 1. User Ownership
- API keys are the user's property
- CardPT acts as a pass-through, not a custodian
- Users bring their own keys (BYOK - Bring Your Own Key)

### 2. No Server-Side Storage
- **MUST NOT** store API keys server-side
- Keys exist only in memory during active sessions
- Keys are ephemeral and session-scoped

### 3. No Key Logging
- **MUST NOT** log API keys in any form
- Keys must not appear in:
  - Application logs
  - Error messages
  - Debug output
  - Request traces
- If logging is necessary, keys must be redacted/masked

### 4. No Cross-Session Reuse
- Keys are **NOT** reused across sessions by default
- Each session requires fresh key input
- No persistent key storage or caching

## Explicit Non-Goals

CardPT v0.5 explicitly does **NOT** provide:

### Billing
- No billing system
- No cost tracking
- No usage-based pricing
- Users pay providers directly

### Quota Tracking
- No quota limits enforced by CardPT
- No usage monitoring
- No rate limiting beyond provider limits
- Provider-enforced limits apply directly

### Key Validation
- No validation beyond "does it work"
- No key format checking
- No key strength verification
- No key expiration checking
- Simple test: Can we make a request? Yes/No

## Credentials as Temporary Capability Bridge

### What Credentials Are
- **Temporary**: Exist only for the duration of a session
- **Capability Bridge**: Enable LLM invocation, nothing more
- **User-Controlled**: User provides, user manages, user owns

### What Credentials Are NOT
- **Account System**: No user accounts tied to keys
- **Identity System**: Keys don't identify users
- **Trust System**: System doesn't trust or validate keys
- **Persistence Layer**: No long-term storage

## Implementation Implications

### Session Scope
- Keys are provided at session start
- Keys are valid only for that session
- Keys are discarded when session ends

### Request Flow
1. User provides key (client-side or session input)
2. Key is used for LLM requests during session
3. Key is never stored or logged
4. Key is discarded when session ends

### Error Handling
- Key errors are passed through from provider
- No key-specific error messages that expose key details
- Failures are treated as capability unavailability, not authentication failures

## Security Model

### Trust Boundaries
- **User → CardPT**: User trusts CardPT to use key temporarily
- **CardPT → Provider**: CardPT passes key to provider
- **Provider → User**: Provider bills user directly

### Responsibility Model
- **User**: Owns keys, manages keys, responsible for usage
- **CardPT**: Pass-through only, no key custody
- **Provider**: Validates keys, enforces limits, bills user

## Design Constraints

### Must Support
- ✅ User-provided API keys
- ✅ Session-scoped key usage
- ✅ Multiple provider keys (if user has multiple)
- ✅ Key rotation (new session = new key)

### Must NOT Support
- ❌ Server-side key storage
- ❌ Key persistence across sessions
- ❌ Key validation beyond basic functionality
- ❌ Billing or quota management
- ❌ Key sharing between users
- ❌ Key management UI (beyond input)

## Goal

**Credentials enable capability, not identity.**

CardPT uses credentials to bridge user capability (their API keys) to system functionality (LLM invocation). The system never becomes a trusted proxy or key custodian. Keys are ephemeral, user-owned, and session-scoped.

