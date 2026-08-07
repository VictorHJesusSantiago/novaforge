/**
 * Keyframe tracks over arbitrary component fields (Milestone 7).
 *
 * This is a different, larger thing than `@novaforge/renderer`'s `Animator`/`animationSystem`,
 * which plays back a fixed sequence of atlas frames — sprite-sheet animation, not tweening. A
 * `Timeline` instead moves *any* schema-declared field of *any* component smoothly between
 * authored values over time: a door's `Transform.rotation` swinging open, a light's
 * `ShapeCircle.color` pulsing, a UI element's `TextLabel.alpha` fading in. One mechanism, driven
 * entirely by the same component schemas the editor's inspector already reads — a new component
 * gains keyframe support the moment it declares a schema, with no animation-specific code.
 *
 * @typedef {object} Keyframe
 * @property {number} time seconds from the track's start
 * @property {any} value the field's value at this instant — same shape the field's schema type
 *   expects (a `Vec2` for `'vec2'`, a packed int for `'color'`, and so on)
 * @property {(t: number) => number} [ease] applied to the *outgoing* segment — the interpolation
 *   between this keyframe and the next. The default is linear.
 *
 * @typedef {object} KeyframeTrack
 * @property {import('@novaforge/core').ComponentType} component
 * @property {string} field must name one of `component`'s schema fields
 * @property {Keyframe[]} keyframes sorted ascending by `time`
 *
 * @typedef {object} Timeline
 * @property {string} name
 * @property {number} duration seconds
 * @property {boolean} loop
 * @property {KeyframeTrack[]} tracks
 */

/**
 * Build one track.
 *
 * @param {import('@novaforge/core').ComponentType} component
 * @param {string} field
 * @param {Array<{ time: number, value: any, ease?: (t: number) => number }>} keyframes
 * @returns {KeyframeTrack}
 * @throws {RangeError} for fewer than one keyframe, or if `field` is not in the component's
 *   schema — a track over a field the inspector cannot even show is a mistake best caught at
 *   authoring time, not silently doing nothing at playback time.
 */
export function defineTrack(component, field, keyframes) {
  if (keyframes.length === 0) {
    throw new RangeError(`defineTrack: "${component.name}.${field}" has no keyframes`);
  }
  if (component.schema === null || component.schema[field] === undefined) {
    throw new RangeError(
      `defineTrack: "${component.name}" has no schema field "${field}" for a track to animate`,
    );
  }

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  return { component, field, keyframes: sorted };
}

/**
 * Build a timeline from one or more tracks.
 *
 * @param {string} name
 * @param {KeyframeTrack[]} tracks
 * @param {object} [options]
 * @param {number} [options.duration] defaults to the latest keyframe time across every track
 * @param {boolean} [options.loop]
 * @returns {Timeline}
 * @throws {RangeError} for zero tracks — an empty timeline animates nothing, which is always a
 *   mistake to catch at definition time rather than a silently-idle player at runtime.
 */
export function defineTimeline(name, tracks, options = {}) {
  if (tracks.length === 0) {
    throw new RangeError(`defineTimeline: "${name}" has no tracks`);
  }

  const latestKeyframe = Math.max(
    ...tracks.map((track) => track.keyframes[track.keyframes.length - 1].time),
  );

  return {
    name,
    duration: options.duration ?? latestKeyframe,
    loop: options.loop ?? true,
    tracks,
  };
}
