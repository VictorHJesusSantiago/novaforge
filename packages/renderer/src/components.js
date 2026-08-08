import { defineComponent } from '@novaforge/core';
import { WHITE } from './color.js';

/**
 * `Transform` is defined in `@novaforge/core`, not here.
 *
 * Physics needs it too, and physics and renderer are siblings that may not import each other
 * (SPEC §2), so it belongs to their common ancestor. It is re-exported for convenience so that
 * a game importing from `@novaforge/renderer` gets the whole rendering vocabulary in one place.
 */
export { Transform } from '@novaforge/core';

/**
 * A textured quad.
 *
 * `source` is `null` for a whole-texture draw and a sub-rectangle for an atlas or sprite sheet
 * frame; the animation system in Milestone 7 writes to it every frame.
 */
export const Sprite = defineComponent(
  'Sprite',
  () => ({
    texture: '',
    width: 32,
    height: 32,
    anchorX: 0.5,
    anchorY: 0.5,
    tint: WHITE,
    alpha: 1,
    layer: 0,
    z: 0,
    visible: true,
    /** @type {{ x: number, y: number, width: number, height: number } | null} */
    source: null,
  }),
  {
    texture: { type: 'asset' },
    width: { type: 'number', min: 0 },
    height: { type: 'number', min: 0 },
    anchorX: { type: 'number', min: 0, max: 1, step: 0.01 },
    anchorY: { type: 'number', min: 0, max: 1, step: 0.01 },
    tint: { type: 'color' },
    alpha: { type: 'number', min: 0, max: 1, step: 0.01 },
    layer: { type: 'number', step: 1 },
    z: { type: 'number', step: 1 },
    visible: { type: 'boolean' },
  },
);

/** An untextured rectangle. Enough to build a whole game before any art exists. */
export const ShapeRect = defineComponent(
  'ShapeRect',
  () => ({
    width: 32,
    height: 32,
    anchorX: 0.5,
    anchorY: 0.5,
    color: WHITE,
    alpha: 1,
    filled: true,
    lineWidth: 1,
    layer: 0,
    z: 0,
    visible: true,
  }),
  {
    width: { type: 'number', min: 0 },
    height: { type: 'number', min: 0 },
    color: { type: 'color' },
    alpha: { type: 'number', min: 0, max: 1, step: 0.01 },
    filled: { type: 'boolean' },
    lineWidth: { type: 'number', min: 0 },
    layer: { type: 'number', step: 1 },
    z: { type: 'number', step: 1 },
    visible: { type: 'boolean' },
  },
);

/** An untextured circle. */
export const ShapeCircle = defineComponent(
  'ShapeCircle',
  () => ({
    radius: 16,
    color: WHITE,
    alpha: 1,
    filled: true,
    lineWidth: 1,
    layer: 0,
    z: 0,
    visible: true,
  }),
  {
    radius: { type: 'number', min: 0 },
    color: { type: 'color' },
    alpha: { type: 'number', min: 0, max: 1, step: 0.01 },
    filled: { type: 'boolean' },
    layer: { type: 'number', step: 1 },
    z: { type: 'number', step: 1 },
    visible: { type: 'boolean' },
  },
);

/**
 * A text label drawn in world space.
 *
 * Deliberately minimal — no wrapping, no rich text. Anything more belongs in a UI layer, and
 * building that before Milestone 8 would be scope creep.
 */
export const TextLabel = defineComponent(
  'TextLabel',
  () => ({
    text: '',
    font: '16px sans-serif',
    /** @type {'left'|'center'|'right'} */
    align: 'center',
    color: WHITE,
    alpha: 1,
    layer: 10,
    z: 0,
    visible: true,
  }),
  {
    text: { type: 'string' },
    font: { type: 'string' },
    align: { type: 'enum', options: ['left', 'center', 'right'] },
    color: { type: 'color' },
    alpha: { type: 'number', min: 0, max: 1, step: 0.01 },
    layer: { type: 'number', step: 1 },
    visible: { type: 'boolean' },
  },
);
