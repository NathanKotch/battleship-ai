// UI controller: wires the pure game logic to the DOM.
import { Board, Ship, FLEET, BOARD_SIZE, CellState } from "./logic.js";
import { AI } from "./ai.js";

const Phase = { SETUP: "setup", BATTLE: "battle", OVER: "over" };

class Game {
  constructor() {
    this.playerBoard = new Board(BOARD_SIZE);
    this.aiBoard = new Board(BOARD_SIZE);
    this.ai = new AI(BOARD_SIZE);
    this.phase = Phase.SETUP;
    this.orientation = "horizontal"; // current placement orientation
    this.placeIndex = 0; // which fleet ship the player is placing
    this.busy = false; // locks input while the AI is taking its turn

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
  }

  bindEvents() {
    this.rotateBtn.addEventListener("click", () => this.toggleOrientation());
    this.randomBtn.addEventListener("click", () => this.randomizePlayer());
    this.startBtn.addEventListener("click", () => this.startBattle());
    this.resetBtn.addEventListener("click", () => this.startNewGame());
    this.newGameBtn.addEventListener("click", () => this.startNewGame());
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
    this.placeIndex = FLEET.length; // all ships placed
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
    // Hand the turn to the AI.
    this.busy = true;
    setTimeout(() => this.aiTurn(), 650);
  }

  aiTurn() {
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
  }
}

window.addEventListener("DOMContentLoaded", () => new Game());
