const seatsEl = document.getElementById("seats");
const boardEl = document.getElementById("board");
const actionsEl = document.getElementById("actions");

const config = {
  seed: "cardpt-v0.1",
  startingStacks: [200, 200, 200, 200, 200, 200],
  smallBlind: 1,
  bigBlind: 2,
};

let engine = null;

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
  for (const player of state.players) {
    const seat = document.createElement("div");
    seat.className = "seat";
    if (player.seat === state.actionSeat && state.phase !== "ended") {
      seat.style.borderColor = "#6fb3ff";
    }
    seat.textContent = `Seat ${player.seat} | ${player.status} | Stack ${
      player.stack
    } | Committed ${player.totalCommitted}`;
    seatsEl.appendChild(seat);
  }

  boardEl.textContent = `Board: ${state.board
    .map((c) => `${c.rank}${c.suit}`)
    .join(" ") || "(not dealt)"}`;

  renderActions();
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

loadEngine();
