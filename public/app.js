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

  const prompt = [
    profilePrompt,
    customPrompt ? `Custom prompt:\n${customPrompt}` : "",
    "Current state:",
    JSON.stringify(
      {
        seat: seatInfo,
        board,
        pot: potTotal,
        legalActions,
      },
      null,
      2
    ),
    "Output requirements:",
    "Respond with STRICT JSON only. No extra text.",
    'Allowed forms: {"action":"fold"} | {"action":"check"} | {"action":"call"} | {"action":"raise","amount":number}',
    'Optional "explanation" string is allowed. No other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a poker action selector." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw { type: "llm_error", message: "LLM proxy error." };
    }

    const completion = await response.json();

    const content =
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content;

    if (typeof content !== "string") {
      throw { type: "llm_error", message: "Empty LLM response." };
    }

    const trimmed = content.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      throw { type: "llm_error", message: "Non-JSON LLM response." };
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw { type: "llm_error", message: "JSON parse failure.", cause: err };
    }

    const allowedKeys = ["action", "amount", "explanation"];
    for (const key of Object.keys(parsed)) {
      if (!allowedKeys.includes(key)) {
        throw { type: "llm_error", message: "Unexpected key in JSON output." };
      }
    }

    return parsed;
  } catch (err) {
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
    label.textContent = `${dealerMark}Seat ${player.seat} | ${player.status} | Stack ${
      player.stack
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
          const validation = validateLlmProposal(proposal, legal);
          if (!validation.ok) {
            llmState = {
              turnKey,
              status: "manual",
              proposal: null,
              error: validation.error,
            };
            render();
            return;
          }
          llmState = {
            turnKey,
            status: "proposed",
            proposal,
            error: "",
          };
          render();
        })
        .catch(() => {
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
      const amountPart =
        llmState.proposal.amount !== undefined
          ? ` ${llmState.proposal.amount}`
          : "";
      actionLine.textContent = `Action: ${llmState.proposal.action}${amountPart}`;
      panel.appendChild(title);
      panel.appendChild(actionLine);
      if (llmState.proposal.explanation) {
        const explain = document.createElement("div");
        explain.textContent = `Explanation: ${llmState.proposal.explanation}`;
        panel.appendChild(explain);
      }
      const controls = document.createElement("div");
      controls.className = "actions";
      const confirm = document.createElement("button");
      confirm.textContent = "Confirm / Apply";
      confirm.onclick = () => {
        engine.applyAction({
          actor: state.actionSeat,
          type: llmState.proposal.action,
          amount:
            llmState.proposal.amount === undefined
              ? null
              : Number(llmState.proposal.amount),
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

function validateLlmProposal(proposal, legalActions) {
  if (!proposal || typeof proposal.action !== "string") {
    return { ok: false, error: "LLM proposal missing action." };
  }
  const action = proposal.action.toLowerCase();
  const legal = legalActions.find((a) => a.type === action);
  if (!legal) {
    return { ok: false, error: `Illegal action proposed: ${proposal.action}` };
  }
  if (action === "bet" || action === "raise") {
    const amount = Number(proposal.amount);
    if (!Number.isFinite(amount)) {
      return { ok: false, error: "Proposed amount is missing or invalid." };
    }
    if (legal.minAmount !== null && amount < legal.minAmount) {
      return { ok: false, error: "Proposed amount below minimum." };
    }
    if (legal.maxAmount !== null && amount > legal.maxAmount) {
      return { ok: false, error: "Proposed amount above maximum." };
    }
  }
  return { ok: true };
}

function getPromptName(promptId) {
  const profile = PromptRegistry.profiles.find((p) => p.id === promptId);
  return profile ? profile.name : "Unknown";
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
    label.textContent = `Seat ${seatIndex} | pre-game | Stack ${
      seatSettings[seatIndex].stack
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
