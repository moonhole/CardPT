// Phase 1-3 imports
let ACTION_MODE = null;
let getAllPresets = null;
let isCapabilityAllowedForActionMode = null;
let getAllowedCapabilitiesForActionMode = null;
let getInMemoryStore = null;
let setInMemoryStore = null;
let saveCredentialToLocalStorage = null;
let loadCredentialFromLocalStorage = null;
let loadCredentialsIntoMemory = null;
let removeCredentialFromLocalStorage = null;
let setCredentialForProvider = null;
let getCredentialForProvider = null;

const seatsEl = document.getElementById("seats");
const boardEl = document.getElementById("board");
const actionsEl = document.getElementById("actions");
const potsEl = document.getElementById("pots");
const showdownEl = document.getElementById("showdown");
const resolutionEl = document.getElementById("resolution");
const settingsBackdrop = document.getElementById("settings-backdrop");
const settingsTitle = document.getElementById("settings-title");
const settingsStack = document.getElementById("settings-stack");
const settingsMode = document.getElementById("settings-mode");
const settingsModelPreset = document.getElementById("settings-model-preset");
const settingsPresetNote = document.getElementById("settings-preset-note");
const settingsAiStyle = document.getElementById("settings-ai-style");
const settingsAiStyleNote = document.getElementById("settings-ai-style-note");
const aiSettings = document.getElementById("ai-settings");
const credentialFields = document.getElementById("credential-fields");
const settingsValidationError = document.getElementById("settings-validation-error");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSave = document.getElementById("settings-save");

const config = {
  seed: "cardpt-v0.1",
  startingStacks: [200, 200, 200, 200, 200, 200],
  smallBlind: 1,
  bigBlind: 2,
};

let engine = null;
let lastSummaryHandId = null;
let editingSeat = null;
let gameStarted = false;
let llmState = {
  turnKey: null,
  status: "idle",
  proposal: null,
  error: "",
  countdown: null, // Remaining seconds for timeout
  countdownTimer: null, // Timer ID for countdown updates
};

const PromptRegistry = {
  defaultPromptId: "balanced_amateur_v1",
  profiles: [
    {
      "id": "balanced_amateur_v1",
      "name": "Balanced Amateur (v1)",
      "description": "A typical casual player with basic intuition and moderate risk tolerance.",
      "prompt": `You are a casual poker player with some experience.
      
You are not reckless, but you are willing to bet or raise when it feels reasonable.
You sometimes check or call to control the pot, but you are not afraid to apply pressure.

You do not calculate odds precisely, but you have a basic sense of hand strength and position.
You may make imperfect decisions.
You are not trying to play optimally—just plausibly.

Avoid extreme passivity.
Avoid extreme aggression.
Play in a way that feels human and varied.
`
    },

    {
      id: "tight_rookie_v1",
      name: "Tight Rookie (v1)",
      description: "Conservative baseline for new players.",
      prompt: `You are a cautious beginner poker player.

You prefer to avoid risk and are uncomfortable
putting many chips into the pot without confidence.

You often choose safe actions like check or fold.
You rarely raise unless it feels obviously reasonable.

Do not try to be clever.
Do not think in terms of odds or expected value.
Act like a human beginner who wants to survive the hand.
`,
    },
    {
      id: "loose_rookie_v1",
      name: "Loose Rookie (v1)",
      description: "Looser baseline for new players.",
      prompt: `You are a curious beginner poker player.

You enjoy being involved in hands and
do not like folding too early.

You are willing to call just to see what happens,
even if the situation feels uncertain.

You are not trying to win efficiently.
You are playing to experience the game.
`,
    },
    {
      id: "copycat_v1",
      name: "Copycat (v1)",
      description: "Mirror recent table aggression when possible.",
      prompt: `You are a socially influenced poker player.

You tend to follow the flow of the table.
If others are active, you become more active.
If others are cautious, you also slow down.

You often mirror the previous actions at the table
instead of making an independent plan.

You want to fit in and avoid standing out.
`,
    },
    {
      id: "calm_regular_v1",
      name: "Calm Regular (v1)",
      description: "Steady and composed decision style.",
      prompt: `You are a calm, experienced regular at the table.

You play in a steady and composed manner.
You are not emotional and do not rush decisions.

You sometimes apply pressure,
but you avoid dramatic or flashy moves.

You value consistency and table rhythm
over aggressive domination.
`,
    },
  ],
};

// Initialize Phase 1-3 modules
async function initPhaseModules() {
  try {
    const actionModeMod = await import("/dist/shared/actionMode.js");
    ACTION_MODE = actionModeMod.ACTION_MODE;
    
    const presetRegistryMod = await import("/dist/shared/modelPresetRegistry.js");
    getAllPresets = presetRegistryMod.getAllPresets;
    
    const capabilityMappingMod = await import("/dist/shared/actionModeCapabilityMapping.js");
    isCapabilityAllowedForActionMode = capabilityMappingMod.isCapabilityAllowedForActionMode;
    getAllowedCapabilitiesForActionMode = capabilityMappingMod.getAllowedCapabilitiesForActionMode;
    
    const credentialStorageMod = await import("/dist/shared/credentialStorage.js");
    getInMemoryStore = credentialStorageMod.getInMemoryStore;
    setInMemoryStore = credentialStorageMod.setInMemoryStore;
    saveCredentialToLocalStorage = credentialStorageMod.saveCredentialToLocalStorage;
    loadCredentialFromLocalStorage = credentialStorageMod.loadCredentialFromLocalStorage;
    loadCredentialsIntoMemory = credentialStorageMod.loadCredentialsIntoMemory;
    removeCredentialFromLocalStorage = credentialStorageMod.removeCredentialFromLocalStorage;
    
    const credentialsMod = await import("/dist/shared/credentials.js");
    setCredentialForProvider = credentialsMod.setCredentialForProvider;
    getCredentialForProvider = credentialsMod.getCredentialForProvider;
    
    // Load credentials from localStorage into memory on initialization
    if (loadCredentialsIntoMemory) {
      loadCredentialsIntoMemory(true); // Merge with existing (if any)
    }
  } catch (err) {
    console.error("Failed to load Phase 1-3 modules:", err);
  }
}

const seatSettings = [
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
  {
    stack: 200,
    actionMode: "ai",
    selectedPresetId: "qwen-plus",
    selectedProfileId: null,
  },
];

// Compatibility mapping: UI value ↔ Internal value
// UI only exposes "manual" and "ai", but internally we use "ai_standard" for all AI modes
function normalizeActionModeForUI(actionMode) {
  // Convert internal values (ai_basic, ai_standard, ai_experimental) to UI value "ai"
  if (actionMode && actionMode.startsWith("ai_")) {
    return "ai";
  }
  return actionMode || "manual";
}

function normalizeActionModeForInternal(actionMode) {
  // Convert UI value "ai" to internal value "ai_experimental"
  // This allows all models (L1, L2, L3) to be used, which is the desired behavior
  // for the simplified "AI Assisted" mode
  if (actionMode === "ai") {
    return "ai_experimental";
  }
  // Keep manual as-is, and preserve any legacy values for compatibility
  return actionMode || "manual";
}

// Map gateway messageCode to user-friendly messages
function getUserFriendlyMessage(messageCode, fallbackMessage) {
  const messageMap = {
    "AI_CONFIG_INVALID": "Seat configuration is invalid. Please check your settings.",
    "CREDENTIAL_MISSING": "API key missing for selected provider.",
    "PROVIDER_ERROR": "Provider request failed. Please try again later.",
    "INVALID_RESPONSE_FORMAT": "AI proposal was invalid. You can act manually.",
    "RESPONSE_SCHEMA_MISMATCH": "AI proposal was invalid. You can act manually.",
    "ACTION_NOT_LEGAL": "AI proposal was invalid. You can act manually.",
    "CAPABILITY_RESTRICTED": "This model is not allowed to raise in the current mode.",
  };
  
  return messageMap[messageCode] || fallbackMessage || "AI proposal failed. You can act manually.";
}

