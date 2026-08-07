/**
 * Undoable edits to a `KeyframeTrack`'s keyframe list.
 *
 * Separate from `commands.js`, which edits **entities** (fields, components, the hierarchy) —
 * these edit a `Timeline`'s own plain-data structure directly, since a `Timeline` is authored
 * data shared by every `TimelinePlayer` referencing it, not a component living in the ECS.
 */

/**
 * Tolerance for treating two keyframe times as "the same instant" — matters because the
 * timeline panel's scrubber deals in floating-point seconds, and asking a user to land on
 * `2.0000000001` exactly to edit a keyframe at `2` would be unusable.
 */
const TIME_EPSILON = 1e-6;

/**
 * @param {import('@novaforge/animation').KeyframeTrack} track
 * @param {number} time
 * @returns {number} index of the keyframe at `time`, or -1
 */
function indexAt(track, time) {
  return track.keyframes.findIndex((keyframe) => Math.abs(keyframe.time - time) < TIME_EPSILON);
}

/**
 * Add a keyframe at `time`, or overwrite the value of one already there — what the timeline
 * panel's "capture current value" button does.
 *
 * @param {import('@novaforge/animation').KeyframeTrack} track
 * @param {number} time
 * @param {any} value
 * @returns {import('./command-stack.js').Command}
 */
export function setKeyframeCommand(track, time, value) {
  const existingIndex = indexAt(track, time);
  const previous = existingIndex === -1 ? null : track.keyframes[existingIndex];

  return {
    label: previous === null ? 'Add keyframe' : 'Edit keyframe',
    do() {
      const index = indexAt(track, time);
      if (index === -1) {
        track.keyframes.push({ time, value });
        track.keyframes.sort((a, b) => a.time - b.time);
      } else {
        track.keyframes[index] = { ...track.keyframes[index], value };
      }
    },
    undo() {
      const index = indexAt(track, time);
      if (index === -1) return;
      if (previous === null) {
        track.keyframes.splice(index, 1);
      } else {
        track.keyframes[index] = previous;
      }
    },
  };
}

/**
 * Remove the keyframe at `time`, if one exists there.
 * @param {import('@novaforge/animation').KeyframeTrack} track
 * @param {number} time
 * @returns {import('./command-stack.js').Command}
 */
export function removeKeyframeCommand(track, time) {
  const index = indexAt(track, time);
  const removed = index === -1 ? null : track.keyframes[index];

  return {
    label: 'Remove keyframe',
    do() {
      if (removed === null) return;
      const i = indexAt(track, time);
      if (i !== -1) track.keyframes.splice(i, 1);
    },
    undo() {
      if (removed === null) return;
      track.keyframes.push(removed);
      track.keyframes.sort((a, b) => a.time - b.time);
    },
  };
}
