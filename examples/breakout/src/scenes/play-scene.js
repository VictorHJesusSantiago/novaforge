import { Scene } from '@novaforge/runtime';
import { INPUT_RESOURCE } from '@novaforge/input';
import { Brick, createSession, SESSION } from '../components.js';
import { PLAYFIELD, BRICKS, RULES, COLORS } from '../config.js';
import {
  createWall,
  createPaddle,
  createBall,
  createBrick,
  createDeathZone,
  createHudText,
} from '../factories.js';
import { paddleSystem } from '../systems/paddle.js';
import { ballAttachSystem, ballSpeedSystem, ballLossSystem, makeRestartSystem } from '../systems/ball.js';
import { brickSystem, winConditionSystem } from '../systems/bricks.js';
import { hudSystem } from '../systems/hud.js';

/**
 * The game itself.
 *
 * Worth reading as an example of what a NovaForge scene looks like: a `preload`, a level layout,
 * and a list of systems with explicit ordering. There is no update method and no game loop — the
 * scene describes what exists and what runs, and the runtime does the rest.
 */
export class PlayScene extends Scene {
  preload() {
    // Breakout draws entirely with shape primitives, so it has no texture manifest. Sounds are
    // listed but optional: the mixer falls back to silence for anything that fails to load
    // (Invariant A1), so the game is fully playable with the asset directory empty.
    return {
      sounds: {
        brick: 'sounds/brick.wav',
        lose: 'sounds/lose.wav',
      },
    };
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/runtime').Game} game
   */
  onEnter(world, game) {
    world.setResource(SESSION, createSession(RULES.lives));

    this._game = game;
    this._bindControls(world);
    this._buildPlayfield();
    this._buildHud();
    this.rebuildLevel();
    this._registerSystems();

    // The camera sits on the playfield centre and never moves; breakout has no scrolling.
    game.camera.snapTo({ x: PLAYFIELD.width / 2, y: PLAYFIELD.height / 2 });
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @private
   */
  _bindControls(world) {
    const input = world.getResource(INPUT_RESOURCE);
    if (input === undefined) return;

    input.actions
      .define('launch', [{ key: 'Space' }, { mouse: 0 }, { gamepadButton: 0 }])
      .define('pause', [{ key: 'Escape' }])
      .define('debug', [{ key: 'F3' }])
      .defineAxis('moveX', {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
        gamepadAxis: 0,
      });
  }

  /** @private */
  _buildPlayfield() {
    const t = PLAYFIELD.wallThickness;

    createWall(this, { x: t / 2, y: PLAYFIELD.height / 2, width: t, height: PLAYFIELD.height });
    createWall(this, {
      x: PLAYFIELD.width - t / 2,
      y: PLAYFIELD.height / 2,
      width: t,
      height: PLAYFIELD.height,
    });
    createWall(this, { x: PLAYFIELD.width / 2, y: t / 2, width: PLAYFIELD.width, height: t });

    createDeathZone(this);
    this._paddle = createPaddle(this);
    this._ball = createBall(this);
  }

  /** @private */
  _buildHud() {
    createHudText(this, { x: PLAYFIELD.wallThickness + 12, y: 24, field: 'score', align: 'left' });
    createHudText(this, {
      x: PLAYFIELD.width - PLAYFIELD.wallThickness - 12,
      y: 24,
      field: 'lives',
      align: 'right',
    });
    createHudText(this, {
      x: PLAYFIELD.width / 2,
      y: PLAYFIELD.height / 2,
      field: 'message',
      align: 'center',
      font: '24px monospace',
      color: COLORS.hud,
    });
  }

  /**
   * Clear the bricks and lay out a fresh wall. Called on entry and on restart.
   * @returns {void}
   */
  rebuildLevel() {
    const world = this.world;

    for (const [entity] of world.query([Brick])) {
      world.destroy(entity);
    }
    // Reclaim now rather than at the end of the frame: the new bricks are about to be created
    // at the same positions, and two sets overlapping for a frame would produce a burst of
    // spurious contacts.
    world.flushDestroyed();

    for (let row = 0; row < BRICKS.rows; row += 1) {
      for (let column = 0; column < BRICKS.columns; column += 1) {
        createBrick(this, column, row);
      }
    }
  }

  /** @private */
  _registerSystems() {
    // Ordering is the interesting part of this file.
    //
    // The engine occupies two slots in `fixedUpdate`: `syncPreviousTransform` at -1000 and the
    // physics step at 0. Everything here is placed relative to those.
    //
    //   -1000  syncPreviousTransform   (engine)
    //     -20  paddle                  set the paddle's velocity BEFORE the integrator runs
    //       0  physicsStep             (engine) integrates and resolves
    //      90  ballAttach              park the ball on the paddle's POST-integration position,
    //                                  otherwise it trails the paddle by one step of movement
    //     100  ballSpeed               renormalise AFTER the solver has changed the velocity
    this.addSystem('fixedUpdate', paddleSystem, { order: -20, name: 'paddle' });
    this.addSystem('fixedUpdate', ballAttachSystem, { order: 90, name: 'ballAttach' });
    this.addSystem('fixedUpdate', ballSpeedSystem, { order: 100, name: 'ballSpeed' });

    this.addSystem('update', brickSystem, { order: 0, name: 'bricks' });
    this.addSystem('update', ballLossSystem, { order: 10, name: 'ballLoss' });
    this.addSystem('update', winConditionSystem, { order: 20, name: 'winCondition' });
    this.addSystem('update', makeRestartSystem(() => this.rebuildLevel()), {
      order: 30,
      name: 'restart',
    });
    this.addSystem('update', hudSystem, { order: 100, name: 'hud' });

    // Pushing rather than changing: the level stays resident underneath, so resuming costs
    // nothing and no state has to be saved.
    this.addSystem(
      'update',
      (world) => {
        const input = world.getResource(INPUT_RESOURCE);
        const scenes = this._game?.scenes;
        if (scenes === undefined || scenes.isTransitioning) return;
        if (scenes.active !== this) return; // already paused; the pause scene owns Escape now
        if (input?.actions.pressed('pause')) void scenes.push('pause');
      },
      { order: -100, name: 'pauseInput' },
    );
  }
}
