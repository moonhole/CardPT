# Credential Access Contract

## Core Principle

**Treat credentials as toxic data with minimal exposure time.**

Credentials should be handled with extreme care, exposed only when necessary, and discarded as soon as possible.

## Access Boundaries

### Frontend Access Rules

#### ✅ Allowed Operations

**Read/Write Provider-Scoped Keys:**
- Frontend may read credentials from in-memory store
- Frontend may write credentials to in-memory store
- Frontend may read/write credentials from localStorage (with explicit user action)
- Frontend may send credentials to backend per request

**Credential Management:**
- Frontend may display credential status (e.g., "Qwen key configured")
- Frontend may manage credential lifecycle (add, remove, update)
- Frontend may validate credential format (client-side only)

#### ❌ Prohibited Operations

**Must NEVER:**
- Print keys to console (even in development)
- Log keys in any form
- Include keys in error messages
- Display full keys in UI (only show masked/truncated versions)
- Store keys in cookies
- Send keys in URL parameters
- Include keys in analytics or telemetry

**Example Violations:**
```javascript
// ❌ WRONG - Never do this
console.log("API Key:", apiKey);
console.error("Failed with key:", credential.apiKey);
alert("Your key is: " + apiKey);

// ✅ CORRECT - Mask sensitive data
console.log("API Key configured:", apiKey ? "***" : "not set");
console.error("Failed to authenticate");
alert("Authentication failed");
```

### Backend / Gateway Access Rules

#### ✅ Allowed Operations

**Receive Keys Per Request:**
- Backend may receive credentials in request body
- Backend may use credentials to make provider API calls
- Backend may validate credential format (does it work?)

**Request Handling:**
- Backend may pass credentials to provider APIs
- Backend may return success/failure status
- Backend may return error messages (without exposing keys)

#### ❌ Prohibited Operations

**Must NEVER:**
- Store keys server-side (no database, no files, no memory beyond request scope)
- Echo keys in responses
- Log Authorization headers
- Log request bodies containing keys
- Cache keys across requests
- Share keys between requests
- Include keys in error responses

**Example Violations:**
```javascript
// ❌ WRONG - Never do this
console.log("Request headers:", req.headers); // Contains Authorization
app.post("/api/llm", (req, res) => {
  const key = req.body.apiKey;
  database.save(key); // Storing key
  res.json({ key }); // Echoing key
});

// ✅ CORRECT - Minimal exposure
app.post("/api/llm", (req, res) => {
  const key = req.body.apiKey;
  // Use key immediately, never store
  makeProviderRequest(key)
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: "Request failed" }));
});
```

## Hard Constraints

### 1. No Global Credential State on Server

**Rule:**
- Server must NOT maintain global credential state
- Credentials must NOT persist in server memory between requests
- Each request must provide its own credentials

**Violation Examples:**
```javascript
// ❌ WRONG - Global state
let globalApiKey = null;
app.post("/api/llm", (req, res) => {
  if (!globalApiKey) {
    globalApiKey = req.body.apiKey; // Stored globally
  }
  // Use globalApiKey...
});

// ✅ CORRECT - Per-request only
app.post("/api/llm", (req, res) => {
  const apiKey = req.body.apiKey; // Request-scoped only
  // Use apiKey immediately, discard after request
});
```

### 2. No Long-Lived Sessions Holding Keys

**Rule:**
- Server must NOT create sessions that hold credentials
- Credentials must NOT be stored in session storage
- Each request must be independent

**Violation Examples:**
```javascript
// ❌ WRONG - Session storage
app.use(session({ ... }));
app.post("/api/llm", (req, res) => {
  req.session.apiKey = req.body.apiKey; // Stored in session
  // ...
});

// ✅ CORRECT - No session storage
app.post("/api/llm", (req, res) => {
  const apiKey = req.body.apiKey; // Request-scoped only
  // Use and discard immediately
});
```

## Credential Lifecycle

### Frontend Lifecycle

1. **Input**: User provides credential (via UI input)
2. **Storage**: Credential stored in memory (or localStorage if user opts in)
3. **Usage**: Credential sent to backend per request
4. **Discard**: Credential cleared on page refresh (if in-memory)

### Backend Lifecycle

1. **Receive**: Credential received in request body
2. **Use**: Credential used immediately for provider API call
3. **Discard**: Credential discarded after request completes
4. **Never Store**: Credential never persisted server-side

## Security Best Practices

### Frontend

**Credential Masking:**
```typescript
function maskCredential(key: string | undefined): string {
  if (!key) return "not set";
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "..." + key.slice(-4);
}
```

**Safe Logging:**
```typescript
// ✅ Safe logging
console.log("Provider configured:", provider);
console.log("Has credential:", !!credential);
console.log("Credential masked:", maskCredential(credential?.apiKey));

// ❌ Unsafe logging
console.log("Credential:", credential.apiKey);
```

### Backend

**Request Handling:**
```typescript
// ✅ Safe request handling
export async function proposeDecision(
  input: DecisionInput,
  credential: ProviderCredential
) {
  // Use credential immediately
  const response = await fetch(providerUrl, {
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      // Never log this header
    },
  });
  
  // Credential is discarded after function returns
  return response.json();
}

// ❌ Unsafe request handling
export async function proposeDecision(input: DecisionInput) {
  const key = getStoredKey(); // Reading from storage
  console.log("Using key:", key); // Logging key
  // ...
}
```

**Error Handling:**
```typescript
// ✅ Safe error handling
try {
  await makeProviderRequest(credential);
} catch (err) {
  // Return generic error, never expose credential
  throw new Error("Provider request failed");
}

// ❌ Unsafe error handling
try {
  await makeProviderRequest(credential);
} catch (err) {
  // Never include credential in error
  throw new Error(`Request failed with key ${credential.apiKey}`);
}
```

## Audit Checklist

### Frontend
- [ ] No `console.log()` with credentials
- [ ] No credentials in error messages
- [ ] Credentials masked in UI display
- [ ] No credentials in URL parameters
- [ ] No credentials in cookies
- [ ] Credentials only sent in request body

### Backend
- [ ] No server-side credential storage
- [ ] No logging of Authorization headers
- [ ] No logging of request bodies with credentials
- [ ] No global credential state
- [ ] No session storage of credentials
- [ ] Credentials discarded after request
- [ ] No credentials in error responses

## Violation Detection

### Frontend Violations
- Search codebase for: `console.log.*apiKey`, `console.log.*credential`
- Check error messages for credential exposure
- Verify UI never displays full keys

### Backend Violations
- Search codebase for: `req.headers.authorization`, `Authorization.*log`
- Check for global variables holding credentials
- Verify no database/storage operations on credentials
- Check error responses for credential leakage

## Goal

**Minimal exposure time, maximum security.**

Credentials should:
- Exist in memory only (frontend) or request scope only (backend)
- Be used immediately when needed
- Be discarded as soon as possible
- Never be logged, stored, or echoed
- Be treated as toxic data requiring extreme care