async function requestLlmAction(_input) {
  const input = _input || {};
  const snapshot = engine ? engine.getSnapshot() : null;
  const state = snapshot ? snapshot.state : null;
  const seat = typeof input.seat === "number" ? input.seat : 0;
  const player = state ? state.players[seat] : null;

  const legalActions = Array.isArray(input.legalActions)
    ? input.legalActions
    : [];

  const controller = new AbortController();
  // Increased timeout to 30 seconds to accommodate slower LLM responses (e.g., Gemini)
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const mod = await import("/dist/engine/buildDecisionInput.js");
    const buildDecisionInput = mod.buildDecisionInput;
    const toCall =
      state && typeof state.currentBet === "number"
        ? Math.max(0, state.currentBet - state.betThisRound[state.actionSeat])
        : 0;
    // Full table stack & commitment state is required for correct poker reasoning
    const allPlayers = state && Array.isArray(state.players)
      ? state.players.map((p) => ({
          id: p.seat,
          stack: p.stack,
          committed: p.totalCommitted,
          status: p.status,
        }))
      : [];

    // Get user-selected profile or fallback to default
    const selectedProfileId = input.selectedProfileId || PromptRegistry.defaultPromptId;
    let profile = PromptRegistry.profiles.find(p => p.id === selectedProfileId);
    
    // Fallback to default if selected profile not found or has empty prompt
    if (!profile || !profile.prompt || !profile.prompt.trim()) {
      profile = PromptRegistry.profiles.find(p => p.id === PromptRegistry.defaultPromptId) || PromptRegistry.profiles[0];
    }
    
    const decisionInput = buildDecisionInput({
      engineFacts: {
        seed: snapshot ? snapshot.config.seed : null,
        handId: snapshot ? snapshot.state.handId : null,
      },
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description || "",
        prompt: profile.prompt || "",
        custom_prompt: "",
      },
      state: {
        position: state ? state.actionSeat : null,
        pot: state
          ? state.pots.reduce((sum, pot) => sum + pot.amount, 0)
          : 0,
        to_call: toCall,
        legal_actions: legalActions,
        phase: state ? state.phase : undefined,
        holeCards: player ? player.holeCards : undefined,
        board: state ? state.board : undefined,
        players: allPlayers,
      },
      legalActions,
    });

    // Get credential for the selected preset's provider
    const presetId = input.selectedPresetId;
    let credential = null;
    if (presetId && getAllPresets && getInMemoryStore) {
      const presets = getAllPresets();
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        const credentialStore = getInMemoryStore();
        credential = getCredentialForProvider ? getCredentialForProvider(credentialStore, preset.provider) : null;
      }
    }

    // TODO: DEBUG ONLY - MUST DELETE
    // Log raw LLM request data for debugging
    const requestPayload = {
      ...decisionInput,
      presetId: presetId || "qwen-plus",
      actionMode: input.actionMode || "ai_standard",
      credential: credential ? {
        provider: credential.provider,
        apiKey: credential.apiKey ? "[REDACTED]" : undefined,
        metadata: credential.metadata,
      } : undefined,
    };
    console.log("[DEBUG] Raw LLM Request (MUST DELETE):", JSON.stringify(requestPayload, null, 2));

    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        ...decisionInput,
        presetId: presetId || "qwen-plus",
        // Ensure actionMode is in internal format (ai → ai_standard)
        actionMode: input.actionMode || "ai_standard",
        credential: credential || undefined,
      }),
    });

    const responseData = await response.json();
    
    // TODO: DEBUG ONLY - MUST DELETE
    // Log raw LLM response data for debugging
    console.log("[DEBUG] Raw LLM Response (MUST DELETE):", JSON.stringify(responseData, null, 2));

    // Check for fallback or rejection
    if (responseData.fallback === true) {
      // Gateway returned fallback or rejection
      const userMessage = getUserFriendlyMessage(
        responseData.messageCode,
        responseData.error || responseData.message
      );
      throw {
        type: "gateway_rejection",
        message: userMessage,
        messageCode: responseData.messageCode,
        allowManualFallback: responseData.allowManualFallback !== false,
      };
    }

    // Check for successful decision
    if (!response.ok) {
      throw {
        type: "gateway_rejection",
        message: "AI proposal failed. You can act manually.",
        messageCode: "PROVIDER_ERROR",
        allowManualFallback: true,
      };
    }

    // Validate decision structure
    if (!responseData || !responseData.action || !responseData.reason) {
      throw {
        type: "gateway_rejection",
        message: "AI proposal was invalid. You can act manually.",
        messageCode: "RESPONSE_SCHEMA_MISMATCH",
        allowManualFallback: true,
      };
    }

    const rawType = String(responseData.action.type || "").toUpperCase();
    if (rawType === "FOLD" || rawType === "CALL" || rawType === "RAISE") {
      responseData.action.type = rawType;
    } else {
      throw {
        type: "gateway_rejection",
        message: "AI proposal was invalid. You can act manually.",
        messageCode: "ACTION_NOT_LEGAL",
        allowManualFallback: true,
      };
    }

    return responseData;
  } catch (err) {
    console.warn("[LLM] requestLlmAction failed", err);
    if (err && err.name === "AbortError") {
      throw {
        type: "gateway_rejection",
        message: "Request timed out. You can act manually.",
        messageCode: "PROVIDER_ERROR",
        allowManualFallback: true,
      };
    }
    if (err && err.type === "gateway_rejection") {
      throw err;
    }
    throw {
      type: "gateway_rejection",
      message: "AI proposal failed. You can act manually.",
      messageCode: "PROVIDER_ERROR",
      allowManualFallback: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function cardToView(code) {
  const rank = code.slice(0, 1);
  const suit = code.slice(1, 2);
  const suitMap = {
    s: { symbol: "\u2660", color: "black" },
    h: { symbol: "\u2665", color: "red" },
    d: { symbol: "\u2666", color: "red" },
    c: { symbol: "\u2663", color: "black" },
  };
  const mapped = suitMap[suit] || { symbol: "?", color: "black" };
  return { rank, suitSymbol: mapped.symbol, color: mapped.color };
}

function renderCards(container, cards) {
  container.innerHTML = "";
  if (!cards.length) {
    container.textContent = "Board: (not dealt)";
    return;
  }
  const label = document.createElement("span");
  label.textContent = "Board: ";
  container.appendChild(label);

  for (const card of cards) {
    const el = document.createElement("span");
    const view = cardToView(`${card.rank}${card.suit}`);
    el.className = `card ${view.color}`;
    el.textContent = `${view.rank}${view.suitSymbol}`;
    container.appendChild(el);
  }
}

function renderHoleCards(container, cards) {
  const holder = document.createElement("div");
  holder.className = "hole-cards";
  for (const card of cards) {
    const view = cardToView(`${card.rank}${card.suit}`);
    const el = document.createElement("span");
    el.className = `card small ${view.color}`;
    el.textContent = `${view.rank}${view.suitSymbol}`;
    holder.appendChild(el);
  }
  container.appendChild(holder);
}

function renderCardList(container, cards, sizeClass) {
  container.innerHTML = "";
  for (const card of cards) {
    const view = cardToView(`${card.rank}${card.suit}`);
    const el = document.createElement("span");
    el.className = `card ${sizeClass} ${view.color}`.trim();
    el.textContent = `${view.rank}${view.suitSymbol}`;
    container.appendChild(el);
  }
}

function getLatestHandSummary(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === "hand_summary" || events[i].type === "hand_end") {
      return events[i];
    }
  }
  return null;
}

function hasNewHandStarted(events, lastHandId) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === "hand_started") {
      return lastHandId !== null && event.handId !== lastHandId;
    }
  }
  return false;
}

// Group presets by provider for display
function groupPresetsByProvider(presets) {
  const grouped = {};
  for (const preset of presets) {
    if (!grouped[preset.provider]) {
      grouped[preset.provider] = [];
    }
    grouped[preset.provider].push(preset);
  }
  return grouped;
}

// Build mapping from preset ID to required provider
function buildModelPresetRequirements() {
  if (!getAllPresets) {
    return {};
  }
  const presets = getAllPresets();
  const mapping = {};
  for (const preset of presets) {
    mapping[preset.id] = [preset.provider];
  }
  return mapping;
}

// Update credential visibility based on selected preset
function updateCredentialVisibility(presetKey) {
  const MODEL_PRESET_REQUIREMENTS = buildModelPresetRequirements();
  const required = MODEL_PRESET_REQUIREMENTS[presetKey] ?? [];
  document.querySelectorAll(".credential-block").forEach(el => {
    el.style.display = required.includes(el.dataset.provider)
      ? "block"
      : "none";
  });
}

