# Validation Principles: UI and Backend Consistency

## Core Principle

**Backend validation is authoritative. UI validation is advisory.**

The backend MUST reject invalid configurations regardless of what the UI allows or prevents. This prevents trust in the frontend from becoming a security or correctness risk.

## Rules

### UI Validation (Advisory)
- UI **may** prevent invalid selections
- UI validation provides immediate feedback to users
- UI validation improves user experience
- UI validation **cannot** be relied upon for security

### Backend Validation (Authoritative)
- Backend **must** reject invalid configurations regardless of UI
- Backend validation is the single source of truth
- Backend validation enforces security boundaries
- Backend validation must be called before any LLM invocation

## Implementation

### Backend Validation Functions

All backend code that processes seat AI configuration MUST use these functions:

1. **`validateSeatAiConfig(config)`** - Basic validation
   - Returns `SeatAiConfigValidationResult`
   - Use when you need structured validation result

2. **`validateSeatAiConfigWithFailureSemantics(config)`** - Recommended
   - Returns `AiConfigResult` with governance failure semantics
   - Use for all LLM invocation paths
   - Provides human-readable failure messages

3. **`isLlmInvocationPermitted(config)`** - Quick check
   - Returns boolean
   - Use for simple permission checks

### Required Validation Points

Backend validation MUST occur at these points:

1. **Before building decision input**
   ```typescript
   const result = validateSeatAiConfigWithFailureSemantics(config);
   if (isAiConfigFailure(result)) {
     // Refuse LLM invocation
     // Return failure message to UI
     // Allow manual control fallback
     return;
   }
   ```

2. **Before calling LLM**
   ```typescript
   if (!isLlmInvocationPermitted(config)) {
     // Skip LLM invocation
     // Fall back to manual control
     return;
   }
   ```

### UI Validation (Advisory Only)

UI code may use the same validation functions for user experience, but must understand:

- UI validation is for UX only
- Backend will re-validate everything
- UI should not prevent backend from receiving requests
- UI should display backend validation errors when they occur

## Security Guarantees

1. **No Trust in Frontend**: Backend never trusts UI validation
2. **Authoritative Enforcement**: Backend validation is always the final authority
3. **Fail-Safe Design**: Invalid configurations are rejected, not auto-corrected
4. **Visible Boundaries**: Policy failures are clearly communicated

## Examples

### ✅ Correct Backend Pattern

```typescript
// Gateway/Backend code
export async function proposeDecision(config: SeatAiConfig, input: DecisionInput) {
  // Authoritative validation - MUST happen
  const validation = validateSeatAiConfigWithFailureSemantics(config);
  
  if (isAiConfigFailure(validation)) {
    // Refuse LLM invocation
    return {
      error: validation.message,
      allowManualFallback: true
    };
  }
  
  // Only proceed if validation passes
  // ... build decision input and call LLM
}
```

### ❌ Incorrect Pattern (Trusting UI)

```typescript
// WRONG - Never do this
export async function proposeDecision(config: SeatAiConfig, input: DecisionInput) {
  // Assuming UI already validated - WRONG!
  // Backend must always validate
  // ... call LLM directly
}
```

## Policy Failure Handling

When backend validation fails:

1. **Refuse LLM invocation** - Do not call LLM
2. **Return failure message** - Provide human-readable reason
3. **Allow manual fallback** - Hand continues via manual control
4. **Do not throw** - Policy failures are not exceptions
5. **Do not auto-upgrade** - Never silently grant more authority

## Consistency Checklist

- [ ] Backend validates before building decision input
- [ ] Backend validates before calling LLM
- [ ] Backend never trusts UI validation
- [ ] Backend returns structured failure messages
- [ ] Backend allows manual fallback on failure
- [ ] UI validation is advisory only
- [ ] UI displays backend validation errors

