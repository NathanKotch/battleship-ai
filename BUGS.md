# Bugs Found & Fixes

This document records the real bugs I hit while building and debugging the
game, how I found them, the root cause, and the fix. Testing was done two ways:

1. **Automated logic tests** (`tests/test.js`) — ~39,400 assertions covering
   ship placement, firing mechanics, 200 randomized fleet layouts, 300
   full simulated games, and the AI sinking a full fleet within 100 shots.
2. **Manual browser testing** — playing through setup, combat, win/lose, and
   restart while watching the DOM and console.

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

## Known limitations (not bugs)

- When two ships sit directly next to each other, the AI clears its remaining
  target leads after sinking the first one, so it briefly returns to hunting
  before re-acquiring the neighbour. This is a minor strategy nicety, not a
  correctness issue — games always terminate with a correct winner (verified
  over 300 simulated games).
- Turns strictly alternate; a hit does not grant a bonus shot. This is an
  intentional rule choice to keep the game simple.
