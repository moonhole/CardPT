# Phase 6 · UI Role Boundaries
## UI Integration & UX (Settings × Runtime Feedback)

## Core Principle

**"UI is a policy mirror, not a policy engine."**

The UI reflects system constraints accurately and prevents obvious invalid configurations, but it never makes policy decisions or modifies authority. All policy enforcement happens in backend code (Phases 1-5).

## Context

Phase 1-5 have frozen:
- ✅ Authority (ActionMode × CapabilityBucket mapping)
- ✅ Policy (ModelPreset registry, validation rules)
- ✅ Credentials (access contract, failure semantics)
- ✅ Adapters (provider integration)
- ✅ Gateway decision pipeline (proposal validation, fallback)

Phase 6 integrates UI with these constraints without leaking internal complexity.

---

## UI MUST

### 1. Reflect System Constraints Accurately

**Requirement:** UI must display what the system actually enforces, not what the UI thinks should be enforced.

**Examples:**
- ✅ Show only ModelPresets that exist in the frozen registry
- ✅ Display ActionMode options exactly as defined in backend (`manual`, `llm`, etc.)
- ✅ Show capability restrictions (e.g., "L1_BASIC cannot RAISE") as informational text
- ✅ Display credential status based on backend credential contract
- ✅ Show legal actions exactly as returned by engine

**Implementation:**
- UI reads from authoritative sources (registry, engine state, gateway responses)
- UI never hardcodes constraint logic that duplicates backend validation
- UI displays backend-provided constraint information verbatim

### 2. Prevent Obvious Invalid Configurations

**Requirement:** UI should prevent users from selecting configurations that will be rejected by backend validation.

**Examples:**
- ✅ Disable or hide ModelPresets that don't match selected ActionMode capability requirements
- ✅ Show warnings when manual mode is selected but a preset is still chosen
- ✅ Prevent submission of empty required fields (advisory validation)
- ✅ Disable "Save" button when configuration is obviously invalid

**Implementation:**
- UI performs **advisory validation** (UX improvement)
- UI never claims this validation is authoritative
- Backend always validates regardless of UI behavior
- UI gracefully handles backend rejections even if UI validation passed

**Note:** This is UX convenience, not security. Backend validation is authoritative.

### 3. Explain Failures in Human Terms

**Requirement:** UI must translate backend error codes and technical messages into user-friendly explanations.

**Examples:**
- ✅ "No API key configured for Qwen. Please add your API key in settings."
- ✅ "This model (Qwen Flash) cannot raise bets. It can only fold, check, or call."
- ✅ "LLM proposal failed. Falling back to manual controls."
- ✅ "Provider error: Rate limit exceeded. Please try again later."

**Implementation:**
- UI maps backend `messageCode` values to user-friendly messages
- UI preserves technical details in developer console/logs
- UI shows actionable guidance when failures are recoverable
- UI explains fallback behavior clearly (e.g., "Manual controls enabled")

**Message Code Mapping:**
- `AI_CONFIG_INVALID` → "Seat configuration is invalid. Please check your settings."
- `CREDENTIAL_MISSING` → "API key missing. Please configure your credentials."
- `PROVIDER_ERROR` → "Provider error occurred. Please try again later."
- `INVALID_RESPONSE_FORMAT` → "LLM returned invalid response. Falling back to manual."
- `ACTION_NOT_LEGAL` → "Proposed action is not legal in current game state."
- `CAPABILITY_RESTRICTED` → "This model cannot perform this action. Capability restriction."

---

## UI MUST NOT

### 1. Infer or Modify Authority

**Requirement:** UI must never make policy decisions or change what actions/models are allowed.

**Forbidden Behaviors:**
- ❌ UI must NOT decide which models can be used with which ActionMode
- ❌ UI must NOT allow "upgrading" a model's capability level
- ❌ UI must NOT bypass capability restrictions in UI logic
- ❌ UI must NOT auto-select alternative models when one is restricted
- ❌ UI must NOT hide capability restrictions from users

**Correct Behavior:**
- ✅ UI reads ActionMode × CapabilityBucket mapping from backend
- ✅ UI disables/hides options that backend will reject
- ✅ UI shows restrictions as informational text (not enforcement)
- ✅ UI lets backend reject invalid configurations and shows the error

