import { Transform } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { setFieldCommand } from './commands.js';
import { pickEntity } from './viewport-picking.js';
import {
  rotateHandlePosition,
  scaleHandlePosition,
  angleFromCenter,
  scaleFromDrag,
  snapPoint,
  snapAngle,
} from './gizmo-math.js';

/**
 * The selection marker and transform gizmos, drawn and interacted with on a canvas CSS-stacked
 * over the game's own canvas.
 *
 * A **separate** canvas rather than drawing into the game's — see `WebGL2Renderer`'s
 * `textOverlay` doc for why this is the standard technique for editor-only UI layered over a
 * game surface regardless of rendering backend.
 *
 * **Gizmo modes.** `gizmoMode` selects which handle a drag manipulates: `'translate'` (the
 * default — drag the entity itself), `'rotate'` (drag a handle orbiting the entity), or
 * `'scale'` (drag a handle that grows or shrinks the entity uniformly — see `gizmo-math.js` for
 * why uniform, not per-axis).
 *
 * **Drag semantics**, for every mode: the field is mutated live on every pointer move, so the
 * change reads as continuous, but exactly **one** command is committed on release, capturing the
 * value from before the drag started. See `commands.js`'s `setFieldCommand` doc for why a
 * command per pointermove would be wrong.
 *
 * **Snapping.** `snapGridSize` (world units, position) and `snapAngleDegrees` (rotation) are
 * public properties a host page's toolbar can set directly; `0` or less disables snapping for
 * that field, which is `gizmo-math.js`'s own convention, not a special case added here.
 */
export class ViewportOverlay {
  /**
   * @param {HTMLCanvasElement} canvas a transparent canvas stacked over the game's, same size
   * @param {import('@novaforge/core').World} world
   * @param {import('@novaforge/renderer').Camera2D} camera
   * @param {import('./selection.js').Selection} selection
   * @param {import('./command-stack.js').CommandStack} commandStack
   */
  constructor(canvas, world, camera, selection, commandStack) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;
    /** @type {import('@novaforge/core').World} */
    this.world = world;
    /** @type {import('@novaforge/renderer').Camera2D} */
    this.camera = camera;
    /** @type {import('./selection.js').Selection} */
    this.selection = selection;
    /** @type {import('./command-stack.js').CommandStack} */
    this.commandStack = commandStack;

    /** @type {'translate' | 'rotate' | 'scale'} */
    this.gizmoMode = 'translate';

    /** @type {number} world units; 0 or less disables position snapping. */
    this.snapGridSize = 0;

    /** @type {number} degrees; 0 or less disables rotation snapping. */
    this.snapAngleDegrees = 0;

    /**
     * `null` in an environment with no real 2D canvas (this package's own jsdom tests). Picking
     * and dragging still work with no context — they never touch it — only drawing degrades,
     * silently, which is the right failure mode for editor chrome that is not load-bearing for
     * correctness.
     * @type {CanvasRenderingContext2D | null}
     * @private
     */
    this._ctx = canvas.getContext('2d');

    /**
     * @type {{
     *   kind: 'translate' | 'rotate' | 'scale',
     *   entity: number,
     *   startPosition: Vec2,
     *   startRotation: number,
     *   startScale: Vec2,
     *   startHandleDistance: number,
     * } | null}
     * @private
     */
    this._drag = null;

