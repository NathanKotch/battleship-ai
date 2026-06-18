// UI controller: wires the pure game logic to the DOM.
import { Board, Ship, FLEET, BOARD_SIZE, CellState } from "./logic.js";
import { AI } from "./ai.js";

const Phase = { SETUP: "setup", BATTLE: "battle", OVER: "over" };

// Builds a top-down ship silhouette SVG sized to span the ship's cells.
// `longPx`/`shortPx` are the bounding box's dimensions along/across the hull.
function shipSvg(longPx, shortPx, horizontal) {
  // Map normalized (a = along hull 0..1 stern→bow, b = across hull 0..1) to px.
  const map = (a, b) =>
    horizontal ? [a * longPx, b * shortPx] : [b * shortPx, (1 - a) * longPx];
  const poly = (pairs) =>
    pairs
      .map(([a, b]) => map(a, b).map((n) => n.toFixed(1)).join(","))
      .join(" ");
  const hull = poly([
    [0.02, 0.3],
    [0.8, 0.12],
    [0.99, 0.5],
    [0.8, 0.88],
    [0.02, 0.7],
  ]);
  const bridge = poly([
    [0.34, 0.34],
    [0.5, 0.34],
    [0.5, 0.66],
    [0.34, 0.66],
  ]);
  const t1 = map(0.18, 0.5);
  const t2 = map(0.63, 0.5);
  const r = (0.12 * shortPx).toFixed(1);
  const w = (horizontal ? longPx : shortPx).toFixed(1);
  const h = (horizontal ? shortPx : longPx).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">
    <polygon points="${hull}" fill="#6b7689" stroke="#1a202c" stroke-width="1.2" stroke-linejoin="round" />
    <polygon points="${bridge}" fill="#2d3748" />
    <circle cx="${t1[0].toFixed(1)}" cy="${t1[1].toFixed(1)}" r="${r}" fill="#2d3748" />
    <circle cx="${t2[0].toFixed(1)}" cy="${t2[1].toFixed(1)}" r="${r}" fill="#2d3748" />
  </svg>`;
}

class Game {
  constructor() {
    this.playerBoard = new Board(BOARD_SIZE);
    this.aiBoard = new Board(BOARD_SIZE);
    this.ai = new AI(BOARD_SIZE);
    this.phase = Phase.SETUP;
    this.orientation = "horizontal";
    this.placeIndex = 0;
    this.busy = false;
    this.resizeTimer = null;

    this.cacheDom();
    this.bindEvents();
    this.startNewGame();
  }

  cacheDom() {
    this.playerGridEl = document.getElementById("player-grid");
    this.aiGridEl = document.getElementById("ai-grid");
    this.statusEl = document.getElementById("status");
    this.setupControls = document.getElementById("setup-controls");
    this.rotateBtn = document.getElementById("rotate-btn");
    this.randomBtn = document.getElementById("random-btn");
    this.startBtn = document.getElementById("start-btn");
    this.resetBtn = document.getElementById("reset-btn");
    this.newGameBtn = document.getElementById("new-game-btn");
    this.placeHintEl = document.getElementById("place-hint");
    this.playerTrackerEl = document.getElementById("player-tracker");
    this.aiTrackerEl = document.getElementById("ai-tracker");
  }

  bindEvents() {
    this.rotateBtn.addEventListener("click", () => this.toggleOrientation());
    this.randomBtn.addEventListener("click", () => this.randomizePlayer());
    this.startBtn.addEventListener("click", () => this.startBattle());
    this.resetBtn.addEventListener("click", () => this.startNewGame());
    this.newGameBtn.addEventListener("click", () => this.startNewGame());
    window.addEventListener("resize", () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.render(), 100);
    });
  }

  startNewGame() {
    this.playerBoard = new Board(BOARD_SIZE);
    this.aiBoard = new Board(BOARD_SIZE);
    this.aiBoard.placeRandomFleet();
    this.ai = new AI(BOARD_SIZE);
    this.phase = Phase.SETUP;
    this.placeIndex = 0;
    this.orientation = "horizontal";
    this.busy = false;
    this.newGameBtn.hidden = true;
    this.setupControls.hidden = false;
    this.render();
    this.setStatus("Place your fleet, or hit Random.");
  }

  toggleOrientation() {
    this.orientation =
      this.orientation === "horizontal" ? "vertical" : "horizontal";
    this.render();
  }

  randomizePlayer() {
    this.playerBoard.placeRandomFleet();
    this.placeIndex = FLEET.length;
    this.render();
    this.setStatus("Fleet ready. Press Start Battle!");
  }

  currentPlacementShip() {
    return this.placeIndex < FLEET.length ? FLEET[this.placeIndex] : null;
  }

  tryPlace(r, c) {
    const spec = this.currentPlacementShip();
    if (!spec) return;
    const horizontal = this.orientation === "horizontal";
    const ship = new Ship(spec.name, spec.size);
    if (this.playerBoard.placeShip(ship, r, c, horizontal)) {
      this.placeIndex++;
      this.render();
      if (this.placeIndex >= FLEET.length) {
        this.setStatus("Fleet ready. Press Start Battle!");
      }
    } else {
      this.setStatus("Can't place there — overlaps or off the board.");
    }
  }

  startBattle() {
    if (this.placeIndex < FLEET.length) {
      this.setStatus("Place all your ships first!");
      return;
    }
    this.phase = Phase.BATTLE;
    this.setupControls.hidden = true;
    this.render();
    this.setStatus("Battle! Click the enemy waters to fire.");
  }

  playerFire(r, c) {
    if (this.phase !== Phase.BATTLE || this.busy) return;
    const result = this.aiBoard.receiveFire(r, c);
    if (!result.valid) {
      if (result.alreadyShot) this.setStatus("You already fired there.");
      return;
    }
    this.render();
    if (result.sunk) this.setStatus(`You sank the enemy ${result.sunk.name}!`);
    else this.setStatus(result.hit ? "Direct hit!" : "Splash — you missed.");

    if (this.aiBoard.allSunk()) {
      this.endGame(true);
      return;
    }
    this.busy = true;
    setTimeout(() => this.aiTurn(), 650);
  }

  aiTurn() {
    if (this.phase !== Phase.BATTLE) {
      this.busy = false;
      return;
    }
    const move = this.ai.nextMove();
    if (!move) {
      this.busy = false;
      return;
    }
    const result = this.playerBoard.receiveFire(move.r, move.c);
    this.ai.registerResult(move.r, move.c, result);
    this.render();
    if (result.sunk) this.setStatus(`The enemy sank your ${result.sunk.name}!`);
    else this.setStatus(result.hit ? "The enemy hit your ship!" : "Enemy missed.");

    if (this.playerBoard.allSunk()) {
      this.endGame(false);
      return;
    }
    this.busy = false;
  }

  endGame(playerWon) {
    this.phase = Phase.OVER;
    this.busy = false;
    this.newGameBtn.hidden = false;
    this.render();
    this.setStatus(
      playerWon
        ? "Victory! You destroyed the enemy fleet."
        : "Defeat. Your fleet was sunk."
    );
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  // ---- Rendering ----

  render() {
    this.renderBoard(this.playerGridEl, this.playerBoard, true, null);
    const revealAI = this.phase === Phase.OVER;
    this.renderBoard(this.aiGridEl, this.aiBoard, revealAI, (r, c) =>
      this.playerFire(r, c)
    );
    this.renderPlaceHint();
    this.startBtn.disabled = this.placeIndex < FLEET.length;
    this.renderTracker(this.playerTrackerEl, this.playerBoard, "Your Fleet Status");
    this.renderTracker(this.aiTrackerEl, this.aiBoard, "Enemy Fleet Status");
  }

  renderPlaceHint() {
    if (this.phase !== Phase.SETUP) {
      this.placeHintEl.textContent = "";
      return;
    }
    const spec = this.currentPlacementShip();
    if (spec) {
      this.placeHintEl.textContent = `Placing: ${spec.name} (${spec.size}) — ${this.orientation}`;
    } else {
      this.placeHintEl.textContent = "All ships placed.";
    }
  }

  renderBoard(container, board, revealShips, onCellClick) {
    container.innerHTML = "";
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";
        const state = board.cellState(r, c, revealShips);
        cell.classList.add(state);

        if (onCellClick && this.phase === Phase.BATTLE) {
          cell.addEventListener("click", () => onCellClick(r, c));
        } else if (this.phase === Phase.SETUP && board === this.playerBoard) {
          cell.addEventListener("click", () => this.tryPlace(r, c));
        } else {
          cell.disabled = true;
        }
        container.appendChild(cell);
      }
    }
    if (revealShips) {
      this.renderShipSprites(container, board);
      this.renderHitOverlays(container, board);
    }
  }

  renderHitOverlays(container, board) {
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        if (!board.shots[r][c]) continue;
        const cellEl = container.children[r * board.size + c];
        if (!cellEl) continue;
        const marker = document.createElement("div");
        marker.className = board.grid[r][c]
          ? "hit-overlay hit"
          : "hit-overlay miss";
        marker.style.left = `${cellEl.offsetLeft + cellEl.offsetWidth / 2}px`;
        marker.style.top = `${cellEl.offsetTop + cellEl.offsetHeight / 2}px`;
        container.appendChild(marker);
      }
    }
  }

  renderShipSprites(container, board) {
    for (const ship of board.ships) {
      const rs = ship.cells.map((p) => p.r);
      const cs = ship.cells.map((p) => p.c);
      const r0 = Math.min(...rs);
      const r1 = Math.max(...rs);
      const c0 = Math.min(...cs);
      const c1 = Math.max(...cs);
      const first = container.children[r0 * board.size + c0];
      const last = container.children[r1 * board.size + c1];
      if (!first || !last) continue;
      const horizontal = r0 === r1;
      const left = first.offsetLeft;
      const top = first.offsetTop;
      const width = last.offsetLeft + last.offsetWidth - left;
      const height = last.offsetTop + last.offsetHeight - top;
      const sprite = document.createElement("div");
      sprite.className = "ship-sprite";
      sprite.style.left = `${left}px`;
      sprite.style.top = `${top}px`;
      sprite.style.width = `${width}px`;
      sprite.style.height = `${height}px`;
      sprite.innerHTML = shipSvg(
        horizontal ? width : height,
        horizontal ? height : width,
        horizontal
      );
      container.appendChild(sprite);
    }
  }

  // ---- Fleet Tracker (Scoreboard) ----

  renderTracker(container, board, title) {
    container.innerHTML = "";
    const heading = document.createElement("h3");
    heading.textContent = title;
    container.appendChild(heading);

    for (const spec of FLEET) {
      const ship = board.ships.find((s) => s.name === spec.name);
      const row = document.createElement("div");
      row.className = "tracker-ship";

      const nameEl = document.createElement("span");
      nameEl.className = "tracker-name";
      nameEl.textContent = spec.name;

      const pegsEl = document.createElement("span");
      pegsEl.className = "tracker-pegs";
      for (let i = 0; i < spec.size; i++) {
        const peg = document.createElement("span");
        peg.className = "tracker-peg";
        if (ship && ship.hits > i) {
          peg.classList.add("hit");
        }
        pegsEl.appendChild(peg);
      }

      const statusEl = document.createElement("span");
      statusEl.className = "tracker-status";
      if (ship && ship.isSunk()) {
        statusEl.textContent = "SUNK";
        statusEl.classList.add("sunk");
        row.classList.add("sunk");
      } else {
        statusEl.textContent = "ACTIVE";
        statusEl.classList.add("active");
      }

      row.appendChild(nameEl);
      row.appendChild(pegsEl);
      row.appendChild(statusEl);
      container.appendChild(row);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => new Game());
