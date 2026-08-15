import { Vec2, Rect } from '@novaforge/math';
import { Transform } from '@novaforge/core';
import { Quadtree } from './quadtree.js';
import { collide } from './sat.js';
import { canCollide } from './layers.js';
import {
  prepareContact,
  warmStartContact,
  solveContact,
  captureImpulses,
  applyPositionalCorrection,
} from './resolver.js';
import { RigidBody, Collider, BodyType } from './components.js';
import { shapeBounds } from './shapes.js';

/** Emitted the first frame two colliders touch. Payload: `{ a, b, normal, penetration }`. */
export const CONTACT_BEGIN = 'physics:contactBegin';

/** Emitted the first frame two colliders stop touching. Payload: `{ a, b }`. */
export const CONTACT_END = 'physics:contactEnd';

/**
 * Emitted the first frame a trigger begins overlapping another collider.
 * Payload: `{ trigger, other }`.
 *
 * Once per overlap, not once per frame. Firing every frame would make "the player entered the
 * checkpoint" indistinguishable from "the player is standing in the checkpoint", and every
 * consumer would have to de-duplicate it themselves — as the breakout example discovered by
 * losing two lives for one ball.
 */
export const TRIGGER_ENTER = 'physics:triggerEnter';

/** Emitted the first frame a trigger stops overlapping. Payload: `{ trigger, other }`. */
export const TRIGGER_EXIT = 'physics:triggerExit';

/**
 * Owns the physics step: integrate, broadphase, narrowphase, resolve.
 *
 * One `PhysicsWorld` per game world. It holds the quadtree and the contact bookkeeping across
 * steps, which is what allows begin/end contact events rather than a raw "currently touching"
 * list that every gameplay system would have to diff for itself.
 */
export class PhysicsWorld {
  /**
   * @param {object} [options]
   * @param {{ x: number, y: number }} [options.gravity] world units per second squared
   * @param {Rect} [options.bounds] region the broadphase covers
   * @param {number} [options.iterations] solver passes per step
   */
  constructor(options = {}) {
    /** @type {Vec2} */
    this.gravity = new Vec2(options.gravity?.x ?? 0, options.gravity?.y ?? 980);

    /**
     * The broadphase region. Bodies outside it still simulate, they just all land in the root
     * node and lose the tree's benefit — degraded, not broken, which is the right failure mode
     * for a bound the game author has to guess at.
     * @type {Rect}
     */
    this.bounds = options.bounds ?? new Rect(-10000, -10000, 20000, 20000);

    /**
     * Solver passes per step. More passes make stacks converge further, at linear cost.
     *
     * Eight is the working default *because* the solver warm starts. Without warm starting the
     * same scene needed 32 passes to stop drifting; with it, eight is solid and sixteen is
     * indistinguishable.
     * @type {number}
     */
    this.iterations = options.iterations ?? 8;

    /** @type {Quadtree} @private */
    this._tree = new Quadtree(this.bounds);

    /**
     * Pair keys touching as of the previous step, so begin and end can be diffed.
     * @type {Set<string>}
     * @private
     */
    this._previousContacts = new Set();

    /** @type {Set<string>} @private */
    this._currentContacts = new Set();

    /**
     * Pairs that are trigger overlaps rather than solid contacts, so that an ending overlap is
     * reported on the right channel.
     * @type {Map<string, { trigger: number, other: number }>}
     * @private
     */
    this._triggerPairs = new Map();

    /**
     * Accumulated contact impulses from the previous step, keyed by pair, for warm starting.
     * Rebuilt each step so that pairs which stopped touching are evicted rather than seeding a
     * future collision with a stale impulse.
     * @type {Map<string, { normal: number[], tangent: number[] }>}
     * @private
     */
    this._impulseCache = new Map();

    /** Counters for the debug overlay. */
    this.stats = {
      bodies: 0,
      broadphasePairs: 0,
      contacts: 0,
      triggers: 0,
    };
  }

  /**
   * Advance the simulation by one fixed step.
   * @param {import('@novaforge/core').World} world
   * @param {number} dt seconds — always the clock's `fixedDelta`, never a real frame time
   * @returns {void}
   */
  step(world, dt) {
    this._integrate(world, dt);
    const items = this._rebuildTree(world);
    const pairs = this._broadphase();
    this._narrowphaseAndResolve(world, pairs);
    this._emitContactEnds(world);

    this.stats.bodies = items;
    this.stats.broadphasePairs = pairs.length;
  }

