# Credential UI Semantics

## Core Principle

**Build informed trust, not implied security.**

UI should be honest about what credentials are, how they're stored, and what risks exist. Avoid security theater and false promises.

## Input Field Semantics

### API Key Input Fields

**Required Characteristics:**
- **Masked**: Password-style input (type="password" or masked display)
- **Provider-Specific**: Each provider has its own input field
- **Clear Labeling**: Label clearly indicates which provider the key is for

**Example Structure:**
```
[Provider Name] API Key
[••••••••••••••••]  [Show/Hide] [Save Locally]
```

**Field Behavior:**
- Input is masked by default
- Optional "Show/Hide" toggle for user verification
- No auto-complete or browser password manager integration
- Clear indication of which provider the key belongs to

### Input Validation

**Client-Side Validation (Advisory Only):**
- Check for empty fields
- Check for basic format (if provider-specific format known)
- Show format hints if applicable
- **Do NOT** validate key validity (that's backend's job)

**Validation Messages:**
- ✅ "Key format looks correct" (if format matches pattern)
- ✅ "Key is required for this provider"
- ❌ "Key is valid" (don't claim validity without testing)
- ❌ "Key is invalid" (don't claim invalidity without testing)

## Status Indicators

### Key Presence Indicators

**Show:**
- ✅ "Key configured" / "Key present"
- ✅ "No key configured" / "Key missing"
- ✅ "Key saved locally" (if persisted)
- ✅ "Key in memory only" (if not persisted)

**Do NOT Show:**
- ❌ "Key is valid" (can't know without testing)
- ❌ "Key is invalid" (can't know without testing)
- ❌ "Key balance: $X" (no billing/quota tracking)
- ❌ "Key expires in X days" (no expiration tracking)
- ❌ "Key has X requests remaining" (no quota tracking)

### Visual Indicators

**Key Present:**
- Green checkmark or indicator
- Text: "Configured" or "Present"
- Optional: "Saved locally" badge if persisted

**Key Absent:**
- Gray/neutral indicator
- Text: "Not configured" or "Missing"
- Optional: Prompt to configure

**Key Status Unknown:**
- Yellow/warning indicator (if applicable)
- Text: "Status unknown" or "Not tested"
- Only show if there's a reason to indicate uncertainty

## Storage Messaging

### Honest Storage Claims

**✅ Preferred Language:**

**For In-Memory Storage:**
- "Stored in memory only"
- "Cleared on page refresh"
- "Not saved to disk"
- "Temporary - cleared when you close the page"

**For LocalStorage Persistence:**
- "Saved locally on this device"
- "Stored in browser storage"
- "Persists across page refreshes"
- "Cleared on refresh unless saved locally"
- "Saved to this browser only"

**For Explicit Save Action:**
- "Save locally on this device"
- "Persist across page refreshes"
- "Store in browser storage"

**For Clearing:**
- "Clear saved keys"
- "Remove from local storage"
- "Delete saved credentials"

### Avoided Language

**❌ Security Theater Claims:**

- ❌ "Securely stored"
- ❌ "Encrypted storage"
- ❌ "Safe storage"
- ❌ "Protected storage"
- ❌ "Secure local storage"
- ❌ "Safely saved"

**❌ False Promises:**

- ❌ "Never leaves your device" (it does when sent to providers)
- ❌ "Completely secure" (nothing is completely secure)
- ❌ "Encrypted at rest" (localStorage is not encrypted)
- ❌ "Bank-level security" (security theater)

**Why Avoid:**
- These claims create false sense of security
- localStorage is not encrypted
- Keys are sent to providers over network
- Browser storage can be accessed by extensions/malware
- Honest messaging builds real trust

## Error Messaging

### Credential Failure Messages

**Use Human-Readable Messages:**
- Display the `message` field from `CredentialFailure`
- Keep provider context clear
- Explain what user can do

**Example Messages:**
- "No API key provided for Qwen. Please configure your API key to use this provider."
- "Authentication failed for Gemini. Please check your API key."
- "Rate limit exceeded for DeepSeek. Please try again later."

**Error Display:**
- Show error message prominently
- Indicate which provider failed
- Provide actionable guidance
- Allow manual control fallback

### Recovery Guidance

**For Recoverable Failures:**
- "Please check your API key"
- "Please update your API key"
- "Please configure your API key"
- Link to provider's key management page (if applicable)

**For Non-Recoverable Failures:**
- "Please try again later"
- "Provider is temporarily unavailable"
- "Rate limit will reset automatically"

## Provider Selection UI

### Provider-Specific Credential Management

**Per-Provider Sections:**
- Each provider has its own credential input section
- Clear visual separation between providers
- Provider name/logo clearly displayed
- No cross-provider credential sharing UI

**Example Layout:**
```
┌─────────────────────────────┐
│ Qwen                        │
│ [••••••••••••••••] [Save]   │
│ ✓ Configured                │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Gemini                      │
│ [••••••••••••••••] [Save]   │
│ ⚠ Not configured            │
└─────────────────────────────┘
```

## Save/Load Actions

### Explicit Save Action

**Save Button/Link:**
- Label: "Save locally" or "Save on this device"
- Tooltip/Help: "Saves key to browser storage. Persists across page refreshes."
- Requires explicit user click
- Shows confirmation after save

**Load Saved Action:**
- Label: "Load saved keys" or "Restore saved"
- Tooltip/Help: "Loads keys saved to browser storage"
- Requires explicit user click
- Shows which providers have saved keys

**Clear Action:**
- Label: "Clear saved keys" or "Delete saved"
- Tooltip/Help: "Removes all saved keys from browser storage"
- Requires confirmation dialog
- Clear messaging about what will be deleted

### Save Confirmation

**After Save:**
- "Key saved locally on this device"
- "Will persist across page refreshes"
- "Stored in browser storage only"

**After Load:**
- "Loaded X saved key(s)"
- "Keys restored from browser storage"
- List which providers were loaded

**After Clear:**
- "All saved keys cleared"
- "Keys removed from browser storage"
- "In-memory keys not affected"

## Privacy and Security Disclosures

### Honest Disclosures

**What to Disclose:**
- "Keys are stored in browser localStorage (not encrypted)"
- "Keys are sent to provider APIs over HTTPS"
- "Keys are never sent to CardPT servers"
- "Keys are cleared on page refresh unless saved locally"
- "Saved keys persist in browser storage"

**What NOT to Claim:**
- ❌ "Keys are encrypted" (localStorage is not encrypted)
- ❌ "Keys are secure" (vague, meaningless)
- ❌ "Keys never leave your device" (they do, to providers)
- ❌ "Completely private" (nothing is completely private)

### Trust Building

**Build Trust Through:**
- Honest explanations of storage mechanism
- Clear indication of what happens to keys
- Transparent about limitations
- No false security promises

**Example Disclosure:**
```
API keys are stored in your browser's localStorage.
They are sent directly to provider APIs (Qwen, Gemini, etc.)
and never sent to CardPT servers.
Keys are cleared on page refresh unless you explicitly save them.
Browser storage is not encrypted - only save keys on trusted devices.
```

## UI State Management

### Credential States

**States to Track:**
1. **Not Configured**: No key provided
2. **In Memory**: Key exists in memory, not persisted
3. **Saved Locally**: Key persisted to localStorage
4. **Loading**: Loading saved keys (if applicable)
5. **Error**: Credential failure occurred

**State Indicators:**
- Visual indicator (icon/color) for each state
- Text label describing state
- Action buttons appropriate to state

### State Transitions

**Flow:**
1. User enters key → "In Memory" state
2. User clicks "Save" → "Saved Locally" state
3. Page refresh → "Not Configured" (unless saved)
4. User clicks "Load" → "Saved Locally" state (if exists)
5. Provider error → "Error" state with message

## Accessibility

### Input Accessibility

**Required:**
- Proper label association
- ARIA labels for masked inputs
- Keyboard navigation support
- Screen reader announcements for state changes

**Example:**
```html
<label for="qwen-key">Qwen API Key</label>
<input 
  id="qwen-key"
  type="password"
  aria-label="Qwen API Key input, masked"
  aria-describedby="qwen-key-help"
/>
<span id="qwen-key-help">
  Key stored in memory only. Cleared on page refresh unless saved locally.
</span>
```

## Copy Guidelines Summary

### ✅ Do Say

- "Saved locally on this device"
- "Stored in browser storage"
- "Cleared on refresh unless saved"
- "Key configured" / "Key present"
- "Not configured" / "Key missing"
- "Saved to browser storage only"
- "Persists across page refreshes"

### ❌ Don't Say

- "Securely stored"
- "Encrypted storage"
- "Safe storage"
- "Key is valid" / "Key is invalid"
- "Key balance" / "Quota remaining"
- "Never leaves your device"
- "Completely secure"

## Goal

**Informed Trust Through Honesty**

Users should understand:
- Where keys are stored
- How keys are used
- What risks exist
- What they can control

Avoid security theater. Build real trust through transparency.