// Get capability requirement message for disabled preset
// Simplified: no longer shows mode requirements in UI
function getCapabilityRequirementMessage(actionMode, presetCapability) {
  // All capability checks are handled internally, no UI messages needed
  return "";
}

// Render model preset options with constraints
function renderModelPresetOptions() {
  if (!getAllPresets || !isCapabilityAllowedForActionMode) {
    settingsModelPreset.innerHTML = '<option value="">Loading presets...</option>';
    return;
  }
  
  settingsModelPreset.innerHTML = "";
  const presets = getAllPresets();
  const uiActionMode = settingsMode.value;
  // Convert UI value to internal value for capability checks
  const actionMode = normalizeActionModeForInternal(uiActionMode);
  const grouped = groupPresetsByProvider(presets);
  
  // Add default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "-- Select Model --";
  settingsModelPreset.appendChild(defaultOption);
  
  // Render grouped by provider
  const providers = Object.keys(grouped).sort();
  for (const provider of providers) {
    // Provider group label (using optgroup)
    const optgroup = document.createElement("optgroup");
    optgroup.label = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    for (const preset of grouped[provider]) {
      const option = document.createElement("option");
      option.value = preset.id;
      
      // Build display text (no experimental indicator in UI)
      const displayText = preset.displayName;
      option.textContent = displayText;
      
      // Check if preset is allowed for current ActionMode
      const isAllowed = isCapabilityAllowedForActionMode(actionMode, preset.capability);
      
      if (!isAllowed) {
        option.disabled = true;
        option.className = "preset-option-disabled";
        option.textContent += " (Not available)";
      }
      
      optgroup.appendChild(option);
    }
    
    settingsModelPreset.appendChild(optgroup);
  }
}

// Render credential fields for all providers
function renderCredentialFields() {
  if (!getAllPresets) {
    credentialFields.innerHTML = '<div class="muted">Loading credential fields...</div>';
    return;
  }
  
  credentialFields.innerHTML = "";
  const presets = getAllPresets();
  const providers = [...new Set(presets.map(p => p.provider))].sort();
  const credentialStore = getInMemoryStore ? getInMemoryStore() : {};
  
  for (const provider of providers) {
    const credential = getCredentialForProvider ? getCredentialForProvider(credentialStore, provider) : null;
    const hasKey = credential && credential.apiKey;
    
    // Check if key is saved to localStorage
    const savedLocally = loadCredentialFromLocalStorage ? loadCredentialFromLocalStorage(provider) !== undefined : false;
    
    const fieldDiv = document.createElement("div");
    fieldDiv.className = "credential-field credential-block";
    fieldDiv.setAttribute("data-provider", provider);
    
    const label = document.createElement("label");
    label.textContent = `${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key`;
    fieldDiv.appendChild(label);
    
    const inputGroup = document.createElement("div");
    inputGroup.className = "credential-input-group";
    
    const input = document.createElement("input");
    input.type = "password";
    input.id = `credential-${provider}`;
    input.placeholder = hasKey ? "••••••••" : "Enter API key";
    if (hasKey) {
      input.value = credential.apiKey;
    }
    
    // Show/Hide toggle button
    const showHideBtn = document.createElement("button");
    showHideBtn.type = "button";
    showHideBtn.textContent = "Show";
    showHideBtn.style.fontSize = "11px";
    showHideBtn.style.padding = "4px 8px";
    showHideBtn.onclick = () => {
      if (input.type === "password") {
        input.type = "text";
        showHideBtn.textContent = "Hide";
      } else {
        input.type = "password";
        showHideBtn.textContent = "Show";
      }
    };
    
    inputGroup.appendChild(input);
    inputGroup.appendChild(showHideBtn);
    
    // Save to memory button
    const saveMemoryBtn = document.createElement("button");
    saveMemoryBtn.textContent = "Save";
    saveMemoryBtn.type = "button";
    saveMemoryBtn.onclick = () => {
      const key = input.value.trim();
      if (!key) {
        alert("Please enter an API key");
        return;
      }
      if (setCredentialForProvider && setInMemoryStore) {
        const newStore = setCredentialForProvider(credentialStore, {
          provider,
          apiKey: key,
        });
        setInMemoryStore(newStore);
        renderCredentialFields(); // Refresh display
      }
    };
    inputGroup.appendChild(saveMemoryBtn);
    
    // Save locally checkbox
    const saveLocalLabel = document.createElement("label");
    saveLocalLabel.style.display = "flex";
    saveLocalLabel.style.alignItems = "center";
    saveLocalLabel.style.gap = "6px";
    saveLocalLabel.style.fontSize = "11px";
    saveLocalLabel.style.marginTop = "4px";
    saveLocalLabel.style.cursor = "pointer";
    
    const saveLocalCheckbox = document.createElement("input");
    saveLocalCheckbox.type = "checkbox";
    saveLocalCheckbox.id = `save-local-${provider}`;
    saveLocalCheckbox.checked = savedLocally;
    saveLocalCheckbox.onchange = () => {
      const key = input.value.trim();
      if (saveLocalCheckbox.checked) {
        // Save to localStorage
        if (!key && hasKey) {
          // Use existing key from memory
          if (saveCredentialToLocalStorage && credential) {
            try {
              saveCredentialToLocalStorage(credential);
              renderCredentialFields(); // Refresh display
            } catch (err) {
              console.warn("Failed to save credential to localStorage:", err);
              saveLocalCheckbox.checked = false;
              alert("Failed to save locally. Key may be too large or storage unavailable.");
            }
          }
        } else if (key) {
          // Save new key to localStorage
          if (saveCredentialToLocalStorage) {
            try {
              saveCredentialToLocalStorage({
                provider,
                apiKey: key,
              });
              // Also save to memory
              if (setCredentialForProvider && setInMemoryStore) {
                const newStore = setCredentialForProvider(credentialStore, {
                  provider,
                  apiKey: key,
                });
                setInMemoryStore(newStore);
              }
              renderCredentialFields(); // Refresh display
            } catch (err) {
              console.warn("Failed to save credential to localStorage:", err);
              saveLocalCheckbox.checked = false;
              alert("Failed to save locally. Key may be too large or storage unavailable.");
            }
          }
        } else {
          saveLocalCheckbox.checked = false;
          alert("Please enter an API key first");
        }
      } else {
        // Remove from localStorage
        if (removeCredentialFromLocalStorage) {
          removeCredentialFromLocalStorage(provider);
          renderCredentialFields(); // Refresh display
        }
      }
    };
    
    const saveLocalText = document.createElement("span");
    saveLocalText.textContent = "Save locally on this device";
    saveLocalLabel.appendChild(saveLocalCheckbox);
    saveLocalLabel.appendChild(saveLocalText);
    
    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.type = "button";
    clearBtn.style.fontSize = "11px";
    clearBtn.style.padding = "4px 8px";
    clearBtn.style.opacity = hasKey ? "1" : "0.5";
    clearBtn.disabled = !hasKey;
    clearBtn.onclick = () => {
      if (confirm(`Clear API key for ${provider}?`)) {
        // Clear from memory
        if (setCredentialForProvider && setInMemoryStore) {
          const { [provider]: _, ...rest } = credentialStore;
          setInMemoryStore(rest);
        }
        // Clear from localStorage
        if (removeCredentialFromLocalStorage) {
          removeCredentialFromLocalStorage(provider);
        }
        input.value = "";
        renderCredentialFields(); // Refresh display
      }
    };
    inputGroup.appendChild(clearBtn);
    
    fieldDiv.appendChild(inputGroup);
    fieldDiv.appendChild(saveLocalLabel);
    
    // Status indicator
    const status = document.createElement("div");
    status.className = "credential-status";
    if (hasKey) {
      if (savedLocally) {
        status.textContent = "Key present (saved on this device)";
        status.style.color = "#6fb3ff";
      } else {
        status.textContent = "Key present (memory only - cleared on refresh unless saved)";
        status.style.color = "#9fb0ba";
      }
    } else {
      status.textContent = "Key not set";
      status.style.color = "#6a7a84";
    }
    fieldDiv.appendChild(status);
    
    credentialFields.appendChild(fieldDiv);
  }
  
  // Update credential visibility based on current preset selection
  updateCredentialVisibility(settingsModelPreset.value);
}

