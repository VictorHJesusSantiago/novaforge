import { Mat3 } from '@novaforge/math';
import { DrawKind } from './draw-list.js';
import { channels } from './color.js';

/**
 * The pure, DOM-free half of the WebGL2 backend: turning a draw command into vertex floats, and
 * building the world-to-clip-space matrix. Kept apart from `WebGL2Renderer` itself so it can be
 * unit tested in Node with no canvas and no GL context, the same way `Camera2D` and `DrawList`
 * are — the GL glue (shader compilation, buffer upload) is the only part that genuinely needs a
 * browser, and it stays a thin, deliberately untested layer over this.
 *
 * **Vertex layout**, 9 floats, matching `ATTRIBUTE_STRIDE`:
 * `x, y, u, v, r, g, b, a, shapeMode`
 *
 * `shapeMode` is `0` for a plain textured quad and `1` for a circle; the fragment shader discards
 * fragments outside the unit circle in UV space when it is `1`. One shader handles both, which is
 * what lets circles batch into the same draw call as sprites and rects.
 */

/** Floats per vertex. */
export const ATTRIBUTE_STRIDE = 9;

/** Vertices per quad (two triangles, no shared index buffer — simplest correct thing). */
export const VERTICES_PER_QUAD = 6;

const SHAPE_QUAD = 0;
const SHAPE_CIRCLE = 1;

/**
 * The matrix that carries a world-space point all the way to clip space: the camera's
 * world-to-screen transform, followed by an orthographic projection from screen pixels
 * (origin top-left, y-down — what `Camera2D.viewMatrix` produces) to clip space
 * (origin centre, y-up, [-1, 1]).
 *
 * `Mat3` stores its 9 elements column-major (ADR "storage layout" note in mat3.js), which is
 * exactly the layout `uniformMatrix3fv` expects — this matrix uploads with no repacking.
 *
 * @param {import('./camera.js').Camera2D} camera
 * @param {number} canvasWidth CSS pixels
 * @param {number} canvasHeight CSS pixels
 * @returns {Mat3}
 */
export function worldToClipMatrix(camera, canvasWidth, canvasHeight) {
  const projection = Mat3.translation(-1, 1).multiply(
    Mat3.scaling(2 / canvasWidth, -2 / canvasHeight),
  );
  return projection.multiply(camera.viewMatrix());
}

/**
 * @param {number} packedColor 0xRRGGBB
 * @param {number} alpha 0-1
 * @returns {[number, number, number, number]} r, g, b in [0,1], alpha unchanged
 */
function colorToFloats(packedColor, alpha) {
  const { r, g, b } = channels(packedColor);
  return [r / 255, g / 255, b / 255, alpha];
}

/**
 * Append one quad's vertices (2 triangles) to a growable float array.
 *
 * @param {number[]} out
 * @param {{ x: number, y: number }} topLeft
 * @param {{ x: number, y: number }} topRight
 * @param {{ x: number, y: number }} bottomRight
 * @param {{ x: number, y: number }} bottomLeft
 * @param {{ u0: number, v0: number, u1: number, v1: number }} uv
 * @param {[number, number, number, number]} color
 * @param {number} shapeMode
 * @returns {void}
 */
function pushQuad(out, topLeft, topRight, bottomRight, bottomLeft, uv, color, shapeMode) {
  const [r, g, b, a] = color;
  /** @param {{x:number,y:number}} p @param {number} u @param {number} v */
  const vertex = (p, u, v) => out.push(p.x, p.y, u, v, r, g, b, a, shapeMode);

  // Two triangles: (TL, TR, BR) and (TL, BR, BL). Winding does not matter here — the shader
  // has no backface culling — but a consistent order keeps the buffer easy to reason about.
  vertex(topLeft, uv.u0, uv.v0);
  vertex(topRight, uv.u1, uv.v0);
  vertex(bottomRight, uv.u1, uv.v1);
  vertex(topLeft, uv.u0, uv.v0);
  vertex(bottomRight, uv.u1, uv.v1);
  vertex(bottomLeft, uv.u0, uv.v1);
}

/**
 * The four rotated corners of a sprite/rect quad, in world space.
 * @param {number} x @param {number} y @param {number} width @param {number} height
 * @param {number} rotation @param {number} anchorX @param {number} anchorY
 * @returns {{ topLeft: any, topRight: any, bottomRight: any, bottomLeft: any }}
 */
function quadCorners(x, y, width, height, rotation, anchorX, anchorY) {
  const offsetX = -width * anchorX;
  const offsetY = -height * anchorY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  /** @param {number} lx @param {number} ly */
  const at = (lx, ly) => ({
    x: x + lx * cos - ly * sin,
    y: y + lx * sin + ly * cos,
  });

  return {
    topLeft: at(offsetX, offsetY),
    topRight: at(offsetX + width, offsetY),
    bottomRight: at(offsetX + width, offsetY + height),
    bottomLeft: at(offsetX, offsetY + height),
  };
}

