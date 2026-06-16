// AI opponent using a hunt/target strategy.
//
// HUNT mode: fire at random cells (restricted to a parity checkerboard so the
// AI searches efficiently, since the smallest ship is length 2).
// TARGET mode: after a hit, queue the orthogonally-adjacent cells and focus
// fire on them until the ship is sunk.

export class AI {
  constructor(boardSize, rng = Math.random) {
    this.size = boardSize;
    this.rng = rng;
    this.tried = Array.from({ length: boardSize }, () =>
      Array.from({ length: boardSize }, () => false)
    );
    this.targetQueue = []; // cells to try next, as {r, c}
    this.openHits = []; // hits on ships that are not yet sunk, as {r, c}
  }

  inBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  // Choose the next cell to fire at.
  nextMove() {
    // Drain the target queue first (skipping already-tried cells).
    while (this.targetQueue.length > 0) {
      const cell = this.targetQueue.shift();
      if (this.inBounds(cell.r, cell.c) && !this.tried[cell.r][cell.c]) {
        return cell;
      }
    }
    return this.huntMove();
  }

  huntMove() {
    // Prefer checkerboard cells; fall back to any untried cell.
    const parityCells = [];
    const otherCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.tried[r][c]) continue;
        if ((r + c) % 2 === 0) parityCells.push({ r, c });
        else otherCells.push({ r, c });
      }
    }
    const pool = parityCells.length > 0 ? parityCells : otherCells;
    if (pool.length === 0) return null; // board exhausted
    return pool[Math.floor(this.rng() * pool.length)];
  }

  // Orthogonal neighbours of a cell that are on-board and not yet fired at.
  untriedNeighbours(r, c) {
    return [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ].filter((n) => this.inBounds(n.r, n.c) && !this.tried[n.r][n.c]);
  }

  // Report the outcome of the AI's last shot so it can update its strategy.
  registerResult(r, c, result) {
    this.tried[r][c] = true;
    if (result.hit && !result.sunk) {
      // Record the hit and queue its neighbours to home in on the ship.
      this.openHits.push({ r, c });
      this.targetQueue.push(...this.untriedNeighbours(r, c));
    } else if (result.sunk) {
      // Drop the sunk ship's cells from the open-hit list, then rebuild the
      // target queue from any hits that belong to *other* damaged ships. This
      // keeps the AI locked on a second ship it clipped while finishing the
      // first, instead of discarding that lead and resuming a blind hunt.
      const sunkCells = result.sunk.cells || [];
      const isSunkCell = (h) =>
        sunkCells.some((s) => s.r === h.r && s.c === h.c);
      this.openHits = this.openHits.filter((h) => !isSunkCell(h));
      this.targetQueue = [];
      for (const h of this.openHits) {
        this.targetQueue.push(...this.untriedNeighbours(h.r, h.c));
      }
    }
  }
}