// Render AI Style options in settings
function renderAiStyleOptions() {
  if (!settingsAiStyle) return;
  
  settingsAiStyle.innerHTML = "";
  
  for (const profile of PromptRegistry.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    settingsAiStyle.appendChild(option);
  }
}

// Update AI Style note based on selection
function updateAiStyleNote() {
  if (!settingsAiStyleNote || !settingsAiStyle) return;
  
  const selectedId = settingsAiStyle.value;
  const profile = PromptRegistry.profiles.find(p => p.id === selectedId);
  
  if (profile) {
    settingsAiStyleNote.textContent = profile.description || "";
  } else {
    settingsAiStyleNote.textContent = "";
  }
}

// Update preset note based on selection
function updatePresetNote() {
  if (!getAllPresets) {
    settingsPresetNote.textContent = "";
    return;
  }
  
  const selectedId = settingsModelPreset.value;
  const uiActionMode = settingsMode.value;
  
  if (!selectedId) {
    settingsPresetNote.textContent = "No model selected";
    return;
  }
  
  const presets = getAllPresets();
  const preset = presets.find(p => p.id === selectedId);
  
  if (!preset) {
    settingsPresetNote.textContent = "Unknown preset";
    return;
  }
  
  // Convert UI value to internal value for capability checks
  const actionMode = normalizeActionModeForInternal(uiActionMode);
  const isAllowed = isCapabilityAllowedForActionMode(actionMode, preset.capability);
  
  if (!isAllowed) {
    settingsPresetNote.textContent = "⚠ Model not available";
    settingsPresetNote.style.color = "#e07272";
  } else {
    // Simplified note: no capability or experimental indicators
    settingsPresetNote.textContent = `Selected: ${preset.displayName}`;
    settingsPresetNote.style.color = "#9fb0ba";
  }
}

// Validate seat configuration
function validateSeatConfiguration() {
  const uiActionMode = settingsMode.value;
  const selectedPresetId = settingsModelPreset.value;
  
  // Manual mode: no preset required
  if (uiActionMode === "manual") {
    return { ok: true };
  }
  
  // AI modes: preset required
  if (!selectedPresetId) {
    return {
      ok: false,
      message: "Please select a model preset for AI mode",
    };
  }
  
  // Check capability constraint (using internal actionMode)
  if (!getAllPresets || !isCapabilityAllowedForActionMode) {
    return { ok: true }; // Can't validate without modules
  }
  
  const presets = getAllPresets();
  const preset = presets.find(p => p.id === selectedPresetId);
  
  if (!preset) {
    return {
      ok: false,
      message: "Selected preset not found",
    };
  }
  
  // Convert UI value to internal value for capability check
  const actionMode = normalizeActionModeForInternal(uiActionMode);
  const isAllowed = isCapabilityAllowedForActionMode(actionMode, preset.capability);
  
  if (!isAllowed) {
    return {
      ok: false,
      message: "Selected model is not available",
    };
  }
  
  return { ok: true };
}

function openSettings(seatIndex) {
  editingSeat = seatIndex;
  const settings = seatSettings[seatIndex];
  settingsTitle.textContent = `Seat ${seatIndex} Settings`;
  settingsStack.value = String(settings.stack);
  // Normalize actionMode for UI display (convert internal ai_* to "ai")
  settingsMode.value = normalizeActionModeForUI(settings.actionMode || "manual");
  
  // Show/hide AI settings based on mode
  aiSettings.style.display = settingsMode.value === "manual" ? "none" : "block";
  
  // Render AI Style options and set selected value
  renderAiStyleOptions();
  settingsAiStyle.value = settings.selectedProfileId || PromptRegistry.defaultPromptId;
  updateAiStyleNote();
  
  // Render model preset options
  renderModelPresetOptions();
  settingsModelPreset.value = settings.selectedPresetId || "";
  
  // Render credential fields
  renderCredentialFields();
  
  // Update credential visibility based on current preset selection
  updateCredentialVisibility(settingsModelPreset.value);
  
  // Update notes
  updatePresetNote();
  
  // Clear validation error
  settingsValidationError.style.display = "none";
  
  settingsBackdrop.style.display = "flex";
}

function closeSettings() {
  editingSeat = null;
  settingsBackdrop.style.display = "none";
  settingsValidationError.style.display = "none";
}

settingsCancel.addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", (event) => {
  if (event.target === settingsBackdrop) {
    event.preventDefault();
    event.stopPropagation();
  }
});

settingsSave.addEventListener("click", () => {
  if (editingSeat === null) {
    closeSettings();
    return;
  }
  
  // Validate configuration
  const validation = validateSeatConfiguration();
  if (!validation.ok) {
    settingsValidationError.textContent = validation.message;
    settingsValidationError.style.display = "block";
    return;
  }
  
  const stackValue = Number(settingsStack.value);
  const uiActionMode = settingsMode.value;
  // Convert UI value to internal value (ai → ai_experimental)
  const actionMode = normalizeActionModeForInternal(uiActionMode);
  const selectedPresetId = settingsModelPreset.value || null;
  const selectedProfileId = settingsAiStyle.value || PromptRegistry.defaultPromptId;
  
  seatSettings[editingSeat] = {
    stack: Number.isFinite(stackValue) && stackValue >= 0 ? stackValue : 0,
    actionMode: actionMode,
    selectedPresetId: uiActionMode === "manual" ? null : selectedPresetId,
    selectedProfileId: uiActionMode === "manual" ? null : selectedProfileId,
  };
  
  closeSettings();
  
  // Update UI
  if (gameStarted && engine) {
    render();
  } else {
    renderPreGame();
  }
});

settingsMode.addEventListener("change", () => {
  const uiActionMode = settingsMode.value;
  aiSettings.style.display = uiActionMode === "manual" ? "none" : "block";
  
  // Convert UI value to internal value for capability checks
  const actionMode = normalizeActionModeForInternal(uiActionMode);
  
  // Re-render preset options to update disabled states
  renderModelPresetOptions();
  
  // Check if current preset is still valid
  const selectedPresetId = settingsModelPreset.value;
  if (selectedPresetId && getAllPresets && isCapabilityAllowedForActionMode) {
    const presets = getAllPresets();
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && !isCapabilityAllowedForActionMode(actionMode, preset.capability)) {
      // Preset is no longer valid - clear selection and show warning
      settingsModelPreset.value = "";
      settingsValidationError.textContent = `Selected model is not allowed. Please select a different model.`;
      settingsValidationError.style.display = "block";
    }
  }
  
  updatePresetNote();
});

settingsModelPreset.addEventListener("change", () => {
  updatePresetNote();
  // Update credential visibility based on selected preset
  updateCredentialVisibility(settingsModelPreset.value);
  // Clear validation error when user changes selection
  settingsValidationError.style.display = "none";
});

settingsAiStyle.addEventListener("change", () => {
  updateAiStyleNote();
});

async function loadEngine() {
  try {
    const mod = await import("/dist/engine/index.js");
    engine = mod.createEngine(config);
    gameStarted = true;
    render();
  } catch (err) {
    actionsEl.textContent =
      "Build the engine (tsc) before loading the UI.";
  }
}

