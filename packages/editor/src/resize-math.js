/**
 * The pure arithmetic behind a resizable panel splitter: turning a pointer delta into a new
 * panel size. Split out for the same reason `gizmo-math.js` and `viewport-picking.js` are — it
 * is worth testing directly, and the DOM/pointer-event glue around it (`Splitter`) is not.
 */

/**
 * @param {number} startSize the panel's size when the drag began, in pixels
 * @param {number} deltaPx pointer movement since the drag began; sign convention is the caller's
 *   (see `invert`)
 * @param {number} min
 * @param {number} max
 * @param {boolean} [invert] true when dragging in the positive pointer direction should
 *   *shrink* the panel — the case for a panel anchored to the trailing edge (dragging a
 *   right-hand splitter leftward grows a right-side panel, so the raw pointer delta's sign is
 *   backwards from what the panel's own size wants)
 * @returns {number} the new size, clamped to `[min, max]`
 */
export function resizedSize(startSize, deltaPx, min, max, invert = false) {
  const signedDelta = invert ? -deltaPx : deltaPx;
  const raw = startSize + signedDelta;
  return Math.min(max, Math.max(min, raw));
}