  /**
   * Semi-implicit Euler: velocity first, then position from the *new* velocity.
   *
   * Explicit Euler (position from the old velocity) is the same number of operations and is
   * unconditionally unstable for orbits and springs — it adds energy every step. Semi-implicit
   * is the correct default and the reason a bouncing ball settles instead of climbing.
   *
   * @param {import('@novaforge/core').World} world
   * @param {number} dt
   * @private
   */
  _integrate(world, dt) {
    world.query([Transform, RigidBody]).each((_entity, transform, body) => {
      if (body.type === BodyType.STATIC) {
        body.velocity.set(0, 0);
        body.angularVelocity = 0;
        return;
      }

      if (body.type === BodyType.DYNAMIC) {
        body.velocity.x += (this.gravity.x * body.gravityScale + body.force.x * body.inverseMass) * dt;
        body.velocity.y += (this.gravity.y * body.gravityScale + body.force.y * body.inverseMass) * dt;

        if (!body.fixedRotation) {
          body.angularVelocity += body.torque * body.inverseInertia * dt;
        }
      }

      if (body.linearDamping > 0) {
        const factor = Math.pow(1 - body.linearDamping, dt);
        body.velocity.scaleSelf(factor);
      }
      if (body.angularDamping > 0) {
        body.angularVelocity *= Math.pow(1 - body.angularDamping, dt);
      }

      transform.position.x += body.velocity.x * dt;
      transform.position.y += body.velocity.y * dt;

      if (!body.fixedRotation) {
        transform.rotation += body.angularVelocity * dt;
      }

      body.force.set(0, 0);
      body.torque = 0;
    });
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @returns {number} how many colliders were inserted.
   * @private
   */
  _rebuildTree(world) {
    this._tree.clear();
    let count = 0;

    world.query([Transform, Collider]).each((entity, transform, collider) => {
      const position = {
        x: transform.position.x + collider.offset.x,
        y: transform.position.y + collider.offset.y,
      };
      this._tree.insert({
        entity,
        bounds: shapeBounds(collider.shape, position, transform.rotation),
        layer: collider.layer,
        mask: collider.mask,
      });
      count += 1;
    });

    return count;
  }

  /**
   * @returns {Array<[import('./quadtree.js').QuadtreeItem, import('./quadtree.js').QuadtreeItem]>}
   * @private
   */
  _broadphase() {
    const candidates = this._tree.pairs();
    const filtered = [];

    for (const pair of candidates) {
      if (canCollide(pair[0], pair[1])) filtered.push(pair);
    }

    filtered.sort((left, right) => {
      const leftKey = Math.min(left[0].entity, left[1].entity);
      const rightKey = Math.min(right[0].entity, right[1].entity);
      if (leftKey !== rightKey) return leftKey - rightKey;
      return Math.max(left[0].entity, left[1].entity) - Math.max(right[0].entity, right[1].entity);
    });

    return filtered;
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @param {Array<[import('./quadtree.js').QuadtreeItem, import('./quadtree.js').QuadtreeItem]>} pairs
   * @private
   */
  _narrowphaseAndResolve(world, pairs) {
    this._currentContacts.clear();
    let contactCount = 0;
    let triggerCount = 0;

    /** @type {Array<{ manifold: any, constraint: any, key: string, a: number, b: number, bodyA: any, bodyB: any, posA: any, posB: any }>} */
    const contacts = [];

    for (const [itemA, itemB] of pairs) {
      const entityA = itemA.entity;
      const entityB = itemB.entity;

      const transformA = world.get(entityA, Transform);
      const transformB = world.get(entityB, Transform);
      const colliderA = world.get(entityA, Collider);
      const colliderB = world.get(entityB, Collider);
      if (!transformA || !transformB || !colliderA || !colliderB) continue;

      const positionA = {
        x: transformA.position.x + colliderA.offset.x,
        y: transformA.position.y + colliderA.offset.y,
      };
      const positionB = {
        x: transformB.position.x + colliderB.offset.x,
        y: transformB.position.y + colliderB.offset.y,
      };

      const manifold = collide(
        colliderA.shape,
        positionA,
        transformA.rotation,
        colliderB.shape,
        positionB,
        transformB.rotation,
      );
      if (manifold === null) continue;

      const key = pairKey(entityA, entityB);
      this._currentContacts.add(key);

      if (colliderA.isTrigger || colliderB.isTrigger) {
        triggerCount += 1;
        const payload = {
          trigger: colliderA.isTrigger ? entityA : entityB,
          other: colliderA.isTrigger ? entityB : entityA,
        };
        this._triggerPairs.set(key, payload);
        if (!this._previousContacts.has(key)) {
          world.events.emit(TRIGGER_ENTER, payload);
        }
        continue;
      }

      const bodyA = world.get(entityA, RigidBody);
      const bodyB = world.get(entityB, RigidBody);
      if (!bodyA || !bodyB) continue;

      contactCount += 1;

      if (!this._previousContacts.has(key)) {
        world.events.emit(CONTACT_BEGIN, {
          a: entityA,
          b: entityB,
          normal: manifold.normal.clone(),
          penetration: manifold.penetration,
        });
      }

      const constraint = prepareContact(
        manifold,
        bodyA,
        bodyB,
        transformA.position,
        transformB.position,
        this._impulseCache.get(key),
      );
      if (constraint === null) continue;

      contacts.push({
        manifold,
        constraint,
        key,
        a: entityA,
        b: entityB,
        bodyA,
        bodyB,
        posA: transformA.position,
        posB: transformB.position,
      });
    }

    for (const contact of contacts) {
      warmStartContact(contact.constraint, contact.bodyA, contact.bodyB);
    }

    for (let iteration = 0; iteration < this.iterations; iteration += 1) {
      for (const contact of contacts) {
        solveContact(contact.constraint, contact.bodyA, contact.bodyB);
      }
    }

    for (const contact of contacts) {
      applyPositionalCorrection(
        contact.manifold,
        contact.bodyA,
        contact.bodyB,
        contact.posA,
        contact.posB,
      );
    }

    this._impulseCache.clear();
    for (const contact of contacts) {
      this._impulseCache.set(contact.key, captureImpulses(contact.constraint));
    }

    this.stats.contacts = contactCount;
    this.stats.triggers = triggerCount;
  }

  /**
   * @param {import('@novaforge/core').World} world
   * @private
   */
  _emitContactEnds(world) {
    for (const key of this._previousContacts) {
      if (this._currentContacts.has(key)) continue;

      const trigger = this._triggerPairs.get(key);
      if (trigger !== undefined) {
        world.events.emit(TRIGGER_EXIT, trigger);
        this._triggerPairs.delete(key);
      } else {
        world.events.emit(CONTACT_END, unpackKey(key));
      }
    }

    const previous = this._previousContacts;
    this._previousContacts = this._currentContacts;
    this._currentContacts = previous;
  }

  /**
   * Every collider overlapping a world-space region. The gameplay-facing spatial query — used
   * for explosion radii, aggro ranges, and editor rubber-band selection.
   * @param {import('@novaforge/math').AABB} region
   * @returns {number[]} entity handles
   */
  queryRegion(region) {
    return this._tree.query(region).map((item) => item.entity);
  }

  /** @returns {ReturnType<Quadtree['stats']>} broadphase tree shape, for the debug overlay. */
  treeStats() {
    return this._tree.stats();
  }

  /** Forget every recorded contact, so the next step reports fresh begins. */
  reset() {
    this._tree.clear();
    this._previousContacts.clear();
    this._currentContacts.clear();
    this._triggerPairs.clear();
    this._impulseCache.clear();
  }
}

/**
 * A symmetric, order-independent key for an entity pair.
 *
 * A string, not a packed integer. Entity handles occupy 31 bits, so packing two of them would
 * need 62 — beyond the 53 bits a JavaScript number represents exactly, and the collisions would
 * only appear once a session had churned through enough entities to push the generation counter
 * up. Sorting the two handles first is what makes `(a, b)` and `(b, a)` the same contact.
 *
 * @param {number} a
 * @param {number} b
 * @returns {string}
 */
function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * @param {string} key
 * @returns {{ a: number, b: number }}
 */
function unpackKey(key) {
  const separator = key.indexOf(':');
  return {
    a: Number(key.slice(0, separator)),
    b: Number(key.slice(separator + 1)),
  };
}