function render() {
  if (!gameStarted || !engine) {
    renderPreGame();
    return;
  }
  const snapshot = engine.getSnapshot();
  const state = snapshot.state;

  seatsEl.innerHTML = "";
  const seatClasses = [
    "seat top-left",
    "seat top-right",
    "seat right",
    "seat bottom-right",
    "seat bottom-left",
    "seat left",
  ];
  for (const player of state.players) {
    const seat = document.createElement("div");
    seat.className = seatClasses[player.seat] || "seat";
    if (player.seat === state.actionSeat && state.phase !== "ended") {
      seat.style.borderColor = "#6fb3ff";
    }
    const header = document.createElement("div");
    header.className = "seat-header";
    const seatInfo = document.createElement("div");
    seatInfo.className = "seat-info";

    // Seat number and state badges
    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";
    const seatLabel = document.createElement("span");
    seatLabel.style.fontSize = "11px";
    seatLabel.style.fontWeight = "600";
    seatLabel.style.color = "#d4e4f0";
    seatLabel.textContent = `Seat ${player.seat}`;
    badgeRow.appendChild(seatLabel);
    if (player.seat === state.dealerSeat) {
      const dealerBadge = document.createElement("span");
      dealerBadge.className = "badge dealer";
      dealerBadge.textContent = "Dealer";
      badgeRow.appendChild(dealerBadge);
    }
    const statusBadge = document.createElement("span");
    statusBadge.className = `badge status-${player.status}`;
    statusBadge.textContent = player.status;
    badgeRow.appendChild(statusBadge);
    
    seatInfo.appendChild(badgeRow);

    // Numeric fields as aligned text rows
    const stackRow = document.createElement("div");
    stackRow.className = "info-row";
    const stackLabel = document.createElement("span");
    stackLabel.className = "info-label";
    stackLabel.textContent = "Stack";
    const stackValue = document.createElement("span");
    stackValue.className = "info-value";
    stackValue.textContent = String(player.stack);
    stackRow.appendChild(stackLabel);
    stackRow.appendChild(stackValue);
    seatInfo.appendChild(stackRow);

    const committedRow = document.createElement("div");
    committedRow.className = "info-row";
    const committedLabel = document.createElement("span");
    committedLabel.className = "info-label";
    committedLabel.textContent = "Committed";
    const committedValue = document.createElement("span");
    committedValue.className = "info-value";
    committedValue.textContent = String(player.totalCommitted);
    committedRow.appendChild(committedLabel);
    committedRow.appendChild(committedValue);
    seatInfo.appendChild(committedRow);

    // Model preset info (if AI mode) - as text row
    const internalActionMode = seatSettings[player.seat].actionMode;
    const actionMode = normalizeActionModeForUI(internalActionMode);
    if (actionMode && actionMode !== "manual") {
      const presetRow = document.createElement("div");
      presetRow.className = "info-row";
      const presetLabel = document.createElement("span");
      presetLabel.className = "info-label";
      presetLabel.textContent = "Model";
      const presetValue = document.createElement("span");
      presetValue.className = "info-value";
      presetValue.style.fontSize = "10px";
      const presetId = seatSettings[player.seat].selectedPresetId;
      if (presetId && getAllPresets) {
        const presets = getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
          // No experimental indicator in UI
          presetValue.textContent = preset.displayName;
        } else {
          presetValue.textContent = presetId;
        }
      } else {
        presetValue.textContent = "Qwen Plus";
      }
      presetRow.appendChild(presetLabel);
      presetRow.appendChild(presetValue);
      seatInfo.appendChild(presetRow);

      // Style/Profile info - as text row
      const styleRow = document.createElement("div");
      styleRow.className = "info-row";
      const styleLabel = document.createElement("span");
      styleLabel.className = "info-label";
      styleLabel.textContent = "Style";
      const styleValue = document.createElement("span");
      styleValue.className = "info-value";
      styleValue.style.fontSize = "10px";
      const selectedProfileId = seatSettings[player.seat].selectedProfileId || PromptRegistry.defaultPromptId;
      const activeProfile = PromptRegistry.profiles.find(p => p.id === selectedProfileId) || PromptRegistry.profiles[0];
      styleValue.textContent = activeProfile ? activeProfile.name : "Unknown";
      styleRow.appendChild(styleLabel);
      styleRow.appendChild(styleValue);
      seatInfo.appendChild(styleRow);
    }

    // Pending stack change - as text row
    const pendingStackChange = seatSettings[player.seat].stack !== config.startingStacks[player.seat];
    if (pendingStackChange) {
      const pendingRow = document.createElement("div");
      pendingRow.className = "info-row";
      const pendingLabel = document.createElement("span");
      pendingLabel.className = "info-label";
      pendingLabel.style.fontStyle = "italic";
      pendingLabel.textContent = "Next hand";
      const pendingValue = document.createElement("span");
      pendingValue.className = "info-value";
      pendingValue.style.fontStyle = "italic";
      pendingValue.textContent = String(seatSettings[player.seat].stack);
      pendingRow.appendChild(pendingLabel);
      pendingRow.appendChild(pendingValue);
      seatInfo.appendChild(pendingRow);
    }

    const settingsButton = document.createElement("button");
    settingsButton.className = "settings-btn";
    settingsButton.textContent = "🔧";
    settingsButton.onclick = () => openSettings(player.seat);
    header.appendChild(seatInfo);
    header.appendChild(settingsButton);
    seat.appendChild(header);
    // Reserved card area - always exists to maintain stable seat card height
    const cardArea = document.createElement("div");
    cardArea.className = "card-area";
    seat.appendChild(cardArea);
    renderHoleCards(cardArea, player.holeCards);
    seatsEl.appendChild(seat);
  }

  renderCards(boardEl, state.board);

  renderActions();
  renderSummary(snapshot);
}

