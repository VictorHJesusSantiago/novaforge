import { InputManager, INPUT_RESOURCE } from './input-manager.js';

/**
 * Install input sampling on a world.
 *
 * Runs at order `-1000` in `preUpdate`, before anything else in the frame. Every system that
 * reads input — including the event drain — must see the same snapshot, and the only way to
 * guarantee that is to take it first.
 *
 * @param {import('@novaforge/core').World} world
 * @param {object} [options]
 * @param {import('@novaforge/renderer').Camera2D} [options.camera] projects the mouse into
 *   world space each frame
 * @returns {{ input: InputManager, handles: number[] }}
 */
export function installInputSystems(world, options = {}) {
  const input = new InputManager();
  world.setResource(INPUT_RESOURCE, input);

  const handles = [
    world.addSystem(
      'preUpdate',
      () => {
        input.update();

        const camera = options.camera;
        if (camera !== undefined) {
          const world2d = camera.screenToWorld({ x: input.mouse.x, y: input.mouse.y });
          input.mouse.worldX = world2d.x;
          input.mouse.worldY = world2d.y;
        } else {
          // No camera: world space is screen space. The correct degenerate answer, and it
          // keeps `mouse.worldX` readable rather than undefined.
          input.mouse.worldX = input.mouse.x;
          input.mouse.worldY = input.mouse.y;
        }
      },
      { order: -1000, name: 'sampleInput' },
    ),
  ];

  return { input, handles };
}
