# VibeArcade

Six 8-bit games on one 256x240 canvas, built to be dropped into other games on the site. Plain ES modules, no build step.

| id | game | genre |
|---|---|---|
| `fishing` | Bass Ackwards | fishing |
| `techdebt` | Tech Debt | brick breaker |
| `unsubscribe` | Unsubscribe | space shooter |
| `doze` | Doze the Cloud | demolition |
| `suckitup` | Suck It Up | maze chase |
| `guerrilla` | Guerrilla Marketing | run and gun |

Pass `'menu'` instead of an id for the six-in-one cabinet.

## Putting a cabinet in a game

```js
import { Arcade } from '/arcade/arcade.js';

// The player walks up and presses a key: full-page overlay, resolves when they leave.
const { score, best, hi } = await Arcade.play('fishing');

// A 3D or 2D screen in your world. It runs its attract demo by itself.
const cab = Arcade.create('fishing');
const texture = new THREE.CanvasTexture(cab.canvas);
// every frame: cab.update(dt); texture.needsUpdate = true;

// Inside an element of yours. Takes the keyboard until cab.destroy().
const cab2 = Arcade.mount(document.querySelector('#screen'), 'menu');
```

From a non-module script use `import('/arcade/arcade.js')`, as Strange Weather does through Godot's `JavaScriptBridge`. An iframe also works: `/arcade/?game=fishing&embed=1` posts `{ vibearcade: true, type: 'gameover' | 'exit', score, hi }` to its parent.

Options for all three: `sound`, `seed`, `games: ['fishing', ...]` (limits the menu), `storage: false` (keep high scores only until the page closes), `onStart({ id })` (return `false` to refuse, for charging coins), `onGameOver({ id, score, hi, isHi, msg })`, `onExit(...)`.

Hosts that drive input themselves call `cab.press('a', true)`. Buttons are `up down left right a b start back`. Keys are arrows or WASD, Z or Space for A, X for B, Enter for start or pause, Esc to back out.

## High scores

Each game keeps a top 10 in the player's browser (`localStorage`, `vibearcade.top.<id>`), so every browser is its own machine. A score that makes the table asks for three initials, picked with up and down, and the row is saved the moment the game ends so backing out can't lose it. X (button B) shows the table from the title screen or menu, and it also plays in the attract loop.

## Adding a game

Add `games/yours.js` exporting `{ id, title, genre, blurb, controls, create(a) }` and list it in `GAMES` in `arcade.js`. `create` returns `{ update(), draw(g), bot() }`: `a` is input, randomness, score and `a.over()`, `g` is the drawing API in `gfx.js`, and `bot()` plays the attract demo. Keep `y >= 10` clear for the score bar.
