# Breakout

A complete small game on the NovaForge runtime, and the thing to read first if you want to know
what using this engine actually feels like.

```bash
npm install      # from the repository root
npm run dev      # serves this example at http://localhost:5173
```

| Control | Action |
| --- | --- |
| <kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd> | Move the paddle |
| <kbd>Space</kbd> | Launch the ball, and restart after a game over |
| <kbd>Esc</kbd> | Pause |
| <kbd>F3</kbd> | Toggle the stats panel |

A gamepad works too — left stick and the south face button.

---

## What it exercises

This is not a demo written against a mocked-out engine. It runs the real thing:

- **The ECS.** Bricks, the ball, the paddle and the HUD labels are all entities; the game logic
  is seven systems totalling under 200 lines.
- **The physics engine.** Every bounce is the SAT narrowphase and the impulse solver, not a
  hand-written `if (ball.x < wall.x)`. The bricks are static bodies, the paddle is kinematic, the
  ball is dynamic with restitution 1, and the loss condition is a trigger volume.
- **The scene stack.** Pause pushes a scene on top of the level rather than replacing it, so
  resuming is instant and keeps every entity alive.
- **Action maps.** Nothing in the game reads a key code. Rebinding would touch one file.
- **The draw list.** The HUD is drawn through the same pipeline as the game, on a higher layer.

## No assets required

The whole game draws with shape primitives, so there is no art to load. Sounds *are* declared in
the scene's manifest but the `assets/sounds/` directory is empty — the mixer falls back to silence
for anything that fails to load (Invariant A1), which is exactly the behaviour that keeps a game
editable while its assets are still missing. Drop `brick.wav` and `lose.wav` in there and they
start playing with no code change.

## Things worth reading

- [`src/scenes/play-scene.js`](src/scenes/play-scene.js) — system ordering, and why each system
  sits where it does relative to the physics step. This is the part of ECS work that is easy to
  get subtly wrong.
- [`src/systems/ball.js`](src/systems/ball.js) — the two corrections every breakout needs: pinning
  the ball to a constant speed, and refusing to let it settle into a near-horizontal path.
- [`src/systems/bricks.js`](src/systems/bricks.js) — reacting to buffered contact events, and why
  destroying the brick a frame later is the right trade.
- [`src/config.js`](src/config.js) — every tunable in one place, which is what the editor's
  inspector will eventually edit.