function renderActions() {
  actionsEl.innerHTML = "";
  if (!engine) {
    return;
  }
  const snapshot = engine.getSnapshot();
  const state = snapshot.state;
  const internalActionMode = seatSettings[state.actionSeat]?.actionMode || "manual";
  const actionMode = normalizeActionModeForUI(internalActionMode);
  const isAiMode = actionMode && actionMode !== "manual";
  const turnKey = `${state.handId}:${state.phase}:${state.actionSeat}:${snapshot.actionHistory.length}`;

  if (state.phase === "ended") {
    const button = document.createElement("button");
    button.textContent = "Next Hand";
    button.onclick = () => {
      const updatedStacks = seatSettings.map((setting) => setting.stack);
      const needsReset = updatedStacks.some(
        (stack, index) => stack !== config.startingStacks[index]
      );
      if (needsReset) {
        config.startingStacks = [...updatedStacks];
        engine = null;
        lastSummaryHandId = null;
        loadEngine();
        return;
      }
      engine.startNextHand();
      render();
    };
    actionsEl.appendChild(button);
    return;
  }

  if (llmState.turnKey !== turnKey) {
    // Clear any existing countdown timer
    if (llmState.countdownTimer) {
      clearInterval(llmState.countdownTimer);
    }
    llmState = { turnKey, status: "idle", proposal: null, error: "", countdown: null, countdownTimer: null };
  }

  if (isAiMode) {
    const legal = engine.getLegalActions();

    if (llmState.status === "idle") {
      llmState.status = "loading";
      // Start countdown timer (30 seconds)
      llmState.countdown = 30;
      llmState.countdownTimer = setInterval(() => {
        if (llmState.countdown > 0) {
          llmState.countdown--;
          render(); // Re-render to update countdown display
        } else {
          clearInterval(llmState.countdownTimer);
          llmState.countdownTimer = null;
        }
      }, 1000);
      // Use internal actionMode for LLM request (ai → ai_experimental)
      const requestActionMode = normalizeActionModeForInternal(actionMode);
      requestLlmAction({
        seat: state.actionSeat,
        legalActions: legal,
        actionMode: requestActionMode,
        selectedPresetId: seatSettings[state.actionSeat]?.selectedPresetId,
        selectedProfileId: seatSettings[state.actionSeat]?.selectedProfileId,
      })
        .then((proposal) => {
          // Clear countdown timer
          if (llmState.countdownTimer) {
            clearInterval(llmState.countdownTimer);
            llmState.countdownTimer = null;
          }
          llmState.countdown = null;
          
          const resolved = resolveLlmDecision(proposal, legal);
          if (!resolved.ok) {
            llmState = {
              turnKey,
              status: "manual",
              proposal: null,
              error: resolved.error,
              countdown: null,
              countdownTimer: null,
            };
            render();
            return;
          }

          llmState = {
            turnKey,
            status: "proposed",
            proposal: {
              ...proposal,
              action: resolved.action, // 已保证可执行
            },
            error: "",
            countdown: null,
            countdownTimer: null,
          };
          render();
        })
        .catch((err) => {
          // Clear countdown timer
          if (llmState.countdownTimer) {
            clearInterval(llmState.countdownTimer);
            llmState.countdownTimer = null;
          }
          llmState.countdown = null;
          
          console.warn("[LLM] proposal failed branch", err);
          // Extract user-friendly message from gateway rejection
          let errorMessage = "AI proposal failed. You can act manually.";
          if (err && err.type === "gateway_rejection" && err.message) {
            errorMessage = err.message;
          } else if (err && err.message) {
            // Fallback to error message if available
            errorMessage = err.message;
          }
          
          llmState = {
            turnKey,
            status: "manual",
            proposal: null,
            error: errorMessage,
            countdown: null,
            countdownTimer: null,
          };
          render();
        });
    }

    if (llmState.status === "loading") {
      const panel = document.createElement("div");
      panel.className = "llm-panel";
      
      // Show control state clearly
      const controlState = document.createElement("div");
      controlState.style.fontSize = "11px";
      controlState.style.color = "#6fb3ff";
      controlState.style.marginBottom = "8px";
      controlState.style.fontWeight = "600";
      controlState.style.textTransform = "uppercase";
      controlState.style.letterSpacing = "0.5px";
      
      const presetId = seatSettings[state.actionSeat]?.selectedPresetId;
      let modelName = "AI";
      if (presetId && getAllPresets) {
        const presets = getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
          modelName = preset.displayName;
        }
      }
      // Display actual profile being used (user-selected or default)
      const selectedProfileId = seatSettings[state.actionSeat]?.selectedProfileId || PromptRegistry.defaultPromptId;
      const activeProfile = PromptRegistry.profiles.find(p => p.id === selectedProfileId) || PromptRegistry.profiles[0];
      const profileName = activeProfile ? activeProfile.name : "Balanced Amateur (v1)";
      const controlText = `AI Control: ${modelName} • Style: ${profileName}`;
      controlState.textContent = controlText;
      panel.appendChild(controlState);
      
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "AI Decision";
      title.style.marginBottom = "8px";
      title.style.fontSize = "13px";
      title.style.color = "#9fb0ba";
      panel.appendChild(title);
      const body = document.createElement("div");
      body.style.fontSize = "12px";
      body.style.color = "#9fb0ba";
      body.style.fontStyle = "italic";
      
      // Show countdown if available
      if (llmState.countdown !== null && llmState.countdown > 0) {
        const countdownText = document.createElement("span");
        countdownText.style.color = "#6fb3ff";
        countdownText.style.fontWeight = "600";
        countdownText.textContent = `${llmState.countdown}s`;
        body.appendChild(countdownText);
        body.appendChild(document.createTextNode(" remaining • "));
      }
      body.appendChild(document.createTextNode("Awaiting proposal..."));
      panel.appendChild(body);
      actionsEl.appendChild(panel);
      return;
    }

    if (llmState.status === "proposed") {
      const panel = document.createElement("div");
      panel.className = "llm-panel";

      // Show control state clearly
      const controlState = document.createElement("div");
      controlState.style.fontSize = "11px";
      controlState.style.color = "#6fb3ff";
      controlState.style.marginBottom = "8px";
      controlState.style.fontWeight = "600";
      controlState.style.textTransform = "uppercase";
      controlState.style.letterSpacing = "0.5px";
      
      const presetId = seatSettings[state.actionSeat]?.selectedPresetId;
      let modelName = "AI";
      if (presetId && getAllPresets) {
        const presets = getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
          modelName = preset.displayName;
        }
      }
      // Display actual profile being used (user-selected or default)
      const selectedProfileId = seatSettings[state.actionSeat]?.selectedProfileId || PromptRegistry.defaultPromptId;
      const activeProfile = PromptRegistry.profiles.find(p => p.id === selectedProfileId) || PromptRegistry.profiles[0];
      const profileName = activeProfile ? activeProfile.name : "Balanced Amateur (v1)";
      const controlText = `AI Control: ${modelName} • Style: ${profileName}`;
      controlState.textContent = controlText;
      panel.appendChild(controlState);

      // Title: "AI Decision" - secondary header
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "AI Decision";
      title.style.marginBottom = "10px";
      title.style.fontSize = "13px";
      title.style.color = "#9fb0ba";
      panel.appendChild(title);

      // Action-first hierarchy: Most prominent element
      const actionDisplay = document.createElement("div");
      actionDisplay.style.fontSize = "28px";
      actionDisplay.style.fontWeight = "700";
      actionDisplay.style.marginBottom = "16px";
      actionDisplay.style.letterSpacing = "0.5px";
      const actionType = String(llmState.proposal.action.type || "");
      const rawAmount = llmState.proposal.action.amount;
      const amount =
        (actionType.toUpperCase() === "RAISE" || actionType.toUpperCase() === "BET") && Number.isFinite(rawAmount) && rawAmount > 0
          ? rawAmount
          : null;
      const amountPart = amount === null ? "" : ` ${amount}`;
      // Semantic color: RAISE/BET more intense, FOLD subdued
      if (actionType.toUpperCase() === "RAISE" || actionType.toUpperCase() === "BET") {
        actionDisplay.style.color = "#e6eef3";
      } else if (actionType.toUpperCase() === "FOLD") {
        actionDisplay.style.color = "#9fb0ba";
      } else {
        actionDisplay.style.color = "#d4e4f0";
      }
      actionDisplay.textContent = actionType.toUpperCase() + amountPart;
      panel.appendChild(actionDisplay);

      // Why? section: Short judgment sentences from drivers
      const whySection = document.createElement("div");
      whySection.style.marginBottom = "14px";
      const whyTitle = document.createElement("div");
      whyTitle.style.fontWeight = "600";
      whyTitle.style.marginBottom = "8px";
      whyTitle.style.fontSize = "13px";
      whyTitle.style.color = "#d4e4f0";
      whyTitle.textContent = "Why?";
      whySection.appendChild(whyTitle);

      const drivers = Array.isArray(llmState.proposal.reason.drivers)
        ? llmState.proposal.reason.drivers
        : [];
      if (drivers.length > 0) {
        const sorted = [...drivers].sort((a, b) => b.weight - a.weight);
        // Convert top drivers to short judgment sentences
        const topDrivers = sorted.slice(0, 3);
        const reasonsList = document.createElement("div");
        reasonsList.style.paddingLeft = "0";
        reasonsList.style.lineHeight = "1.5";
        for (const driver of topDrivers) {
          const reasonItem = document.createElement("div");
          reasonItem.style.marginBottom = "5px";
          reasonItem.style.fontSize = "12px";
          reasonItem.style.color = "#c4d4e0";
          reasonItem.textContent = `• ${formatDriverAsJudgment(driver.key)}`;
          reasonsList.appendChild(reasonItem);
        }
        whySection.appendChild(reasonsList);
      }
      panel.appendChild(whySection);

      // AI Thought: Optional, visually secondary
      if (llmState.proposal.reason.line) {
        const thoughtSection = document.createElement("div");
        thoughtSection.style.marginTop = "14px";
        thoughtSection.style.marginBottom = "14px";
        thoughtSection.style.paddingTop = "12px";
        thoughtSection.style.borderTop = "1px solid #1f2a33";
        const thoughtLabel = document.createElement("div");
        thoughtLabel.style.fontWeight = "500";
        thoughtLabel.style.marginBottom = "6px";
        thoughtLabel.style.fontSize = "11px";
        thoughtLabel.style.color = "#7a8a94";
        thoughtLabel.style.textTransform = "uppercase";
        thoughtLabel.style.letterSpacing = "0.5px";
        thoughtLabel.textContent = "AI Thought";
        thoughtSection.appendChild(thoughtLabel);
        const thoughtText = document.createElement("div");
        thoughtText.style.fontSize = "12px";
        thoughtText.style.fontStyle = "italic";
        thoughtText.style.color = "#9fb0ba";
        thoughtText.style.lineHeight = "1.4";
        thoughtText.textContent = `"${llmState.proposal.reason.line}"`;
        thoughtSection.appendChild(thoughtText);
        panel.appendChild(thoughtSection);
      }

      // Player-centric buttons - unified styling
      const controls = document.createElement("div");
      controls.className = "actions";
      const followButton = document.createElement("button");
      followButton.textContent = "Follow AI";
      followButton.style.fontWeight = "600";
      followButton.onclick = () => {
        // Clear countdown timer when following AI proposal
        if (llmState.countdownTimer) {
          clearInterval(llmState.countdownTimer);
        }
        engine.applyAction({
          actor: state.actionSeat,
          type: actionType.toLowerCase(),
          amount: amount === null ? null : Number(amount),
        });
        llmState = { turnKey: null, status: "idle", proposal: null, error: "", countdown: null, countdownTimer: null };
        render();
      };
      const controlButton = document.createElement("button");
      controlButton.textContent = "Take control";
      controlButton.style.fontWeight = "500";
      controlButton.style.opacity = "0.85";
      controlButton.onclick = () => {
        // Clear countdown timer when user takes manual control
        if (llmState.countdownTimer) {
          clearInterval(llmState.countdownTimer);
        }
        llmState = {
          turnKey,
          status: "manual",
          proposal: null,
          error: "LLM proposal canceled. Manual controls enabled for this turn.",
          countdown: null,
          countdownTimer: null,
        };
        render();
      };
      controls.appendChild(followButton);
      controls.appendChild(controlButton);
      panel.appendChild(controls);
      actionsEl.appendChild(panel);
      return;
    }
  }

  // Create fixed-height message container to prevent button layout shift
  // This ensures buttons maintain consistent position whether fallback message is shown or not
  const messageContainer = document.createElement("div");
  messageContainer.style.minHeight = "120px"; // Fixed height to prevent layout shift
  messageContainer.style.marginBottom = "12px";
  
  // Insert fallback panel if AI mode failed and switched to manual
  if (isAiMode && llmState.status === "manual") {
    const panel = document.createElement("div");
    panel.className = "llm-panel";
    
    // Show control state transition clearly
    const controlState = document.createElement("div");
    controlState.style.fontSize = "11px";
    controlState.style.color = "#e6a872";
    controlState.style.marginBottom = "8px";
    controlState.style.fontWeight = "600";
    controlState.style.textTransform = "uppercase";
    controlState.style.letterSpacing = "0.5px";
    controlState.textContent = "Manual Control";
    panel.appendChild(controlState);
    
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "AI Decision";
    title.style.marginBottom = "8px";
    title.style.fontSize = "13px";
    title.style.color = "#9fb0ba";
    panel.appendChild(title);
    
    const error = document.createElement("div");
    error.className = "error";
    error.style.fontSize = "12px";
    error.style.lineHeight = "1.5";
    error.style.marginBottom = "12px";
    error.textContent = llmState.error || "AI proposal was invalid. You can act manually.";
    panel.appendChild(error);
    
    // Add fallback explanation
    const fallbackNote = document.createElement("div");
    fallbackNote.style.fontSize = "11px";
    fallbackNote.style.color = "#9fb0ba";
    fallbackNote.style.marginTop = "8px";
    fallbackNote.style.fontStyle = "italic";
    fallbackNote.textContent = "Switched to manual control for this turn.";
    panel.appendChild(fallbackNote);
    
    messageContainer.appendChild(panel);
  }
  
  actionsEl.appendChild(messageContainer);

  // Show manual control indicator if not in AI mode or if AI failed
  if (!isAiMode || llmState.status === "manual") {
    const controlIndicator = document.createElement("div");
    controlIndicator.style.fontSize = "11px";
    controlIndicator.style.color = "#e6a872";
    controlIndicator.style.marginBottom = "12px";
    controlIndicator.style.fontWeight = "600";
    controlIndicator.style.textTransform = "uppercase";
    controlIndicator.style.letterSpacing = "0.5px";
    controlIndicator.style.width = "100%"; // Ensure it takes full width to force new line
    controlIndicator.style.flexBasis = "100%"; // Force full width in flex container
    controlIndicator.style.textAlign = "center"; // Center the text
    controlIndicator.textContent = "Manual Control";
    actionsEl.appendChild(controlIndicator);
  }

  const legal = engine.getLegalActions();
  for (const action of legal) {
    const button = document.createElement("button");
    button.textContent = action.type.toUpperCase();
    button.onclick = () => {
      let amount = null;
      if (action.type === "bet" || action.type === "raise") {
        const input = prompt(
          `Enter amount (${action.minAmount}-${action.maxAmount})`,
          String(action.minAmount)
        );
        if (input === null) {
          return;
        }
        amount = Number(input);
      }
      engine.applyAction({
        actor: state.actionSeat,
        type: action.type,
        amount,
      });
      render();
    };
    actionsEl.appendChild(button);
  }
}

