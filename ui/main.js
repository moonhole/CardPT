const seatsEl = document.getElementById("seats");
const boardEl = document.getElementById("board");
const actionsEl = document.getElementById("actions");
const potsEl = document.getElementById("pots");
const showdownEl = document.getElementById("showdown");
const resolutionEl = document.getElementById("resolution");

const config = {
  seed: "cardpt-v0.1",
  startingStacks: [200, 200, 200, 200, 200, 200],
  smallBlind: 1,
  bigBlind: 2,
};

let engine = null;
let lastSummaryHandId = null;

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

async function loadEngine() {
  try {
    const mod = await import("../dist/engine/index.js");
    engine = mod.createEngine(config);
    render();
  } catch (err) {
    actionsEl.textContent =
      "Build the engine (tsc) before loading the UI.";
  }
}

function render() {
  if (!engine) {
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
    seat.textContent = `${dealerMark}Seat ${player.seat} | ${player.status} | Stack ${
      player.stack
    } | Committed ${player.totalCommitted}`;
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

  if (state.phase === "ended") {
    const button = document.createElement("button");
    button.textContent = "Next Hand";
    button.onclick = () => {
      engine.startNextHand();
      render();
    };
    actionsEl.appendChild(button);
    return;
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

loadEngine();






