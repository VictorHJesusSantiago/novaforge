import { Scene } from '@novaforge/runtime';
import { Transform } from '@novaforge/core';
import { ShapeRect, TextLabel } from '@novaforge/renderer';
import { INPUT_RESOURCE } from '@novaforge/input';
import { PLAYFIELD, DRAW_LAYER, COLORS } from '../config.js';

/**
 * The pause overlay.
 *
 * Pushed on top of the play scene rather than replacing it. Because only the top scene's systems
 * are registered — the level's were registered by *its* `onEnter` and are still there — this
 * needs one extra thing to actually pause: it stops the clock's simulation by setting the time
 * scale to zero, which halts `fixedUpdate` while leaving `update` and `render` running so the
 * overlay still draws and still reads input.
 */
export class PauseScene extends Scene {
  /**
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/runtime').Game} game
   */
  onEnter(world, game) {
    this._game = game;
    game.clock.timeScale = 0;

    const dim = this.spawn(
      [Transform],
      [
        ShapeRect,
        {
          width: PLAYFIELD.width,
          height: PLAYFIELD.height,
          color: COLORS.background,
          alpha: 0.72,
          layer: DRAW_LAYER.HUD,
          z: 0,
        },
      ],
    );
    world.get(dim, Transform)?.position.set(PLAYFIELD.width / 2, PLAYFIELD.height / 2);

    const title = this.spawn(
      [Transform],
      [
        TextLabel,
        {
          text: 'PAUSED',
          font: '32px monospace',
          align: 'center',
          color: COLORS.hud,
          layer: DRAW_LAYER.HUD,
          z: 1,
        },
      ],
    );
    world.get(title, Transform)?.position.set(PLAYFIELD.width / 2, PLAYFIELD.height / 2 - 20);

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
    world.get(hint, Transform)?.position.set(PLAYFIELD.width / 2, PLAYFIELD.height / 2 + 20);

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
    // Restoring the time scale here rather than in the play scene's `onResume` keeps the pause
    // behaviour entirely inside the scene that caused it.
    if (this._game !== undefined) this._game.clock.timeScale = 1;
  }
}