function mapProposalAction(proposalAction, legalActions) {
  const type = String(proposalAction.type || "").toLowerCase();

  if (type === "call") {
    // free action?
    if (legalActions.some(a => a.type === "check")) {
      return { type: "check" };
    }
    // must pay?
    if (legalActions.some(a => a.type === "call")) {
      return { type: "call", amount: proposalAction.amount };
    }
    return null;
  }

  if (type === "raise") {
    // first aggression?
    if (legalActions.some(a => a.type === "bet")) {
      return { type: "bet", amount: proposalAction.amount };
    }
    // raise over bet
    if (legalActions.some(a => a.type === "raise")) {
      return { type: "raise", amount: proposalAction.amount };
    }
    return null;
  }

  if (type === "fold") {
    return { type: "fold" };
  }

  return null;
}


// function validateLlmProposal(proposal, legalActions) {
//   if (!proposal || !proposal.action || !proposal.reason) {
//     console.warn("[LLM VALIDATION] missing decision fields", proposal);
//     return { ok: false, error: "LLM proposal missing decision fields." };
//   }
//   const action = String(proposal.action.type || "").toLowerCase();
//   if (!action) {
//     console.warn("[LLM VALIDATION] missing action type", proposal);
//     return { ok: false, error: "LLM proposal missing action type." };
//   }
//   const legal = legalActions.find((a) => a.type === action);
//   if (!legal) {
//     console.warn("[LLM VALIDATION] illegal action", { action, legalActions });
//     return { ok: false, error: `Illegal action proposed: ${action}` };
//   }
//   if (action === "bet" || action === "raise") {
//     const amount = Number(proposal.action.amount);
//     if (!Number.isFinite(amount)) {
//       console.warn("[LLM VALIDATION] invalid amount", proposal.action.amount);
//       return { ok: false, error: "Proposed amount is missing or invalid." };
//     }
//     if (legal.minAmount !== null && amount < legal.minAmount) {
//       console.warn("[LLM VALIDATION] amount below minimum", {
//         amount,
//         min: legal.minAmount,
//       });
//       return { ok: false, error: "Proposed amount below minimum." };
//     }
//     if (legal.maxAmount !== null && amount > legal.maxAmount) {
//       console.warn("[LLM VALIDATION] amount above maximum", {
//         amount,
//         max: legal.maxAmount,
//       });
//       return { ok: false, error: "Proposed amount above maximum." };
//     }
//   }
//   return { ok: true };
// }

function resolveLlmDecision(proposal, legalActions) {
  // ① 意图合法性
  const intent = String(proposal?.action?.type || "").toUpperCase();
  if (!["FOLD", "CALL", "RAISE"].includes(intent)) {
    return { ok: false, error: `Invalid proposal intent: ${intent}` };
  }

  // ② 意图 → 执行 映射（可达性）
  let execAction = null;

  if (intent === "FOLD") {
    execAction = legalActions.find(a => a.type === "fold") ? { type: "fold" } : null;
  }

  if (intent === "CALL") {
    if (legalActions.some(a => a.type === "check")) execAction = { type: "check" };
    else if (legalActions.some(a => a.type === "call")) execAction = { type: "call" };
  }

  if (intent === "RAISE") {
    const amount = Number(proposal.action.amount);
    if (!Number.isFinite(amount)) {
      return { ok: false, error: "RAISE requires a valid amount." };
    }
    if (legalActions.some(a => a.type === "bet")) execAction = { type: "bet", amount };
    else if (legalActions.some(a => a.type === "raise")) execAction = { type: "raise", amount };
  }

  if (!execAction) {
    return {
      ok: false,
      error: `Proposed action '${intent}' cannot be executed in current state.`,
    };
  }

  // ③ 数值合法性（min/max）
  const legal = legalActions.find(a => a.type === execAction.type);
  if (execAction.amount !== undefined) {
    if (legal.minAmount !== null && execAction.amount < legal.minAmount) {
      return { ok: false, error: "Proposed amount below minimum." };
    }
    if (legal.maxAmount !== null && execAction.amount > legal.maxAmount) {
      return { ok: false, error: "Proposed amount above maximum." };
    }
  }

  // ✅ 一切 OK
  return {
    ok: true,
    action: execAction,
    amount: proposal.action.amount
  };
}


function getPromptName(promptId) {
  const profile = PromptRegistry.profiles.find((p) => p.id === promptId);
  return profile ? profile.name : "Unknown";
}

