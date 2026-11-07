# Red Tag — design notes

Tim's brief (2026-11-07): a *reverse theme park designer*. You are a federal inspector sent to procedurally
generated theme parks and decide whether the rides, and the park in general, meet health and safety standards.
AA graphics, models built in Blender.

## Loop

* One shift per park, 08:00–17:00 game time. Every action costs minutes: walking between rides, examining an
  inspection point (4 min), reading the paperwork (6 min), a test run with crash dummies (12 min).
* Each **target** (coaster, ferris wheel, drop tower, swing ride, pirate ship, food stand, first aid) has
  inspection points. Examining one gives raw findings (measurements against nominal values, counts, dates).
  The player marks each finding OK or Violation, looking limits up in the **code book** (`js/code.js`).
* Severe defects are often visible in 3D (rust, missing bolts, raised lap bars, open gondola doors, missing brake
  fins, missing guard, open electrical panel), so a sharp eye saves time.
* Per target the player stamps **Approve / Cite / Red Tag**. Truth = worst true defect (none / minor / major).
* At 17:00 anything unstamped opens as Approved. The shift report scores verdicts and flags, and every major
  defect you let through becomes a newspaper headline. Three incidents and you're fired.

## Modules

| file | what |
| --- | --- |
| `build_assets.py` | Blender: every part → `assets/parts.glb` (names are the contract with `world.js`) |
| `js/rng.js` | seeded RNG + pickers |
| `js/code.js` | code book sections, limits, defect catalog |
| `js/gen.js` | pure park generator (layout, coaster track + physics, points, findings, defects). Runs in node. |
| `js/world.js` | three.js scene from a park: terrain, paths, models, decor, crowd, markers |
| `js/rides.js` | ride animation + test-run traces |
| `js/ui.js` | DOM: clipboard, code book, finding cards, charts, reports |
| `js/main.js` | renderer, post, camera, input, game clock, `window.__rt` hooks |
| `tools/simtest.mjs` | node: generate many parks, check invariants (coaster never stalls, defects realised, etc.) |

Blender → three axes: Blender (x, y, z) becomes three (x, z, -y). Parts are authored with their front facing
Blender -Y (three +Z), up +Z, metres.
