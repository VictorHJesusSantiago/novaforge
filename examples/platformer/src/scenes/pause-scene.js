import { Scene } from '@novaforge/runtime';
import { Transform } from '@novaforge/core';
import { ShapeRect, TextLabel } from '@novaforge/renderer';
import { INPUT_RESOURCE } from '@novaforge/input';
import { VIEWPORT, DRAW_LAYER, COLORS } from '../config.js';

/**
 * The pause overlay. Same mechanism as `examples/breakout`'s `PauseScene`: pushed on top rather
 * than replacing, and it halts the simulation with `game.clock.timeScale = 0` rather than by
 * removing any systems.
 *
 * Positioned at the camera's *current* centre rather than a fixed level coordinate — this game's
 * camera scrolls, so a fixed world position would only be on-screen near the start of the level.
 * Captured once, on entry: the underlying `PlayScene`'s `cameraFollowSystem` keeps running while
 * paused (it lives in `update`, which `timeScale` does not affect), but the player is not
 * moving either, so the camera has settled by the time a pause is even possible to trigger.
 */
export class PauseScene extends Scene {
  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/runtime').Game} game
   */
  onEnter(world, game) {
    this._game = game;
    game.clock.timeScale = 0;

    const center = game.camera.position;

    const dim = this.spawn(
      [Transform],
      [
        ShapeRect,
        {
          width: VIEWPORT.width,
          height: VIEWPORT.height,
          color: COLORS.background,
          alpha: 0.72,
          layer: DRAW_LAYER.HUD,
          z: 0,
        },
      ],
    );
    world.get(dim, Transform)?.position.set(center.x, center.y);

    const title = this.spawn(
      [Transform],
      [
        TextLabel,
        { text: 'PAUSED', font: '32px monospace', align: 'center', color: COLORS.hud, layer: DRAW_LAYER.HUD, z: 1 },
      ],
    );
    world.get(title, Transform)?.position.set(center.x, center.y - 20);

    const hint = this.spawn(
      [Transform],
      [
        TextLabel,
        {
          text: 'Esc to resume',
          font: '16px monospace',
          align: 'center',
          color: COLORS.hudMuted,
          layer: DRAW_LAYER.HUD,
          z: 1,
        },
      ],
    );
    world.get(hint, Transform)?.position.set(center.x, center.y + 20);

    this.addSystem(
      'update',
      (w) => {
        const input = w.getResource(INPUT_RESOURCE);
        if (input?.actions.pressed('pause')) {
          void game.scenes.pop();
        }
      },
      { order: -100, name: 'pauseInput' },
    );
  }

  onExit() {
    if (this._game !== undefined) this._game.clock.timeScale = 1;
  }
}
