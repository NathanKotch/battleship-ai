# Bugs Found & Fixes

This document records the real bugs I hit while building and debugging the
game, how I found them, the root cause, and the fix. Testing was done two ways:

1. **Automated logic tests** (`tests/test.js`) — tens of thousands of
   assertions covering ship placement, firing mechanics, 200 randomized fleet
   layouts, 300 full simulated games, the AI sinking a full fleet within 100
   shots, and AI target-tracking across adjacent ships.
2. **Manual browser testing** — playing through setup, combat, win/lose, and
   restart while watching the DOM and console.
3. **Responsive / resize testing** — resizing the window across the 760px
   mobile breakpoint (where the cell size changes) and inspecting sprite
   alignment against the grid.

Bugs 1–2 were found and fixed during the initial build. Bugs 3–5 were found in
a later dedicated bug-audit pass after the ship-silhouette feature was added.

---

## Bug 1 — Test harness reported success with a failing exit code

**Symptom.** The first run of `node tests/test.js` printed `39407 passed, 0
failed` but the process exited with code `1`. In CI that inversion would mark a
fully-passing test suite as failed (and a failing suite as passed).

**Root cause.** The exit line had the ternary backwards:

```js
process.exit(failed === 0 ? 1 : 0); // wrong: 0 failures -> exit 1
```

**Fix.** Return `0` on success, `1` on failure:

```js
process.exit(failed === 0 ? 0 : 1);
```

**How it was caught.** Running the suite and inspecting `echo $?` immediately
after — the human-readable output and the exit code disagreed.

---

## Bug 2 — Setup controls stayed visible (and active) during battle

**Symptom.** After pressing **Start Battle**, the "Rotate / Random / Start
Battle / Reset" toolbar was supposed to disappear, but it stayed on screen
during combat. Worse, the **Random** button was still clickable mid-game, which
would silently re-roll the player's fleet in the middle of a battle.

**Root cause.** The controller hides the toolbar with the HTML `hidden`
attribute (`setupControls.hidden = true`). The browser's default
`[hidden] { display: none }` rule is a low-priority user-agent style, and the
toolbar also had an author rule:

```css
.controls { display: flex; }
```

An author `display` declaration beats the user-agent `hidden` style, so the
element kept `display: flex` and remained visible. Confirmed in the console:

```js
sc.hidden            // true
getComputedStyle(sc).display  // "flex"  <- should have been "none"
```

(The "New Game" button used `hidden` correctly only because nothing set an
author `display` on it.)

**Fix.** Make the `hidden` attribute authoritative for the whole app:

```css
[hidden] { display: none !important; }
```

**How it was caught.** During manual browser testing I noticed the toolbar
never went away when the battle started, then verified the computed style in
the dev console.

---

## Bug 3 — Ship silhouettes drifted out of the grid after a resize

**Symptom.** After placing a fleet, shrinking the browser window (or crossing
the 760px mobile breakpoint) left the ship silhouettes floating off their
cells — vertical ships shifted to the right of their column and the bottom ship
hung below the board, no longer lining up with the squares they occupied.

**Root cause.** Each silhouette is an absolutely-positioned overlay whose
`left`/`top`/`width`/`height` are computed once in pixels from the cells'
`offsetLeft`/`offsetWidth` at render time:

```js
sprite.style.left = `${first.offsetLeft}px`;
sprite.style.width = `${last.offsetLeft + last.offsetWidth - left}px`;
```

The CSS shrinks the cells at the breakpoint:

```css
@media (max-width: 760px) { :root { --cell: 28px; } } /* was 34px */
```

Nothing re-ran the sprite layout when the viewport changed, so the sprites kept
their stale 34px-based coordinates while the underlying grid moved to 28px
cells. There was no `resize` handler at all.

**Fix.** Re-render (which recomputes every sprite's geometry) on viewport
change, debounced so a drag-resize doesn't thrash:

```js
window.addEventListener("resize", () => {
  clearTimeout(this.resizeTimer);
  this.resizeTimer = setTimeout(() => this.render(), 100);
});
```

**How it was caught.** Responsive testing: placed a fleet, then resized the
window below 760px and saw the silhouettes detach from the grid. Verified the
fix by repeating the resize and confirming each ship snapped back over its
cells.

---

## Bug 4 — AI abandoned a damaged ship after sinking an adjacent one

**Symptom.** When two ships were next to each other and the AI clipped the
second while finishing the first, sinking the first ship threw away the lead on
the second — the AI dropped back to a blind checkerboard hunt even though it had
already landed a hit on the neighbour. (Previously documented as a "known
limitation"; this audit promoted it to a real fix.)

**Root cause.** On a sink, `registerResult` discarded the *entire* target queue
regardless of which ship those leads belonged to:

```js
} else if (result.sunk) {
  this.targetQueue = []; // drops leads for OTHER damaged ships too
}
```

**Fix.** Track every unresolved hit in `openHits`. On a sink, remove only the
sunk ship's own cells, then rebuild the queue from the hits that remain (i.e.
any other damaged ship), so the AI stays locked on:

```js
this.openHits = this.openHits.filter((h) => !isSunkCell(h));
this.targetQueue = [];
for (const h of this.openHits) {
  this.targetQueue.push(...this.untriedNeighbours(h.r, h.c));
}
```

**How it was caught.** Code review of the hunt/target logic, then a dedicated
unit test that hits two adjacent ships, sinks the first, and asserts the AI's
next move still targets a cell adjacent to the second ship's hit (and that
sinking a fully isolated ship still clears the queue).

---

## Bug 5 — A queued AI turn could fire into a freshly reset game (latent)

**Symptom.** The AI's turn runs on a `setTimeout` after the player's shot. A
latent race: if the game transitioned out of the battle phase (reset / new
game / game over) during that delay, the pending callback would still execute
`aiTurn()` against the new game state. Not reachable through the current UI
(the reset control is hidden during battle), so this is defensive hardening
rather than an observed failure.

**Root cause.** `aiTurn()` assumed it was always invoked mid-battle and never
re-checked the phase before acting.

**Fix.** Bail out (and clear the input lock) if we're no longer in battle:

```js
aiTurn() {
  if (this.phase !== Phase.BATTLE) { this.busy = false; return; }
  ...
}
```

**How it was caught.** Code review of the turn-scheduling flow while auditing
phase transitions.

---

## Known limitations (not bugs)

- Turns strictly alternate; a hit does not grant a bonus shot. This is an
  intentional rule choice to keep the game simple.
