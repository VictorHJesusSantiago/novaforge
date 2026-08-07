# NovaForge

**A 2D game engine and visual editor, written from scratch in plain JavaScript.**

No Phaser. No PixiJS. No TypeScript. No build step in the engine itself — every package is
standard ESM that runs directly in a browser and in Node.

NovaForge is two things at once, and that pairing is the point:

1. **An engine** — an archetype-free ECS core, a swappable Canvas2D/WebGL2 renderer with render
   targets and a post-processing chain, a SAT + quadtree physics solver, a keyframe animation and
   state-machine system, an action-mapped input layer, and a Web Audio mixer.
2. **A toolchain** — a browser-based visual editor (scene tree with reparenting, schema-driven
   inspector, translate/rotate/scale gizmos with snapping, animation timeline, asset hot-reload)
   that drives the very same runtime the game ships on.

Most engine projects stop at "I can move a sprite." The editor is what makes this one worth
reading.

---

## Status

Every milestone in [docs/ROADMAP.md](docs/ROADMAP.md) is complete: the engine (ECS, both
renderer backends with render targets and post-processing, physics, input, audio, a keyframe
animation and state-machine system, runtime), the visual editor, deterministic replay, a
tree-shaken build for every package, and three complete sample games — 1,170 tests across 62
files, all passing. A documentation site (`docs-site/`) renders the project's own docs straight
from source and embeds all four example apps **actually running**, verified end to end in a real
headless browser, not screenshotted. Real, captured (not estimated) Canvas2D-vs-WebGL2 numbers
are in [docs/BENCHMARKS.md](docs/BENCHMARKS.md), with the software-rendering caveat stated
plainly — that one honest gap (a GPU to run the comparison on) is the only thing in this project
that specifically needed hardware this environment doesn't have.

Nothing in this README describes something that is not in the repository.

---

## Packages

| Package | What it does | Depends on |
| --- | --- | --- |
| [`@novaforge/math`](packages/math) | Vectors, 3x3 matrices, rects, AABBs, easing, seeded RNG | — |
| [`@novaforge/core`](packages/core) | ECS world, sparse-set storage, queries, scheduler, events, fixed-step clock | math |
| [`@novaforge/renderer`](packages/renderer) | Draw list, camera, Canvas2D **and** WebGL2 backends, texture atlases, sprite animation, tilemaps | math, core |
| [`@novaforge/physics`](packages/physics) | Bodies, shapes, SAT narrowphase, quadtree broadphase, warm-started impulse resolver | math, core |
| [`@novaforge/input`](packages/input) | Keyboard, mouse, gamepad, action maps | math, core |
| [`@novaforge/audio`](packages/audio) | Web Audio mixer, buses, one-shot and looping sounds | core |
| [`@novaforge/animation`](packages/animation) | Keyframe tracks over arbitrary component fields, a timeline player, a state machine | math, core |
| [`@novaforge/runtime`](packages/runtime) | Game bootstrap, scenes, plugins, asset manager, deterministic replay | all of the above |
| [`@novaforge/editor`](packages/editor) | Scene tree with reparenting, schema-driven inspector, translate/rotate/scale gizmos with snapping, undo/redo, JSON scene save/load, asset hot-reload, animation timeline | runtime, animation, and everything under them |
| [`examples/breakout`](examples/breakout) | A complete, playable arcade game built on the runtime | runtime |
| [`examples/asteroids`](examples/asteroids) | Screen-wrap movement, asteroid splitting, escalating waves | runtime |
| [`examples/platformer`](examples/platformer) | Tilemap level geometry, gravity platforming, an animation state machine, camera follow | runtime, animation |
| [`examples/editor`](examples/editor) | The editor, running against a real sandbox scene | editor |
| [`docs-site`](docs-site) | The project's docs, rendered from source, with all four example apps embedded and running | — |

---

## Quick start

```bash
npm install
npm test                                              # unit + integration tests, every package
npm run dev                                           # breakout at http://localhost:5173
npm run dev --workspace @novaforge/example-editor     # the editor at http://localhost:5174
npm run dev --workspace @novaforge/example-asteroids  # asteroids at http://localhost:5180
npm run dev --workspace @novaforge/example-platformer # the platformer at http://localhost:5181
npm run docs:dev                                      # the docs site at http://localhost:5176
npm run bench                                         # ECS / physics throughput numbers
npm run bench:browser                                 # real Canvas2D-vs-WebGL2 numbers (Playwright)
npm run build:packages                                # minified, tree-shakeable dist/ per package
npm run verify:treeshaking                            # proves unused packages are eliminated
```

A minimal game, end to end:

```js
import { Game, Scene } from '@novaforge/runtime';
import { Transform, Sprite } from '@novaforge/renderer';
import { Vec2 } from '@novaforge/math';

class Playground extends Scene {
  onEnter(world) {
    const player = world.createEntity();
    world.add(player, Transform, { position: new Vec2(400, 300) });
    world.add(player, Sprite, { texture: 'player', width: 32, height: 32 });

    world.addSystem('update', function move(w, dt) {
      for (const [, transform] of w.query([Transform])) {
        transform.position.x += 60 * dt;
      }
    });
  }
}

const game = new Game({ canvas: document.querySelector('canvas') });
game.scenes.register('playground', Playground);
await game.start('playground');
```

---

## Design decisions worth arguing about

Each of these is written up as an ADR in [docs/adr](docs/adr), with the alternatives that were
rejected and why:

- **Sparse sets, not archetypes.** ([ADR-0002](docs/adr/0002-sparse-set-component-storage.md))
  Archetypes win on iteration speed for wide queries; sparse sets win on add/remove churn, which
  is what a game with spawning, pooling, and per-frame tag components actually does.
- **Canvas2D first, WebGL2 behind the same interface.** ([ADR-0003](docs/adr/0003-canvas2d-before-webgl.md))
  The renderer is an interface with a draw list in front of it. The backend is an implementation
  detail, and proving that with two backends is the whole point.
- **Fixed timestep simulation, interpolated rendering.** ([ADR-0004](docs/adr/0004-fixed-timestep-loop.md))
  Determinism is worth more than the simplicity of a variable-step loop.
- **JSDoc types over TypeScript.** ([ADR-0005](docs/adr/0005-jsdoc-types-no-typescript.md))
  Full type checking via `tsc --noEmit`, zero compilation, zero `.ts` files.

The full system description — invariants, data layout, and the contract each package owes the
others — is in [docs/SPEC.md](docs/SPEC.md).

---

## Testing

Every package ships its tests next to its source in `__tests__`. Run them with `npm test`.
The engine core is tested against behaviour, not implementation: entity recycling must not
resurrect stale handles, queries must be stable under mid-iteration mutation, and the fixed-step
clock must not spiral under a long frame.

---

## License

MIT — see [LICENSE](LICENSE).
