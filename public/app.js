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
const settingsPromptProfile = document.getElementById("settings-prompt-profile");
const settingsCustomPrompt = document.getElementById("settings-custom-prompt");
const settingsPromptNote = document.getElementById("settings-prompt-note");
const promptSettings = document.getElementById("prompt-settings");
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
};

const PromptRegistry = {
  defaultPromptId: "tight_rookie_v1",
  profiles: [
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

const seatSettings = [
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
  {
    stack: 200,
    actionMode: "manual",
    promptSelection: PromptRegistry.defaultPromptId,
    customPrompt: "",
  },
];

async function requestLlmAction(_input) {
  const input = _input || {};
  const snapshot = engine ? engine.getSnapshot() : null;
  const state = snapshot ? snapshot.state : null;
  const seat = typeof input.seat === "number" ? input.seat : 0;
  const player = state ? state.players[seat] : null;

  const profileId = input.promptSelection || PromptRegistry.defaultPromptId;
  const profile = PromptRegistry.profiles.find((p) => p.id === profileId);
  const profilePrompt = profile ? profile.prompt : "";
  const customPrompt = input.customPrompt || "";

  const seatInfo = player
    ? {
      seat: player.seat,
      stack: player.stack,
      committed: player.totalCommitted,
      holeCards: player.holeCards,
      status: player.status,
    }
    : null;
  const board = state ? state.board : [];
  const potTotal = state
    ? state.pots.reduce((sum, pot) => sum + pot.amount, 0)
    : 0;
  const legalActions = Array.isArray(input.legalActions)
    ? input.legalActions
    : [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const mod = await import("/dist/engine/buildDecisionInput.js");
    const buildDecisionInput = mod.buildDecisionInput;
    const toCall =
      state && typeof state.currentBet === "number"
        ? Math.max(0, state.currentBet - state.betThisRound[state.actionSeat])
        : 0;
    const decisionInput = buildDecisionInput({
      engineFacts: {
        seed: snapshot ? snapshot.config.seed : null,
        handId: snapshot ? snapshot.state.handId : null,
      },
      profile: {
        id: profileId,
        name: profile ? profile.name : "Unknown",
        description: profile ? profile.description : "",
        prompt: profilePrompt,
        custom_prompt: customPrompt,
      },
      state: {
        position: state ? state.actionSeat : null,
        pot: potTotal,
        to_call: toCall,
        legal_actions: legalActions,
      },
      legalActions,
    });

    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(decisionInput),
    });

    if (!response.ok) {
      throw { type: "llm_error", message: "LLM proxy error." };
    }

    const decision = await response.json();
    if (!decision || !decision.action || !decision.reason) {
      throw { type: "llm_error", message: "Decision schema mismatch." };
    }
    const rawType = String(decision.action.type || "").toUpperCase();
    if (rawType === "FOLD" || rawType === "CALL" || rawType === "RAISE") {
      decision.action.type = rawType;
    } else {
      throw { type: "llm_error", message: "Decision action type invalid." };
    }
    return decision;
  } catch (err) {
    console.warn("[LLM] requestLlmAction failed", err);
    if (err && err.name === "AbortError") {
      throw { type: "llm_error", message: "LLM request timed out." };
    }
    if (err && err.type === "llm_error") {
      throw err;
    }
    throw { type: "llm_error", message: "LLM request failed.", cause: err };
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

function openSettings(seatIndex) {
  editingSeat = seatIndex;
  const settings = seatSettings[seatIndex];
  settingsTitle.textContent = `Seat ${seatIndex} Settings`;
  settingsStack.value = String(settings.stack);
  settingsMode.value = settings.actionMode;
  renderPromptProfileOptions();
  settingsPromptProfile.value = settings.promptSelection;
  settingsCustomPrompt.value = settings.customPrompt;
  promptSettings.style.display =
    settings.actionMode === "llm" ? "block" : "none";
  updatePromptNote();
  settingsBackdrop.style.display = "flex";
}

function closeSettings() {
  editingSeat = null;
  settingsBackdrop.style.display = "none";
}

settingsCancel.addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", (event) => {
  if (event.target === settingsBackdrop) {
    closeSettings();
  }
});
settingsSave.addEventListener("click", () => {
  if (editingSeat === null) {
    closeSettings();
    return;
  }
  const stackValue = Number(settingsStack.value);
  seatSettings[editingSeat] = {
    stack: Number.isFinite(stackValue) && stackValue >= 0 ? stackValue : 0,
    actionMode: settingsMode.value === "llm" ? "llm" : "manual",
    promptSelection:
      settingsPromptProfile.value || PromptRegistry.defaultPromptId,
    customPrompt: settingsCustomPrompt.value || "",
  };
  closeSettings();
});