function getDriverLabel(key) {
  const map = {
    hand_strength: "Hand strength",
    pot_odds: "Pot odds",
    implied_odds: "Implied odds",
    position: "Position",
    risk: "Risk",
    variance: "Variance",
    bluff_value: "Bluff potential",
    entertainment: "Entertainment value",
    table_image: "Table dynamics",
    opponent_model: "Opponent behavior",
  };
  return map[key] || key;
}

// Convert driver keys to short, human-readable judgment sentences
function formatDriverAsJudgment(key) {
  const judgments = {
    hand_strength: "Decent hand strength",
    pot_odds: "Pot odds justify continuing",
    implied_odds: "Implied odds favor this play",
    position: "Positional advantage",
    risk: "Low risk at current stack depth",
    variance: "Acceptable variance",
    bluff_value: "Bluff potential exists",
    entertainment: "Entertainment value",
    table_image: "Table dynamics favor this",
    opponent_model: "Opponent behavior suggests this",
  };
  return judgments[key] || getDriverLabel(key);
}


function renderSummary(snapshot) {
  const summary = getLatestHandSummary(snapshot.events);
  
  // Check if a new hand has started
  const newHandStarted = hasNewHandStarted(snapshot.events, lastSummaryHandId);
  if (newHandStarted) {
    lastSummaryHandId = snapshot.state.handId;
  }
  
  potsEl.innerHTML = "";
  showdownEl.innerHTML = "";
  resolutionEl.innerHTML = "";

  if (!summary) {
    potsEl.textContent = "No summary yet.";
    showdownEl.textContent = "No showdown yet.";
    resolutionEl.textContent = "No resolution yet.";
    return;
  }

  const data = summary.data || {};
  const pots = Array.isArray(data.pots) ? data.pots : [];
  const showdown = Array.isArray(data.showdown) ? data.showdown : [];

  lastSummaryHandId = summary.handId;

  for (const pot of pots) {
    const line = document.createElement("div");
    line.className = "line";
    const potName = pot.potIndex === 0 ? "Main Pot" : `Side Pot ${pot.potIndex}`;
    line.textContent = `${potName}: ${pot.amount} (eligible: ${pot.eligibleSeats.join(
      ","
    )})`;
    potsEl.appendChild(line);
  }

  if (!showdown.length) {
    showdownEl.textContent = "No showdown.";
  }
  for (const entry of showdown) {
    const line = document.createElement("div");
    line.className = "line";
    const player = snapshot.state.players[entry.seat];
    const cards = document.createElement("span");
    renderCardList(cards, player.holeCards, "small");
    const label = document.createElement("span");
    label.textContent = `Seat ${entry.seat}: `;
    const arrow = document.createElement("span");
    const rankText = entry.handRankText || entry.handRank || "Unknown";
    arrow.textContent = ` \u2192 ${rankText}`;
    line.appendChild(label);
    line.appendChild(cards);
    line.appendChild(arrow);
    showdownEl.appendChild(line);
  }

  for (const pot of pots) {
    const line = document.createElement("div");
    line.className = "line";
    const potName = pot.potIndex === 0 ? "Main Pot" : `Side Pot ${pot.potIndex}`;
    const winners = Array.isArray(pot.winners)
      ? pot.winners.map((w) => (typeof w === "number" ? w : w.seat)).join(", ")
      : "";
    line.textContent = `${potName} (${pot.amount}) \u2192 Seat ${winners}`;
    resolutionEl.appendChild(line);
  }
}

function renderPreGame() {
  seatsEl.innerHTML = "";
  const seatClasses = [
    "seat top-left",
    "seat top-right",
    "seat right",
    "seat bottom-right",
    "seat bottom-left",
    "seat left",
  ];
  for (let seatIndex = 0; seatIndex < seatSettings.length; seatIndex += 1) {
    const seat = document.createElement("div");
    seat.className = seatClasses[seatIndex] || "seat";
    const header = document.createElement("div");
    header.className = "seat-header";
    const seatInfo = document.createElement("div");
    seatInfo.className = "seat-info";

    // Seat number and state badges (max 2)
    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";
    const seatLabel = document.createElement("span");
    seatLabel.style.fontSize = "11px";
    seatLabel.style.fontWeight = "600";
    seatLabel.style.color = "#d4e4f0";
    seatLabel.textContent = `Seat ${seatIndex}`;
    badgeRow.appendChild(seatLabel);
    const preGameBadge = document.createElement("span");
    preGameBadge.className = "badge pending";
    preGameBadge.textContent = "pre-game";
    badgeRow.appendChild(preGameBadge);
    seatInfo.appendChild(badgeRow);

    // Numeric fields as aligned text rows
    const stackRow = document.createElement("div");
    stackRow.className = "info-row";
    const stackLabel = document.createElement("span");
    stackLabel.className = "info-label";
    stackLabel.textContent = "Stack";
    const stackValue = document.createElement("span");
    stackValue.className = "info-value";
    stackValue.textContent = String(seatSettings[seatIndex].stack);
    stackRow.appendChild(stackLabel);
    stackRow.appendChild(stackValue);
    seatInfo.appendChild(stackRow);

    const committedRow = document.createElement("div");
    committedRow.className = "info-row";
    const committedLabel = document.createElement("span");
    committedLabel.className = "info-label";
    committedLabel.textContent = "Committed";
    const committedValue = document.createElement("span");
    committedValue.className = "info-value";
    committedValue.textContent = "0";
    committedRow.appendChild(committedLabel);
    committedRow.appendChild(committedValue);
    seatInfo.appendChild(committedRow);

    // Model preset info (if AI mode) - as text row
    const internalActionMode = seatSettings[seatIndex].actionMode;
    const actionMode = normalizeActionModeForUI(internalActionMode);
    if (actionMode && actionMode !== "manual") {
      const presetRow = document.createElement("div");
      presetRow.className = "info-row";
      const presetLabel = document.createElement("span");
      presetLabel.className = "info-label";
      presetLabel.textContent = "Model";
      const presetValue = document.createElement("span");
      presetValue.className = "info-value";
      presetValue.style.fontSize = "10px";
      const presetId = seatSettings[seatIndex].selectedPresetId;
      if (presetId && getAllPresets) {
        const presets = getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        presetValue.textContent = preset ? preset.displayName : presetId;
      } else {
        presetValue.textContent = "Qwen Plus";
      }
      presetRow.appendChild(presetLabel);
      presetRow.appendChild(presetValue);
      seatInfo.appendChild(presetRow);

      // Style/Profile info - as text row
      const styleRow = document.createElement("div");
      styleRow.className = "info-row";
      const styleLabel = document.createElement("span");
      styleLabel.className = "info-label";
      styleLabel.textContent = "Style";
      const styleValue = document.createElement("span");
      styleValue.className = "info-value";
      styleValue.style.fontSize = "10px";
      const selectedProfileId = seatSettings[seatIndex].selectedProfileId || PromptRegistry.defaultPromptId;
      const activeProfile = PromptRegistry.profiles.find(p => p.id === selectedProfileId) || PromptRegistry.profiles[0];
      styleValue.textContent = activeProfile ? activeProfile.name : "Unknown";
      styleRow.appendChild(styleLabel);
      styleRow.appendChild(styleValue);
      seatInfo.appendChild(styleRow);
    }

    const settingsButton = document.createElement("button");
    settingsButton.className = "settings-btn";
    settingsButton.textContent = "🔧";
    settingsButton.onclick = () => openSettings(seatIndex);
    header.appendChild(seatInfo);
    header.appendChild(settingsButton);
    seat.appendChild(header);
    // Reserved card area - always exists to maintain stable seat card height
    const cardArea = document.createElement("div");
    cardArea.className = "card-area";
    seat.appendChild(cardArea);
    seatsEl.appendChild(seat);
  }

  boardEl.textContent = "Configure seats, then start the game.";
  actionsEl.innerHTML = "";
  const startButton = document.createElement("button");
  startButton.textContent = "Start Game";
  startButton.onclick = () => {
    config.startingStacks = seatSettings.map((setting) => setting.stack);
    loadEngine();
  };
  actionsEl.appendChild(startButton);

  potsEl.textContent = "";
  showdownEl.textContent = "";
  resolutionEl.textContent = "";
}

// Initialize Phase 1-3 modules and then render
initPhaseModules().then(() => {
  renderPreGame();
});