**Example:**
```typescript
// ❌ WRONG: UI decides capability
if (selectedPreset.capability === 'L1_BASIC') {
  // Hide RAISE button - UI is enforcing policy
}

// ✅ CORRECT: UI reflects backend constraint
// Show all legal actions from engine
// Backend will reject if capability doesn't allow RAISE
// UI shows backend's rejection message
```

### 2. Auto-Upgrade Models or Modes

**Requirement:** UI must never automatically change user selections to "fix" invalid configurations.

**Forbidden Behaviors:**
- ❌ UI must NOT auto-select a different model when selected model is invalid
- ❌ UI must NOT auto-switch ActionMode to make a preset valid
- ❌ UI must NOT silently downgrade model selection
- ❌ UI must NOT auto-retry with different providers/models

**Correct Behavior:**
- ✅ UI shows error when configuration is invalid
- ✅ UI requires user to explicitly change selection
- ✅ UI preserves user's invalid selection until they change it
- ✅ UI explains why configuration is invalid

**Example:**
```typescript
// ❌ WRONG: Auto-fix invalid config
if (!isPresetAllowed(actionMode, selectedPreset)) {
  selectedPreset = getDefaultPreset(actionMode); // Auto-upgrade
}

// ✅ CORRECT: Show error, require user action
if (!isPresetAllowed(actionMode, selectedPreset)) {
  showError("Selected model is not allowed for this ActionMode.");
  disableSaveButton();
  // User must explicitly change selection
}
```

### 3. Hide Fallback Behavior

**Requirement:** UI must always make fallback behavior visible and explainable.

**Forbidden Behaviors:**
- ❌ UI must NOT silently fallback to manual without notification
- ❌ UI must NOT hide LLM proposal failures
- ❌ UI must NOT auto-apply manual actions when LLM fails
- ❌ UI must NOT suppress error messages for "user experience"

**Correct Behavior:**
- ✅ UI shows clear error message when LLM proposal fails
- ✅ UI explains fallback to manual controls explicitly
- ✅ UI shows "Manual controls enabled" indicator
- ✅ UI preserves error messages until user acknowledges or resolves

**Example:**
```typescript
// ❌ WRONG: Silent fallback
if (llmProposalFailed) {
  enableManualControls(); // No message shown
}

// ✅ CORRECT: Explicit fallback with explanation
if (llmProposalFailed) {
  showError("LLM proposal failed: " + errorMessage);
  showMessage("Falling back to manual controls for this turn.");
  enableManualControls();
}
```

### 4. Claim Security Properties

**Requirement:** UI must never make security claims that cannot be verified or guaranteed.

