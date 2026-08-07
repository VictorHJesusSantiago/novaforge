import { Scene } from '@novaforge/runtime';
import { Transform } from '@novaforge/core';
import { AABB } from '@novaforge/math';
import { RigidBody } from '@novaforge/physics';
import { INPUT_RESOURCE } from '@novaforge/input';
import { installStateMachineSystem, installTimelineSystem } from '@novaforge/animation';
import { installTilemapSystem } from '@novaforge/renderer';
import { Coin, Player, PlayerState, createSession, SESSION } from '../components.js';
import { VIEWPORT, RULES, COLORS } from '../config.js';
import { LEVEL_GRID, LEVEL_PIXEL_WIDTH, LEVEL_PIXEL_HEIGHT, PLAYER_START, GOAL_POSITION, COIN_POSITIONS } from '../level.js';
import {
  createTilemap,
  buildGroundColliders,
  createPlayer,
  createHazard,
  createGoal,
  createCoin,
  createHudText,
} from '../factories.js';
import { groundCheckSystem, playerControlSystem } from '../systems/player.js';
import { cameraFollowSystem } from '../systems/camera.js';
import { hazardSystem, makeRestartSystem } from '../systems/hazards.js';
import { goalSystem } from '../systems/goal.js';
import { coinSystem } from '../systems/coins.js';
import { playerAnimationParamsSystem } from '../systems/animation.js';
import { hudFollowCameraSystem, hudSystem } from '../systems/hud.js';

/**
 * The game itself.
 *
 * Same shape as `examples/breakout`'s `PlayScene`: a `preload`, a level layout, and a list of
 * systems with explicit ordering. What differs is everything the brief for this example exists
 * to exercise — the tilemap, a scrolling camera, and the animation state machine.
 */
export class PlayScene extends Scene {
  constructor() {
    super();
    /** System handles installed directly on the world — see `onEnter`'s comment. @type {number[]} */
    this._engineSystemHandles = [];
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/runtime').Game} game
   */
  onEnter(world, game) {
    world.setResource(SESSION, createSession(RULES.lives));

    this._game = game;
    this._bindControls(world);

    // These three install systems directly on the world rather than through `this.addSystem`,
    // so — unlike everything else in `_registerSystems` — they are not torn down automatically
    // when the scene exits. Tracked here and removed in `onExit` for the same reason
    // CLAUDE.md's testing notes call out: a leaked system from a previous scene keeps running
    // and produces a game that behaves as though two levels are active at once.
    this._engineSystemHandles = [
      installStateMachineSystem(world),
      installTimelineSystem(world),
      installTilemapSystem(world),
    ];

    this._buildLevel();
    this._buildHud();
    this._registerSystems();

    game.camera.bounds = new AABB(
      VIEWPORT.width / 2,
      LEVEL_PIXEL_HEIGHT / 2,
      Math.max(VIEWPORT.width / 2, LEVEL_PIXEL_WIDTH - VIEWPORT.width / 2),
      LEVEL_PIXEL_HEIGHT / 2,
    );
    game.camera.snapTo({ x: PLAYER_START.x, y: LEVEL_PIXEL_HEIGHT / 2 });
  }

  /**
   * @param {import('@novaforge/core').World} world
   */
  onExit(world) {
    for (const handle of this._engineSystemHandles) world.removeSystem(handle);
    this._engineSystemHandles = [];
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @private
   */
  _bindControls(world) {
    const input = world.getResource(INPUT_RESOURCE);
    if (input === undefined) return;

    input.actions
      .define('jump', [{ key: 'Space' }, { key: 'ArrowUp' }, { key: 'KeyW' }, { gamepadButton: 0 }])
      .define('pause', [{ key: 'Escape' }])
      .define('debug', [{ key: 'F3' }])
      .defineAxis('moveX', {
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
        gamepadAxis: 0,
      });
  }

  /** @private */
  _buildLevel() {
    createTilemap(this, LEVEL_GRID);
    buildGroundColliders(this, LEVEL_GRID);
    createHazard(this);
    createGoal(this, GOAL_POSITION);
    for (const position of COIN_POSITIONS) createCoin(this, position);

    this._player = createPlayer(this, PLAYER_START);
  }

  /** @private */
  _buildHud() {
    createHudText(this, { offsetX: 12, offsetY: 24, field: 'score', align: 'left' });
    createHudText(this, { offsetX: VIEWPORT.width - 12, offsetY: 24, field: 'lives', align: 'right' });
    createHudText(this, {
      offsetX: VIEWPORT.width / 2,
      offsetY: VIEWPORT.height / 2,
      field: 'message',
      align: 'center',
      font: '24px monospace',
      color: COLORS.hud,
    });
  }

  /**
   * Reset the run: lives, score, coins, and the player back at the start. Called on entry and
   * on restart.
   * @returns {void}
   */
  resetRun() {
    const world = this.world;

    for (const [entity] of world.query([Coin])) world.destroy(entity);
    world.flushDestroyed();
    for (const position of COIN_POSITIONS) createCoin(this, position);

    const player = world.query([Transform, RigidBody, PlayerState, Player]).first();
    if (player !== null) {
      const [, transform, body, state] = player;
      transform.position.set(PLAYER_START.x, PLAYER_START.y);
      transform.previousPosition.copyFrom(transform.position);
      body.velocity.set(0, 0);
      state.grounded = false;
    }

    const session = world.getResource(SESSION);
    if (session !== undefined) {
      session.score = 0;
      session.lives = RULES.lives;
      session.outcome = 'playing';
      session.message = '';
    }
  }

  /** @private */
  _registerSystems() {
    // Ordering, the interesting part of this file — the same two engine-owned slots
    // (`syncPreviousTransform` at -1000, `physicsStep` at 0) every scene in this repo works
    // around.
    //
    //   -1000  syncPreviousTransform  (engine)
    //     -21  groundCheck            reads last step's broadphase tree, before anything jumps
    //     -20  playerControl          set velocity BEFORE the integrator runs
    //       0  physicsStep            (engine)
    this.addSystem('fixedUpdate', groundCheckSystem, { order: -21, name: 'groundCheck' });
    this.addSystem('fixedUpdate', playerControlSystem, { order: -20, name: 'playerControl' });

    // -7  animation parameters, before the state machine reads them at -6
    // -6  stateMachine (engine, via installStateMachineSystem)
    // -5  timeline     (engine, via installTimelineSystem)
    this.addSystem('update', playerAnimationParamsSystem, { order: -7, name: 'playerAnimationParams' });

    this.addSystem('update', cameraFollowSystem, { order: -50, name: 'cameraFollow' });
    this.addSystem('update', coinSystem, { order: 0, name: 'coins' });
    this.addSystem('update', hazardSystem, { order: 10, name: 'hazard' });
    this.addSystem('update', goalSystem, { order: 20, name: 'goal' });
    this.addSystem('update', makeRestartSystem(() => this.resetRun()), { order: 30, name: 'restart' });
    this.addSystem('update', hudFollowCameraSystem, { order: 95, name: 'hudFollowCamera' });
    this.addSystem('update', hudSystem, { order: 100, name: 'hud' });

    this.addSystem(
      'update',
      (world) => {
        const input = world.getResource(INPUT_RESOURCE);
        const scenes = this._game?.scenes;
        if (scenes === undefined || scenes.isTransitioning) return;
        if (scenes.active !== this) return;
        if (input?.actions.pressed('pause')) void scenes.push('pause');
      },
      { order: -100, name: 'pauseInput' },
    );
  }
}
