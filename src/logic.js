// Pure Battleship game logic. No DOM access here so it can be unit-tested in Node.

export const BOARD_SIZE = 10;

// Standard Battleship fleet.
export const FLEET = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

export const CellState = {
  EMPTY: "empty",
  SHIP: "ship",
  HIT: "hit",
  MISS: "miss",
};

export class Ship {
  constructor(name, size) {
    this.name = name;
    this.size = size;
    this.cells = []; // array of {r, c}
    this.hits = 0;
  }

  isSunk() {
    return this.hits >= this.size;
  }
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.ships = [];
    // grid[r][c] holds null or a reference to the Ship occupying it.
    this.grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );
    // shots[r][c] is true once that cell has been fired at.
    this.shots = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => false)
    );
  }

  inBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  // Returns the list of cells a ship would occupy, or null if off-board.
  cellsFor(r, c, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const rr = horizontal ? r : r + i;
      const cc = horizontal ? c + i : c;
      if (!this.inBounds(rr, cc)) return null;
      cells.push({ r: rr, c: cc });
    }
    return cells;
  }

  canPlace(r, c, size, horizontal) {
    const cells = this.cellsFor(r, c, size, horizontal);
    if (!cells) return false;
    return cells.every(({ r, c }) => this.grid[r][c] === null);
  }

  placeShip(ship, r, c, horizontal) {
    if (!this.canPlace(r, c, ship.size, horizontal)) return false;
    const cells = this.cellsFor(r, c, ship.size, horizontal);
    ship.cells = cells;
    cells.forEach(({ r, c }) => {
      this.grid[r][c] = ship;
    });
    this.ships.push(ship);
    return true;
  }

  // Randomly place a fresh fleet. Clears any existing ships first.
  placeRandomFleet(fleetConfig = FLEET, rng = Math.random) {
    this.ships = [];
    this.grid = Array.from({ length: this.size }, () =>
      Array.from({ length: this.size }, () => null)
    );
    for (const { name, size } of fleetConfig) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 1000) {
        attempts++;
        const horizontal = rng() < 0.5;
        const r = Math.floor(rng() * this.size);
        const c = Math.floor(rng() * this.size);
        placed = this.placeShip(new Ship(name, size), r, c, horizontal);
      }
      if (!placed) throw new Error(`Could not place ${name}`);
    }
    return this;
  }

  // Fire at a cell. Returns {valid, hit, sunk, ship, alreadyShot}.
  receiveFire(r, c) {
    if (!this.inBounds(r, c)) {
      return { valid: false, hit: false, sunk: null, alreadyShot: false };
    }
    if (this.shots[r][c]) {
      return { valid: false, hit: false, sunk: null, alreadyShot: true };
    }
    this.shots[r][c] = true;
    const ship = this.grid[r][c];
    if (ship) {
      ship.hits++;
      return {
        valid: true,
        hit: true,
        sunk: ship.isSunk() ? ship : null,
        ship,
        alreadyShot: false,
      };
    }
    return { valid: true, hit: false, sunk: null, alreadyShot: false };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((s) => s.isSunk());
  }

  // Display state of a cell. revealShips controls whether un-hit ships show.
  cellState(r, c, revealShips) {
    if (this.shots[r][c]) {
      return this.grid[r][c] ? CellState.HIT : CellState.MISS;
    }
    if (revealShips && this.grid[r][c]) return CellState.SHIP;
    return CellState.EMPTY;
  }
}