**Forbidden Claims:**
- ❌ "Securely stored" (unless backend actually encrypts)
- ❌ "Encrypted storage" (unless backend actually encrypts)
- ❌ "Never leaves your device" (unless backend actually prevents transmission)
- ❌ "Completely secure" (no such thing)
- ❌ "Key is valid" (can't know without testing)

**Correct Claims:**
- ✅ "Saved locally on this device"
- ✅ "Stored in browser storage"
- ✅ "Key configured" / "Key present"
- ✅ "No key configured" / "Key missing"
- ✅ "Saved to browser storage only"

**Reference:** See `credentialUISemantics.md` for detailed credential UI guidelines.

---

## UI Architecture Principles

### 1. Read-Only Policy Display

**Principle:** UI reads policy from authoritative sources and displays it. UI never computes policy.

**Implementation:**
- UI imports `getAllPresets()` from registry (read-only)
- UI imports `isCapabilityAllowedForActionMode()` for display logic (read-only)
- UI never implements policy logic that duplicates backend validation
- UI displays backend validation results when available

### 2. Advisory Validation Only

**Principle:** UI validation improves UX but is never authoritative. Backend always validates.

**Implementation:**
- UI validates for UX (prevent obvious errors, show warnings)
- UI never claims validation is complete or authoritative
- UI gracefully handles backend rejections even if UI validation passed
- UI shows backend validation errors as the source of truth

### 3. Transparent Fallback

**Principle:** All fallback behavior is visible and explainable to users.

**Implementation:**
- UI shows error messages for all failures
- UI explains why fallback occurred
- UI shows current control state (LLM vs manual)
- UI preserves error context until resolved

### 4. Honest Security Communication

**Principle:** UI communicates security properties accurately without false promises.

**Implementation:**
- UI describes storage mechanism accurately ("browser storage", not "secure storage")
- UI describes transmission accurately ("sent to provider API", not "never leaves device")
- UI describes validation accurately ("validated by backend", not "validated locally")
- UI avoids security theater language

---

## UI Contract with Backend

### Settings Submission

**UI Sends:**
```typescript
{
  actionMode: "manual" | "llm",
  selectedPreset?: string, // Preset ID
  // ... other seat settings
}
```

**Backend Validates:**
- ActionMode is valid enum value
- SelectedPreset exists in registry (if provided)
- ActionMode × Preset capability mapping is allowed
- Credentials are available (if AI mode)

**Backend Returns:**
- Success: Configuration accepted
- Failure: `{ ok: false, reason: "...", message: "..." }`

**UI Behavior:**
- On success: Save settings, update UI
- On failure: Show error message, keep settings modal open, highlight invalid fields

### Runtime Feedback

**Gateway Returns:**
```typescript
{
  type: "ACCEPTED" | "REJECTED" | "FALLBACK",
  fallback: boolean,
  allowManualFallback: boolean,
  messageCode: string,
  message: string,
  reason?: string
}
```

**UI Displays:**
- `ACCEPTED`: Show proposal, enable "Follow AI" button
- `REJECTED`: Show error message, explain fallback, enable manual controls
- `FALLBACK`: Show fallback reason, enable manual controls

**UI Never:**
- Auto-applies rejected proposals
- Hides rejection reasons
- Suppresses fallback notifications

---

## Verification Criteria

Phase 6 is complete if and only if all of the following conditions are satisfied:

### 1. ✅ UI Reflects Backend Constraints

**Requirement:** UI displays only options that backend allows, based on authoritative sources.

**Verification:**
- ✅ UI reads ModelPresets from registry (not hardcoded)
- ✅ UI reads ActionMode options from backend enum (not hardcoded)
- ✅ UI displays capability restrictions as informational text
- ✅ UI shows legal actions from engine (not computed)

**Status:** ⏳ **PENDING VERIFICATION**

### 2. ✅ UI Performs Advisory Validation Only

**Requirement:** UI validation improves UX but never claims to be authoritative.

**Verification:**
- ✅ UI shows warnings for obviously invalid configurations
- ✅ UI disables/hides options that backend will reject
- ✅ UI gracefully handles backend rejections even if UI validation passed
- ✅ UI never claims validation is complete or authoritative

**Status:** ⏳ **PENDING VERIFICATION**

### 3. ✅ UI Never Modifies Authority

**Requirement:** UI never makes policy decisions or changes what's allowed.

**Verification:**
- ✅ UI never auto-selects alternative models
- ✅ UI never auto-changes ActionMode
- ✅ UI never bypasses capability restrictions
- ✅ UI shows backend rejections for invalid configurations

**Status:** ⏳ **PENDING VERIFICATION**

### 4. ✅ UI Never Auto-Upgrades

**Requirement:** UI never automatically changes user selections.

**Verification:**
- ✅ UI shows errors for invalid configurations
- ✅ UI requires explicit user action to fix invalid configs
- ✅ UI preserves invalid selections until user changes them
- ✅ UI never silently upgrades/downgrades models

**Status:** ⏳ **PENDING VERIFICATION**

### 5. ✅ UI Never Hides Fallback

**Requirement:** All fallback behavior is visible and explainable.

**Verification:**
- ✅ UI shows error messages for all LLM failures
- ✅ UI explains fallback to manual explicitly
- ✅ UI shows current control state (LLM vs manual)
- ✅ UI preserves error context until resolved

**Status:** ⏳ **PENDING VERIFICATION**

### 6. ✅ UI Never Claims Security Properties

**Requirement:** UI communicates security properties accurately.

**Verification:**
- ✅ UI describes storage accurately ("browser storage", not "secure storage")
- ✅ UI describes transmission accurately
- ✅ UI avoids security theater language
- ✅ UI follows `credentialUISemantics.md` guidelines

**Status:** ⏳ **PENDING VERIFICATION**

---

## Summary

**UI Role:** Policy mirror, not policy engine.

**UI Responsibilities:**
1. Reflect system constraints accurately
2. Prevent obvious invalid configurations (advisory)
3. Explain failures in human terms

**UI Prohibitions:**
1. Infer or modify authority
2. Auto-upgrade models or modes
3. Hide fallback behavior
4. Claim security properties

**Key Principle:** UI displays what backend enforces. UI never enforces what backend doesn't enforce.

