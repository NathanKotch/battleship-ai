// Lightweight test harness for the pure game logic (no DOM).
import { Board, Ship, FLEET, BOARD_SIZE } from "../src/logic.js";
import { AI } from "../src/ai.js";

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

// Deterministic RNG (mulberry32) so failures are reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Placement validation ---
{
  const b = new Board();
  check("place horizontal in bounds", b.placeShip(new Ship("A", 3), 0, 0, true));
  check("overlap rejected", !b.placeShip(new Ship("B", 3), 0, 0, true));
  check(
    "off-board horizontal rejected",
    !b.placeShip(new Ship("C", 5), 0, 8, true)
  );
  check(
    "off-board vertical rejected",
    !b.placeShip(new Ship("D", 5), 8, 0, false)
  );
  check("adjacent placement allowed", b.placeShip(new Ship("E", 2), 1, 0, true));
}

// --- Fire mechanics ---
{
  const b = new Board();
  b.placeShip(new Ship("Sub", 3), 0, 0, true);
  const miss = b.receiveFire(5, 5);
  check("miss reported", miss.valid && !miss.hit);
  const hit = b.receiveFire(0, 0);
  check("hit reported", hit.valid && hit.hit && !hit.sunk);
  const dup = b.receiveFire(0, 0);
  check("duplicate shot invalid", !dup.valid && dup.alreadyShot);
  b.receiveFire(0, 1);
  const sink = b.receiveFire(0, 2);
  check("sink reported", sink.sunk && sink.sunk.name === "Sub");
  check("allSunk true", b.allSunk());
  const oob = b.receiveFire(-1, 0);
  check("out-of-bounds fire invalid", !oob.valid);
}

// --- Random fleet placement integrity ---
for (let seed = 1; seed <= 200; seed++) {
  const b = new Board();
  b.placeRandomFleet(FLEET, makeRng(seed));
  let totalCells = 0;
  const occupied = new Set();
  let overlap = false;
  for (const ship of b.ships) {
    check(`seed ${seed} ship size matches cells`, ship.cells.length === ship.size);
    totalCells += ship.size;
    for (const { r, c } of ship.cells) {
      const key = `${r},${c}`;
      if (occupied.has(key)) overlap = true;
      occupied.add(key);
    }
  }
  check(`seed ${seed} no overlaps`, !overlap);
  check(`seed ${seed} all 5 ships placed`, b.ships.length === FLEET.length);
  check(`seed ${seed} total cells = 17`, totalCells === 17);
}

// --- AI retains a lead on a second ship after sinking the first ---
{
  const ai = new AI(BOARD_SIZE);
  // Hit ship X at (5,5), then clip a different ship Y at (5,6) — both still afloat.
  ai.registerResult(5, 5, { hit: true, sunk: null });
  ai.registerResult(5, 6, { hit: true, sunk: null });
  check("two open hits tracked", ai.openHits.length === 2);
  // Sink ship X (cells 5,4 + 5,5) with the finishing shot at (5,4).
  const shipX = { name: "X", cells: [{ r: 5, c: 4 }, { r: 5, c: 5 }] };
  ai.registerResult(5, 4, { hit: true, sunk: shipX });
  // Ship X's hits are cleared; ship Y's hit at (5,6) must remain a live lead.
  check("sunk ship's hits dropped", ai.openHits.length === 1);
  check(
    "second ship's hit retained",
    ai.openHits[0].r === 5 && ai.openHits[0].c === 6
  );
  const follow = ai.nextMove();
  const adjToY =
    follow &&
    Math.abs(follow.r - 5) + Math.abs(follow.c - 6) === 1 &&
    !(follow.r === 5 && follow.c === 5); // (5,5) already tried
  check("AI keeps targeting the second ship after a sink", adjToY);
}

// --- Sinking a fully isolated ship clears the target queue ---
{
  const ai = new AI(BOARD_SIZE);
  ai.registerResult(2, 2, { hit: true, sunk: null });
  check("queue populated after lone hit", ai.targetQueue.length > 0);
  const ship = { name: "Solo", cells: [{ r: 2, c: 2 }, { r: 2, c: 3 }] };
  ai.registerResult(2, 3, { hit: true, sunk: ship });
  check("queue cleared after isolated sink", ai.targetQueue.length === 0);
  check("no open hits after isolated sink", ai.openHits.length === 0);
}

// --- Full simulated games: AI vs random shooter, must terminate with a winner ---
for (let seed = 1; seed <= 300; seed++) {
  const rng = makeRng(seed * 7 + 3);
  const human = new Board();
  const enemy = new Board();
  human.placeRandomFleet(FLEET, rng);
  enemy.placeRandomFleet(FLEET, makeRng(seed * 13 + 1));
  const ai = new AI(BOARD_SIZE, rng);

  // Human fires at every cell in order (guaranteed to win eventually).
  const humanShots = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) humanShots.push({ r, c });

  let turns = 0;
  let winner = null;
  let hi = 0;
  while (!winner && turns < 1000) {
    turns++;
    // human turn
    const hs = humanShots[hi++];
    enemy.receiveFire(hs.r, hs.c);
    if (enemy.allSunk()) {
      winner = "human";
      break;
    }
    // ai turn
    const move = ai.nextMove();
    check(`seed ${seed} ai has a move`, move !== null);
    const res = human.receiveFire(move.r, move.c);
    check(`seed ${seed} ai move valid (not repeated)`, res.valid);
    ai.registerResult(move.r, move.c, res);
    if (human.allSunk()) {
      winner = "ai";
      break;
    }
  }
  check(`seed ${seed} game terminated with winner`, winner !== null);
}

// --- AI eventually sinks everything when allowed unlimited turns ---
for (let seed = 1; seed <= 100; seed++) {
  const human = new Board();
  human.placeRandomFleet(FLEET, makeRng(seed * 17));
  const ai = new AI(BOARD_SIZE, makeRng(seed * 29 + 5));
  let moves = 0;
  while (!human.allSunk() && moves < 200) {
    moves++;
    const m = ai.nextMove();
    if (!m) break;
    const res = human.receiveFire(m.r, m.c);
    ai.registerResult(m.r, m.c, res);
  }
  check(`seed ${seed} AI sinks full fleet within 100 cells`, human.allSunk() && moves <= 100);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