settingsMode.addEventListener("change", () => {
  promptSettings.style.display =
    settingsMode.value === "llm" ? "block" : "none";
});

settingsPromptProfile.addEventListener("change", updatePromptNote);
settingsCustomPrompt.addEventListener("input", updatePromptNote);

function renderPromptProfileOptions() {
  settingsPromptProfile.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = PromptRegistry.defaultPromptId;
  defaultOption.textContent = "Use Default";
  settingsPromptProfile.appendChild(defaultOption);
  for (const profile of PromptRegistry.profiles) {
    if (profile.id === PromptRegistry.defaultPromptId) {
      continue;
    }
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    settingsPromptProfile.appendChild(option);
  }
}

function updatePromptNote() {
  const selectedId =
    settingsPromptProfile.value || PromptRegistry.defaultPromptId;
  const profile = PromptRegistry.profiles.find((p) => p.id === selectedId);
  const custom = settingsCustomPrompt.value.trim();
  const profileName = profile ? profile.name : "Unknown";
  settingsPromptNote.textContent = custom
    ? `Custom prompt overrides profile (${profileName}).`
    : `Using profile: ${profileName}.`;
}

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
    const dealerMark = player.seat === state.dealerSeat ? "\u25CF " : "";
    const header = document.createElement("div");
    header.className = "seat-header";
    const label = document.createElement("div");
    const promptLabel =
      seatSettings[player.seat].actionMode === "llm"
        ? " | Prompt: " +
        (seatSettings[player.seat].customPrompt
          ? "Custom"
          : getPromptName(
            seatSettings[player.seat].promptSelection ||
            PromptRegistry.defaultPromptId
          ))
        : "";
    label.textContent = `${dealerMark}Seat ${player.seat} | ${player.status} | Stack ${player.stack
      } | Committed ${player.totalCommitted}${promptLabel}`;
    const settingsButton = document.createElement("button");
    settingsButton.className = "settings-btn";
    settingsButton.textContent = "Settings";
    settingsButton.onclick = () => openSettings(player.seat);
    header.appendChild(label);
    header.appendChild(settingsButton);
    seat.appendChild(header);
    renderHoleCards(seat, player.holeCards);
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
  const actionMode = seatSettings[state.actionSeat]?.actionMode || "manual";
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
    llmState = { turnKey, status: "idle", proposal: null, error: "" };
  }

  if (actionMode === "llm") {
    const legal = engine.getLegalActions();

    if (llmState.status === "idle") {
      llmState.status = "loading";
      requestLlmAction({
        seat: state.actionSeat,
        legalActions: legal,
        promptSelection: seatSettings[state.actionSeat]?.promptSelection,
        customPrompt: seatSettings[state.actionSeat]?.customPrompt,
      })
        .then((proposal) => {
          const resolved = resolveLlmDecision(proposal, legal);
          if (!resolved.ok) {
            llmState = {
              turnKey,
              status: "manual",
              proposal: null,
              error: resolved.error,
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
          };
          render();
        })
        .catch((err) => {
          console.warn("[LLM] proposal failed branch", err);
          llmState = {
            turnKey,
            status: "manual",
            proposal: null,
            error: "LLM proposal failed. Falling back to manual controls.",
          };
          render();
        });
    }

    if (llmState.status === "loading") {
      const panel = document.createElement("div");
      panel.className = "llm-panel";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "LLM Proposed Action";
      const body = document.createElement("div");
      body.textContent = "Awaiting proposal...";
      panel.appendChild(title);
      panel.appendChild(body);
      actionsEl.appendChild(panel);
      return;
    }

    if (llmState.status === "proposed") {
      const panel = document.createElement("div");
      panel.className = "llm-panel";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "LLM Proposed Action";
      const actionLine = document.createElement("div");
      const actionType = String(llmState.proposal.action.type || "");
      const rawAmount = llmState.proposal.action.amount;
      const displayAction = actionType;
      const amount =
        (actionType.toUpperCase() === "RAISE" || actionType.toUpperCase() === "BET") && Number.isFinite(rawAmount) && rawAmount > 0
          ? rawAmount
          : null;
      const amountPart = amount === null ? "" : ` ${amount}`;
      actionLine.textContent = `AI Action: ${displayAction}${amountPart}`;
      panel.appendChild(title);
      panel.appendChild(actionLine);
      const drivers = Array.isArray(llmState.proposal.reason.drivers)
        ? llmState.proposal.reason.drivers
        : [];
      if (drivers.length > 0) {
        const sorted = [...drivers].sort((a, b) => b.weight - a.weight);
        const main = sorted[0];
        const secondary = sorted.slice(1, 3);
        const mainLine = document.createElement("div");
        mainLine.textContent = `Main reason: ${getDriverLabel(main.key)}`;
        panel.appendChild(mainLine);
        if (secondary.length > 0) {
          const otherLine = document.createElement("div");
          otherLine.textContent = `Other factors: ${secondary
            .map((driver) => getDriverLabel(driver.key))
            .join(", ")}`;
          panel.appendChild(otherLine);
        }
      }
      if (llmState.proposal.reason.line) {
        const line = document.createElement("div");
        line.textContent = `"${llmState.proposal.reason.line}"`;
        panel.appendChild(line);
      }
      const controls = document.createElement("div");
      controls.className = "actions";
      const confirm = document.createElement("button");
      confirm.textContent = "Confirm / Apply";
      confirm.onclick = () => {
        engine.applyAction({
          actor: state.actionSeat,
          type: actionType.toLowerCase(),
          amount: amount === null ? null : Number(amount),
        });
        llmState = { turnKey: null, status: "idle", proposal: null, error: "" };
        render();
      };
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        llmState = {
          turnKey,
          status: "manual",
          proposal: null,
          error: "LLM proposal canceled. Manual controls enabled for this turn.",
        };
        render();
      };
      controls.appendChild(confirm);
      controls.appendChild(cancel);
      panel.appendChild(controls);
      actionsEl.appendChild(panel);
      return;
    }

    if (llmState.status === "manual") {
      const panel = document.createElement("div");
      panel.className = "llm-panel";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "LLM Proposed Action";
      const error = document.createElement("div");
      error.className = "error";
      error.textContent = llmState.error || "Invalid proposal.";
      panel.appendChild(title);
      panel.appendChild(error);
      actionsEl.appendChild(panel);
    }
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


function renderSummary(snapshot) {
  if (hasNewHandStarted(snapshot.events, lastSummaryHandId)) {
    potsEl.textContent = "";
    showdownEl.textContent = "";
    resolutionEl.textContent = "";
    lastSummaryHandId = snapshot.state.handId;
    return;
  }
  const summary = getLatestHandSummary(snapshot.events);
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
    const label = document.createElement("div");
    label.textContent = `Seat ${seatIndex} | pre-game | Stack ${seatSettings[seatIndex].stack
      } | Committed 0`;
    const settingsButton = document.createElement("button");
    settingsButton.className = "settings-btn";
    settingsButton.textContent = "Settings";
    settingsButton.onclick = () => openSettings(seatIndex);
    header.appendChild(label);
    header.appendChild(settingsButton);
    seat.appendChild(header);
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

renderPreGame();