    /** @private */
    this._onPointerDown = (/** @type {PointerEvent} */ event) => this._handlePointerDown(event);
    /** @private */
    this._onPointerMove = (/** @type {PointerEvent} */ event) => this._handlePointerMove(event);
    /** @private */
    this._onPointerUp = (/** @type {PointerEvent} */ event) => this._handlePointerUp(event);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
  }

  /**
   * @param {PointerEvent} event
   * @returns {{ x: number, y: number }} pointer position relative to the canvas, in CSS pixels.
   * @private
   */
  _canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  _handlePointerDown(event) {
    const point = this._canvasPoint(event);
    const selected = this.selection.entity;

    if (selected !== null && this.world.isAlive(selected)) {
      const transform = this.world.get(selected, Transform);
      if (transform !== undefined && this._tryStartDrag(selected, transform, point)) {
        this.canvas.setPointerCapture?.(event.pointerId);
        return;
      }
    }

    const picked = pickEntity(this.world, this.camera, this.world.entities(), point);
    this.selection.select(picked);
  }

  /**
   * @param {number} entity
   * @param {any} transform
   * @param {{ x: number, y: number }} screenPoint
   * @returns {boolean} true if a drag was started.
   * @private
   */
  _tryStartDrag(entity, transform, screenPoint) {
    const handleScreen = this._handleScreenPosition(transform);
    const dx = handleScreen.x - screenPoint.x;
    const dy = handleScreen.y - screenPoint.y;
    if (dx * dx + dy * dy > HANDLE_RADIUS * HANDLE_RADIUS) return false;

    const worldHandle =
      this.gizmoMode === 'rotate'
        ? rotateHandlePosition(transform.position, transform.rotation)
        : this.gizmoMode === 'scale'
          ? scaleHandlePosition(transform.position, transform.rotation, transform.scale)
          : transform.position;

    this._drag = {
      kind: this.gizmoMode,
      entity,
      startPosition: new Vec2(transform.position.x, transform.position.y),
      startRotation: transform.rotation,
      startScale: new Vec2(transform.scale.x, transform.scale.y),
      startHandleDistance: Math.hypot(
        worldHandle.x - transform.position.x,
        worldHandle.y - transform.position.y,
      ),
    };
    return true;
  }

  /**
   * @param {any} transform
   * @returns {Vec2} the current gizmo handle's position, in screen space.
   * @private
   */
  _handleScreenPosition(transform) {
    if (this.gizmoMode === 'rotate') {
      return this.camera.worldToScreen(rotateHandlePosition(transform.position, transform.rotation));
    }
    if (this.gizmoMode === 'scale') {
      return this.camera.worldToScreen(
        scaleHandlePosition(transform.position, transform.rotation, transform.scale),
      );
    }
    return this.camera.worldToScreen(transform.position);
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  _handlePointerMove(event) {
    if (this._drag === null) return;
    const transform = this.world.get(this._drag.entity, Transform);
    if (transform === undefined) {
      this._drag = null;
      return;
    }

    const point = this._canvasPoint(event);
    const world = this.camera.screenToWorld(point);

    if (this._drag.kind === 'translate') {
      const snapped = snapPoint(world, this.snapGridSize);
      transform.position.x = snapped.x;
      transform.position.y = snapped.y;
      return;
    }

    if (this._drag.kind === 'rotate') {
      const angleStepRadians = this.snapAngleDegrees > 0 ? (this.snapAngleDegrees * Math.PI) / 180 : 0;
      const raw = angleFromCenter(this._drag.startPosition, world);
      transform.rotation = snapAngle(raw, angleStepRadians);
      return;
    }

    // 'scale'
    const newScale = scaleFromDrag(
      this._drag.startPosition,
      world,
      this._drag.startHandleDistance,
      this._drag.startScale,
    );
    transform.scale.x = newScale.x;
    transform.scale.y = newScale.y;
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  _handlePointerUp(event) {
    if (this._drag === null) return;
    const { kind, entity, startPosition, startRotation, startScale } = this._drag;
    this._drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);

    const transform = this.world.get(entity, Transform);
    if (transform === undefined) return;

    // `setFieldCommand` assigns `newValue` straight onto the field, and vec2 fields must always
    // hold a real `Vec2` — other systems call `.set()`/`.clone()` on `Transform.position` and
    // `Transform.scale`. See the equivalent note in the translate case below; it applies to
    // every branch here for the same reason.
    if (kind === 'translate') {
      const end = new Vec2(transform.position.x, transform.position.y);
      if (end.x === startPosition.x && end.y === startPosition.y) return; // no-op drag
      this.commandStack.execute(
        setFieldCommand(this.world, entity, Transform, 'position', startPosition, end),
      );
      return;
    }

    if (kind === 'rotate') {
      if (transform.rotation === startRotation) return;
      this.commandStack.execute(
        setFieldCommand(this.world, entity, Transform, 'rotation', startRotation, transform.rotation),
      );
      return;
    }

    // 'scale'
    const endScale = new Vec2(transform.scale.x, transform.scale.y);
    if (endScale.x === startScale.x && endScale.y === startScale.y) return;
    this.commandStack.execute(
      setFieldCommand(this.world, entity, Transform, 'scale', startScale, endScale),
    );
  }

  /**
   * Draw the selection marker and the active gizmo's handle for the current frame. Call once
   * per render, after the game itself has drawn — this canvas sits above it.
   * @returns {void}
   */
  render() {
    const ctx = this._ctx;
    if (ctx === null) return;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const selected = this.selection.entity;
    if (selected === null || !this.world.isAlive(selected)) return;

    const transform = this.world.get(selected, Transform);
    if (transform === undefined) return;

    const center = this.camera.worldToScreen(transform.position);

    ctx.save();
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 2;

    // The selection marker: always drawn, in every mode, so it is never ambiguous which entity
    // is selected even while manipulating a handle that is drawn some distance away from it.
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.stroke();

    if (this.gizmoMode === 'translate') {
      ctx.beginPath();
      ctx.arc(center.x, center.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.gizmoMode === 'rotate') {
      const handle = this.camera.worldToScreen(rotateHandlePosition(transform.position, transform.rotation));
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(handle.x, handle.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, HANDLE_RADIUS * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const handle = this.camera.worldToScreen(
        scaleHandlePosition(transform.position, transform.rotation, transform.scale),
      );
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(handle.x, handle.y);
      ctx.stroke();
      ctx.strokeRect(handle.x - HANDLE_RADIUS * 0.5, handle.y - HANDLE_RADIUS * 0.5, HANDLE_RADIUS, HANDLE_RADIUS);
    }

    ctx.restore();
  }

  /** Remove every pointer listener. @returns {void} */
  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
  }
}

/** Screen-space radius, in pixels, of every gizmo handle's hit-test and drawn size. */
const HANDLE_RADIUS = 10;
