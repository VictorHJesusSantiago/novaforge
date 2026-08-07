import { Vec2, lerp } from '@novaforge/math';

/**
 * Sampling a track at a point in time, and interpolating a field's value between two keyframes.
 * Pure functions, no world, no component storage — the same split as every other geometry-heavy
 * corner of this engine (`webgl2-batch.js`, `gizmo-math.js`): the maths is worth testing
 * directly, and `player.js`'s job is only to plug the result into a live component.
 */

/**
 * Locate the two keyframes surrounding `time` and the eased local progress between them.
 *
 * @param {import('./timeline.js').KeyframeTrack} track
 * @param {number} time seconds, clamped internally to the track's own range
 * @returns {{ from: any, to: any, t: number }} `from`/`to` are keyframe **values**; `t` is
 *   already eased, so the caller only has to lerp (or step) between the two.
 */
export function sampleTrack(track, time) {
  const keyframes = track.keyframes;

  if (time <= keyframes[0].time) {
    return { from: keyframes[0].value, to: keyframes[0].value, t: 0 };
  }
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) {
    return { from: last.value, to: last.value, t: 0 };
  }

  // A linear scan is fine: real tracks have a handful to a few dozen keyframes, not thousands.
  let index = 0;
  while (index < keyframes.length - 1 && keyframes[index + 1].time <= time) {
    index += 1;
  }

  const from = keyframes[index];
  const to = keyframes[index + 1];
  const span = to.time - from.time;
  const rawT = span > 0 ? (time - from.time) / span : 1;
  const ease = from.ease ?? ((t) => t);

  return { from: from.value, to: to.value, t: ease(rawT) };
}

/**
 * Interpolate a field's value using the strategy implied by its component schema — the same
 * schema vocabulary the editor's inspector renders from, reused here so a field never needs to
 * declare *how* to animate separately from how to edit it.
 *
 * `'color'` gets its own channel-wise blend rather than the plain numeric lerp a packed
 * `0xRRGGBB` int would otherwise get — naive numeric interpolation between two packed colours
 * produces visual noise, not a colour fade. This does not import `@novaforge/renderer`'s own
 * `lerpColor` to get it: `animation` and `renderer` are sibling packages that may not depend on
 * each other (SPEC §2), so the few lines of channel maths are duplicated here rather than
 * reaching across the boundary.
 *
 * @param {import('@novaforge/core').ComponentType} component
 * @param {string} field
 * @param {any} from
 * @param {any} to
 * @param {number} t already-eased progress, from {@link sampleTrack}
 * @returns {any}
 */
export function interpolateValue(component, field, from, to, t) {
  const fieldType = component.schema?.[field]?.type;

  if (fieldType === 'vec2') {
    return new Vec2(lerp(from.x, to.x, t), lerp(from.y, to.y, t));
  }
  if (fieldType === 'number') {
    return lerp(from, to, t);
  }
  if (fieldType === 'color') {
    return lerpPackedColor(from, to, t);
  }
  // string, boolean, enum, asset, entity, opaque: nothing to blend between two arbitrary
  // values, so hold `from` until `to` takes over at the end of the segment.
  return t < 1 ? from : to;
}

/**
 * @param {number} from packed 0xRRGGBB
 * @param {number} to packed 0xRRGGBB
 * @param {number} t
 * @returns {number}
 */
function lerpPackedColor(from, to, t) {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;

  const r = Math.round(lerp(fr, tr, t));
  const g = Math.round(lerp(fg, tg, t));
  const b = Math.round(lerp(fb, tb, t));
  return (r << 16) | (g << 8) | b;
}
