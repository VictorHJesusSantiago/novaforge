import { describe, it, expect } from 'vitest';
import { Camera2D } from '../camera.js';
import { DrawList, DrawKind } from '../draw-list.js';
import {
  ATTRIBUTE_STRIDE,
  VERTICES_PER_QUAD,
  worldToClipMatrix,
  appendCommandVertices,
  buildBatchVertices,
  groupByTexture,
} from '../webgl2-batch.js';

/**
 * The pure half of the WebGL2 backend — no canvas, no GL context, exactly like the rest of the
 * renderer package's tests. This is what makes the batching logic verifiable in Node at all.
 */

describe('worldToClipMatrix', () => {
  it('maps the viewport centre to clip-space origin', () => {
    const camera = new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
    const matrix = worldToClipMatrix(camera, 800, 600);
    const clip = matrix.transformPoint(camera.position);
    expect(clip.x).toBeCloseTo(0, 5);
    expect(clip.y).toBeCloseTo(0, 5);
  });

  it('maps the top-left of the view to clip-space (-1, 1)', () => {
    const camera = new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
    const worldTopLeft = camera.screenToWorld({ x: 0, y: 0 });
    const clip = worldToClipMatrix(camera, 800, 600).transformPoint(worldTopLeft);
    expect(clip.x).toBeCloseTo(-1, 5);
    expect(clip.y).toBeCloseTo(1, 5);
  });

  it('maps the bottom-right of the view to clip-space (1, -1)', () => {
    const camera = new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
    const worldBottomRight = camera.screenToWorld({ x: 800, y: 600 });
    const clip = worldToClipMatrix(camera, 800, 600).transformPoint(worldBottomRight);
    expect(clip.x).toBeCloseTo(1, 5);
    expect(clip.y).toBeCloseTo(-1, 5);
  });

  it('tracks camera zoom', () => {
    const camera = new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
    camera.zoom = 2;
    // At 2x zoom, a point half a screen-width away lands at the clip-space edge.
    const clip = worldToClipMatrix(camera, 800, 600).transformPoint({ x: 200, y: 0 });
    expect(clip.x).toBeCloseTo(1, 5);
  });
});

describe('appendCommandVertices', () => {
  it('appends exactly one quad (6 vertices) per sprite command', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.SPRITE, x: 0, y: 0, width: 10, height: 10, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1, sourceX: 0, sourceY: 0, sourceWidth: 0, sourceHeight: 0 }, { width: 10, height: 10 });
    expect(out).toHaveLength(VERTICES_PER_QUAD * ATTRIBUTE_STRIDE);
  });

  it('centres a quad on its anchor', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.RECT, x: 100, y: 100, width: 20, height: 20, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1 }, undefined);
    // First vertex is the top-left corner: centred means it is offset by -half extents.
    expect(out[0]).toBeCloseTo(90);
    expect(out[1]).toBeCloseTo(90);
  });

  it('respects a non-centred anchor', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.RECT, x: 100, y: 100, width: 20, height: 20, rotation: 0, anchorX: 0, anchorY: 0, tint: 0xffffff, alpha: 1 }, undefined);
    expect(out[0]).toBeCloseTo(100);
    expect(out[1]).toBeCloseTo(100);
  });

  it('converts the packed tint into normalised float channels', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.RECT, x: 0, y: 0, width: 1, height: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xff8000, alpha: 0.5 }, undefined);
    // Vertex layout: x,y,u,v,r,g,b,a,shapeMode — color starts at index 4.
    expect(out[4]).toBeCloseTo(1, 5);
    expect(out[5]).toBeCloseTo(0x80 / 255, 3);
    expect(out[6]).toBeCloseTo(0, 5);
    expect(out[7]).toBeCloseTo(0.5, 5);
  });

  it('marks a circle command with shapeMode 1', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.CIRCLE, x: 0, y: 0, radius: 5, tint: 0xffffff, alpha: 1 }, undefined);
    // shapeMode is the last of the 9 floats per vertex.
    for (let v = 0; v < VERTICES_PER_QUAD; v += 1) {
      expect(out[v * ATTRIBUTE_STRIDE + 8]).toBe(1);
    }
  });

  it('marks a sprite command with shapeMode 0', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.SPRITE, x: 0, y: 0, width: 1, height: 1, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1, sourceX: 0, sourceY: 0, sourceWidth: 0, sourceHeight: 0 }, undefined);
    expect(out[8]).toBe(0);
  });

  it('maps a sprite source rect into normalised UVs', () => {
    const out = [];
    appendCommandVertices(
      out,
      { kind: DrawKind.SPRITE, x: 0, y: 0, width: 16, height: 16, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0, tint: 0xffffff, alpha: 1, sourceX: 32, sourceY: 0, sourceWidth: 16, sourceHeight: 16 },
      { width: 64, height: 64 },
    );
    // Vertex 0 = top-left = (u0, v0).
    expect(out[2]).toBeCloseTo(32 / 64);
    expect(out[3]).toBeCloseTo(0 / 64);
    // Vertex 1 = top-right = (u1, v0).
    expect(out[ATTRIBUTE_STRIDE + 2]).toBeCloseTo(48 / 64);
  });

  it('spans the full [0,1] UV range for a sprite with no source rect', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.SPRITE, x: 0, y: 0, width: 1, height: 1, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1, sourceX: 0, sourceY: 0, sourceWidth: 0, sourceHeight: 0 }, { width: 10, height: 10 });
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('orients a line quad along its segment', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.LINE, x: 0, y: 0, x2: 10, y2: 0, lineWidth: 2, tint: 0xffffff, alpha: 1 }, undefined);
    expect(out).toHaveLength(VERTICES_PER_QUAD * ATTRIBUTE_STRIDE);
    // A horizontal line's quad corners should span roughly [0,10] in x and be thin in y.
    const xs = [];
    const ys = [];
    for (let v = 0; v < VERTICES_PER_QUAD; v += 1) {
      xs.push(out[v * ATTRIBUTE_STRIDE]);
      ys.push(out[v * ATTRIBUTE_STRIDE + 1]);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 3);
  });

  // A zero-length line has no orientation to rasterise; it must not corrupt the buffer with
  // NaN from a divide-by-zero direction.
  it('skips a zero-length line rather than producing NaN geometry', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.LINE, x: 5, y: 5, x2: 5, y2: 5, lineWidth: 2, tint: 0xffffff, alpha: 1 }, undefined);
    expect(out).toHaveLength(0);
  });

  it('emits nothing for a TEXT command', () => {
    const out = [];
    appendCommandVertices(out, { kind: DrawKind.TEXT, text: 'hi', x: 0, y: 0 }, undefined);
    expect(out).toHaveLength(0);
  });
});

