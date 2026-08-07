/**
 * Component definitions.
 *
 * A component type is a small descriptor object, not a class. Instances are plain data
 * (SPEC Invariant C2) — no methods, no closures, no DOM handles — which is what makes the
 * editor's structured-clone snapshot for play mode possible, and what makes scene
 * serialisation a `JSON.stringify` rather than a framework.
 *
 * @typedef {object} ComponentSchemaField
 * @property {'number'|'string'|'boolean'|'vec2'|'color'|'entity'|'asset'|'enum'|'opaque'} type
 *   `'opaque'` is the escape hatch for a field the inspector cannot usefully edit (a physics
 *   shape's vertex list, for instance) — the editor renders it read-only and the serialiser
 *   still round-trips it, since every field value in this engine is JSON-safe by Invariant C2.
 * @property {number} [min] inspector slider bound
 * @property {number} [max] inspector slider bound
 * @property {number} [step]
 * @property {string[]} [options] for `enum`
 * @property {string} [label] overrides the field name in the inspector
 *
 * @typedef {object} ComponentType
 * @property {number} id dense integer id, used as the storage key
 * @property {string} name
 * @property {() => any} factory produces a fresh instance with default values
 * @property {Record<string, ComponentSchemaField> | null} schema drives the editor inspector
 * @property {boolean} isTag true when the component carries no data
 */

/**
 * Component ids are dense integers rather than strings so that a query's component set can be
 * turned into a cheap cache key and, later, a bitmask.
 * @type {number}
 */
let nextComponentId = 0;

/** @type {Map<string, ComponentType>} */
const registry = new Map();

/**
 * Define a component type.
 *
 * ```js
 * const Health = defineComponent('Health', () => ({ current: 100, max: 100 }), {
 *   current: { type: 'number', min: 0 },
 *   max: { type: 'number', min: 1 },
 * });
 * ```
 *
 * The factory must return a **fresh** object each call. Returning a shared literal would give
 * every entity the same instance, which is a bug that hides for a surprisingly long time.
 *
 * The schema is optional today and consumed by the editor inspector in Milestone 5. Declaring
 * it early costs one line and removes the need for per-component editor UI later.
 *
 * @template T
 * @param {string} name
 * @param {() => T} factory
 * @param {Record<string, ComponentSchemaField>} [schema]
 * @returns {ComponentType & { factory: () => T }}
 * @throws {Error} if `name` is already registered — duplicate names would make scene
 *   serialisation ambiguous, and the usual cause is a copy-pasted definition.
 */
export function defineComponent(name, factory, schema) {
  if (registry.has(name)) {
    throw new Error(`defineComponent: "${name}" is already defined`);
  }
  if (typeof factory !== 'function') {
    throw new TypeError(`defineComponent: "${name}" needs a factory function`);
  }

  const type = {
    id: nextComponentId,
    name,
    factory,
    schema: schema ?? null,
    isTag: false,
  };
  nextComponentId += 1;
  registry.set(name, type);
  return type;
}

/**
 * Define a data-free marker component — `Frozen`, `Selected`, `PlayerControlled`.
 *
 * Stored as `true` rather than `{}` so a tag costs one slot instead of an object allocation
 * per entity.
 *
 * @param {string} name
 * @returns {ComponentType}
 */
export function defineTag(name) {
  const type = defineComponent(name, () => /** @type {any} */ (true));
  type.isTag = true;
  return type;
}

/** @returns {number} how many component types have been defined. */
export function componentCount() {
  return nextComponentId;
}

/**
 * Re-insert an already-constructed `ComponentType` into the registry under its own name,
 * without minting a new id or touching `nextComponentId`.
 *
 * This exists for exactly one situation: a test file calls `resetComponentRegistry()` (to let
 * its own `beforeEach` redefine throwaway components like `Position` fresh before every test,
 * without an "already defined" error) but also uses one of `core`'s own singleton components —
 * `Transform`, `Name`, `Parent` — which were registered once, at module import time, long before
 * that reset. The reset clears the *whole* shared registry Map, including those unrelated
 * entries, so `getComponentType('Parent')` stops resolving even though the `Parent` object
 * itself is untouched and still perfectly usable. Re-registering it (not redefining it — a
 * second `defineComponent('Parent', ...)` would mint a *different* object than the one
 * `hierarchy.js`'s own functions already closed over) is what a test needs to call after a
 * reset to get `getComponentType`/`listComponentTypes` working for it again.
 *
 * @param {ComponentType} type
 * @returns {void}
 */
export function registerComponentType(type) {
  registry.set(type.name, type);
}

/**
 * Look up a previously defined component type by name.
 *
 * This is what lets the editor's scene serialiser turn a saved component name like `"Sprite"`
 * back into the real `ComponentType` — and therefore its factory and schema — with no separate
 * registry of its own. Every `defineComponent` call already populates this one.
 *
 * @param {string} name
 * @returns {ComponentType | undefined}
 */
export function getComponentType(name) {
  return registry.get(name);
}

/**
 * Every component type defined so far, in definition order.
 *
 * Drives the editor's "add component" picker. Definition order rather than alphabetical: it
 * roughly follows import order, which tends to put the most commonly used components (defined
 * by the engine packages, imported first) near the top.
 *
 * @returns {ComponentType[]}
 */
export function listComponentTypes() {
  return Array.from(registry.values());
}

/**
 * Clear the registry. Exists for tests, which define throwaway components and would otherwise
 * collide on names across files. Never call this from engine or game code.
 */
export function resetComponentRegistry() {
  registry.clear();
  nextComponentId = 0;
}
