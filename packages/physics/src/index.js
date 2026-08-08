/**
 * @novaforge/physics — 2D collision detection and response.
 *
 * The pipeline, in order (SPEC §9):
 *
 * ```
 *   integrate  →  broadphase (quadtree)  →  narrowphase (SAT)  →  resolve (impulses)
 * ```
 *
 * Two invariants shape the whole package. Collision filtering is **symmetric** (P1), so
 * "sometimes it passes through" cannot happen from a one-sided mask. And contact resolution is
 * **deterministic** (P2): pairs are sorted before solving, so the outcome never depends on the
 * order the quadtree happened to visit its children.
 */

export { ShapeType, circle, box, polygon, shapeBounds, shapeArea, momentOfInertia } from './shapes.js';
export { Layers, canCollide, layerFromNames, describeMask } from './layers.js';
export { Quadtree } from './quadtree.js';
export { collide, collideCircles, collidePolygons, collideCirclePolygon } from './sat.js';
export {
  prepareContact,
  warmStartContact,
  solveContact,
  captureImpulses,
  resolveContact,
  applyPositionalCorrection,
} from './resolver.js';
export { RigidBody, Collider, BodyType, setMass, makeStatic } from './components.js';
export {
  PhysicsWorld,
  CONTACT_BEGIN,
  CONTACT_END,
  TRIGGER_ENTER,
  TRIGGER_EXIT,
} from './physics-world.js';
export { installPhysicsSystems, PHYSICS_RESOURCE } from './systems.js';