describe('buildBatchVertices', () => {
  it('concatenates several commands into one buffer', () => {
    const commands = [
      { kind: DrawKind.RECT, x: 0, y: 0, width: 1, height: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1 },
      { kind: DrawKind.RECT, x: 5, y: 5, width: 1, height: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1 },
    ];
    const buffer = buildBatchVertices(commands, undefined);
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(2 * VERTICES_PER_QUAD * ATTRIBUTE_STRIDE);
  });

  it('produces an empty buffer for an empty command list', () => {
    expect(buildBatchVertices([], undefined)).toHaveLength(0);
  });
});

describe('groupByTexture', () => {
  it('splits a sorted list into per-texture runs', () => {
    const list = new DrawList();
    list.sprite({ texture: 'a', x: 0, y: 0, width: 1, height: 1 });
    list.sprite({ texture: 'a', x: 1, y: 0, width: 1, height: 1 });
    list.sprite({ texture: 'b', x: 2, y: 0, width: 1, height: 1 });
    list.sort();

    const runs = groupByTexture(list);
    expect(runs).toHaveLength(2);
    expect(runs[0].commands).toHaveLength(2);
    expect(runs[1].commands).toHaveLength(1);
  });

  it('gives untextured commands their own run under textureId 0', () => {
    const list = new DrawList();
    list.rect({ x: 0, y: 0, width: 1, height: 1 });
    list.rect({ x: 1, y: 0, width: 1, height: 1 });
    list.sort();

    const runs = groupByTexture(list);
    expect(runs).toHaveLength(1);
    expect(runs[0].textureId).toBe(0);
  });

  it('excludes TEXT commands, which the overlay draws instead', () => {
    const list = new DrawList();
    list.sprite({ texture: 'a', x: 0, y: 0, width: 1, height: 1 });
    list.text({ text: 'hud', x: 0, y: 0 });
    list.sort();

    const runs = groupByTexture(list);
    const total = runs.reduce((sum, run) => sum + run.commands.length, 0);
    expect(total).toBe(1);
  });

  it('returns no runs for an empty draw list', () => {
    expect(groupByTexture(new DrawList())).toHaveLength(0);
  });

  // This is the property that makes one-draw-call-per-texture correct: interleaved textures
  // (which a stable sort by (layer, z, textureId) never produces) would otherwise silently
  // split into more runs than necessary. Asserting it here locks in the assumption.
  it('never re-groups an already-contiguous run, even across many textures', () => {
    const list = new DrawList();
    for (let i = 0; i < 5; i += 1) {
      list.sprite({ texture: `t${i}`, x: i, y: 0, width: 1, height: 1 });
      list.sprite({ texture: `t${i}`, x: i, y: 1, width: 1, height: 1 });
    }
    list.sort();

    const runs = groupByTexture(list);
    expect(runs).toHaveLength(5);
    for (const run of runs) expect(run.commands).toHaveLength(2);
  });
});
