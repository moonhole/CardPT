# Adapter Error Handling Principles

## Core Principle

**Adapters report failure; policy decides recovery.**

Adapters are "dumb wires" - they report what happened, but do not decide what to do about it.

## Error Categories

Adapters encounter three categories of errors:

### 1. Network Errors
- Connection failures
- Timeouts
- DNS resolution failures
- Network unreachable

**Adapter Behavior:**
- Propagate as structured failure
- Include error message describing the network issue
- Do NOT retry
- Do NOT fallback to other providers

### 2. HTTP Errors
- Non-2xx status codes (401, 403, 429, 500, etc.)
- Authentication failures
- Rate limiting
- Server errors

**Adapter Behavior:**
- Propagate as structured failure
- Include HTTP status code and status text
- Do NOT retry
- Do NOT fallback to other providers
- Do NOT interpret errors (e.g., don't map 401 to "credential failure" - that's Gateway's job)

### 3. Response Parsing Errors
- Invalid JSON in response body
- Missing expected fields
- Malformed response structure

**Adapter Behavior:**
- Propagate as structured failure
- Include error message describing the parsing issue
- Do NOT retry
- Do NOT fallback to other providers

## Error Propagation Pattern

All adapters MUST follow this pattern:

```typescript
async invoke(...): Promise<string> {
  try {
    // Make HTTP request
    const response = await fetch(...);
  } catch (error) {
    // Network error - propagate immediately
    throw new Error(`Network error: ${error.message}`);
  }

  // Check HTTP status
  if (!response.ok) {
    // HTTP error - propagate immediately
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  // Parse response
  try {
    const body = await response.json();
  } catch (error) {
    // Parsing error - propagate immediately
    throw new Error(`Failed to parse response: ${error.message}`);
  }

  // Extract content
  const content = extractContent(body);
  if (content === null) {
    // Missing content - propagate immediately
    throw new Error("Response does not contain text content");
  }

  return content;
}
```

## Hard Constraints

### Adapters MUST NOT:

1. **Retry requests**
   - Adapters make one attempt only
   - Retry logic belongs in policy layer (Gateway or higher)

2. **Fallback to other providers**
   - Adapters do not know about other providers
   - Fallback logic belongs in policy layer

3. **Swallow errors**
   - All errors must be propagated
   - No silent failures
   - No error recovery within adapter

4. **Interpret errors**
   - Adapters do not map HTTP codes to business meanings
   - Adapters do not distinguish between error types for business logic
   - Error interpretation belongs in Gateway layer

5. **Add retry logic**
   - No exponential backoff
   - No retry counters
   - No retry delays

### Adapters MUST:

1. **Propagate errors immediately**
   - Throw Error with descriptive message
   - Include relevant context (status code, error message, etc.)
   - Do not catch and rethrow unnecessarily

2. **Use structured error messages**
   - Format: `"Category: details"`
   - Examples:
     - `"Network error: Connection timeout"`
     - `"HTTP error: 401 Unauthorized"`
     - `"Failed to parse response body: Unexpected token"`
     - `"Response does not contain text content"`

3. **Preserve error information**
   - Include original error message when wrapping
   - Include HTTP status codes when available
   - Include relevant context

## Error Message Format

Adapters use consistent error message formats:

- **Network errors**: `"Network error: {details}"`
- **HTTP errors**: `"HTTP error: {status} {statusText}"`
- **Parsing errors**: `"Failed to parse response body: {details}"`
- **Content errors**: `"Response does not contain text content"`

## Policy Layer Responsibilities

The Gateway layer (or higher) is responsible for:

1. **Error interpretation**
   - Mapping HTTP 401/403 to credential failures
   - Mapping HTTP 429 to rate limiting
   - Deciding which errors are recoverable

2. **Retry logic**
   - Deciding when to retry
   - Implementing retry strategies
   - Managing retry counts and delays

3. **Fallback logic**
   - Deciding when to try another provider
   - Managing fallback chains
   - Handling provider unavailability

4. **Error recovery**
   - Deciding how to handle failures
   - Implementing recovery strategies
   - Managing error state

## Examples

### ✅ CORRECT: Adapter propagates error

```typescript
async invoke(...): Promise<string> {
  const response = await fetch(...);
  if (!response.ok) {
    // Adapter reports failure - policy decides recovery
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }
  return extractContent(response);
}
```

### ❌ WRONG: Adapter retries

```typescript
async invoke(...): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(...);
      if (response.ok) return extractContent(response);
    } catch (error) {
      if (i === 2) throw error;
      await sleep(1000 * (i + 1));
    }
  }
}
```

### ❌ WRONG: Adapter falls back to another provider

```typescript
async invoke(...): Promise<string> {
  try {
    return await this.callQwen(...);
  } catch (error) {
    // Adapter should not know about other providers
    return await this.callDoubao(...);
  }
}
```

### ❌ WRONG: Adapter swallows errors

```typescript
async invoke(...): Promise<string> {
  try {
    const response = await fetch(...);
    if (!response.ok) {
      // Swallowing error - policy cannot decide recovery
      return "";
    }
    return extractContent(response);
  } catch (error) {
    // Swallowing error
    return "";
  }
}
```

## Summary

**Adapters report failure; policy decides recovery.**

- Adapters: Report what happened (structured failures)
- Gateway: Decide what to do (retry, fallback, recover)

This separation ensures:
- Adapters remain simple and focused
- Policy logic is centralized and testable
- Error handling is consistent across providers
- Recovery strategies can be changed without modifying adapters