/**
 * Texture atlas UVs, in [0,1], for a command's source rect within its texture.
 * @param {any} command a SPRITE draw command
 * @param {number} textureWidth pixels
 * @param {number} textureHeight pixels
 * @returns {{ u0: number, v0: number, u1: number, v1: number }}
 */
function spriteUV(command, textureWidth, textureHeight) {
  if (command.sourceWidth > 0 && command.sourceHeight > 0 && textureWidth > 0 && textureHeight > 0) {
    return {
      u0: command.sourceX / textureWidth,
      v0: command.sourceY / textureHeight,
      u1: (command.sourceX + command.sourceWidth) / textureWidth,
      v1: (command.sourceY + command.sourceHeight) / textureHeight,
    };
  }
  return { u0: 0, v0: 0, u1: 1, v1: 1 };
}

/** UVs spanning the whole 1x1 white pixel used for untextured shapes. */
const FULL_UV = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * Append a draw command's vertices to `out`, or do nothing for a kind this batcher does not
 * rasterise (`TEXT` — see the WebGL2Renderer class doc for why).
 *
 * @param {number[]} out
 * @param {any} command a DrawList command
 * @param {{ width: number, height: number } | undefined} textureSize the source texture's pixel
 *   size, needed to convert a sprite's pixel-space source rect into UVs; omitted for untextured
 *   commands, which is a no-op for this parameter
 * @returns {void}
 */
export function appendCommandVertices(out, command, textureSize) {
  switch (command.kind) {
    case DrawKind.SPRITE: {
      const corners = quadCorners(
        command.x,
        command.y,
        command.width * command.scaleX,
        command.height * command.scaleY,
        command.rotation,
        command.anchorX,
        command.anchorY,
      );
      const uv = spriteUV(command, textureSize?.width ?? 0, textureSize?.height ?? 0);
      const color = colorToFloats(command.tint, command.alpha);
      pushQuad(out, corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft, uv, color, SHAPE_QUAD);
      return;
    }

    case DrawKind.RECT: {
      // Filled and outline rects are both rasterised as a filled quad here: true outline
      // stroking would need a second geometry pass per rect, which is not worth it for a
      // shape primitive whose whole purpose is placeholder and debug art.
      const corners = quadCorners(
        command.x,
        command.y,
        command.width,
        command.height,
        command.rotation,
        command.anchorX,
        command.anchorY,
      );
      const color = colorToFloats(command.tint, command.alpha);
      pushQuad(out, corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft, FULL_UV, color, SHAPE_QUAD);
      return;
    }

    case DrawKind.CIRCLE: {
      const corners = quadCorners(command.x, command.y, command.radius * 2, command.radius * 2, 0, 0.5, 0.5);
      const color = colorToFloats(command.tint, command.alpha);
      pushQuad(out, corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft, FULL_UV, color, SHAPE_CIRCLE);
      return;
    }

    case DrawKind.LINE: {
      const dx = command.x2 - command.x;
      const dy = command.y2 - command.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) return; // a zero-length line has no orientation to rasterise
      const angle = Math.atan2(dy, dx);
      const midX = (command.x + command.x2) / 2;
      const midY = (command.y + command.y2) / 2;

      const corners = quadCorners(midX, midY, length, Math.max(command.lineWidth, 1), angle, 0.5, 0.5);
      const color = colorToFloats(command.tint, command.alpha);
      pushQuad(out, corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft, FULL_UV, color, SHAPE_QUAD);
      return;
    }

    default:
      // TEXT, and anything added later that this batcher does not yet know how to rasterise.
      // Silently skipped rather than thrown: one unrecognised command must not blank the frame.
      return;
  }
}

/**
 * Build the full vertex buffer for a run of same-texture commands.
 * @param {any[]} commands
 * @param {{ width: number, height: number } | undefined} textureSize
 * @returns {Float32Array}
 */
export function buildBatchVertices(commands, textureSize) {
  /** @type {number[]} */
  const out = [];
  for (const command of commands) {
    appendCommandVertices(out, command, textureSize);
  }
  return new Float32Array(out);
}

/**
 * Split a sorted draw list into runs sharing one texture id, the unit of one draw call.
 *
 * The list is already sorted by `(layer, z, textureId)` (SPEC §8), so consecutive same-texture
 * commands are already adjacent — this is a linear scan, not a sort.
 *
 * @param {Iterable<any>} commands
 * @returns {Array<{ textureId: number, texture: string, commands: any[] }>}
 */
export function groupByTexture(commands) {
  /** @type {Array<{ textureId: number, texture: string, commands: any[] }>} */
  const runs = [];
  /** @type {{ textureId: number, texture: string, commands: any[] } | null} */
  let current = null;

  for (const command of commands) {
    if (command.kind === DrawKind.TEXT) continue; // rasterised by the overlay, not batched here

    if (current === null || current.textureId !== command.textureId) {
      current = { textureId: command.textureId, texture: command.texture, commands: [] };
      runs.push(current);
    }
    current.commands.push(command);
  }

  return runs;
}
