import { getComponentType } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';

/**
 * Scene (de)serialisation to plain JSON.
 *
 * This works at all only because of Invariant C2 — components are plain data, no methods, no
 * closures — so every field is either already JSON-safe or a `Vec2` with a `toJSON`. The one
 * thing JSON round-tripping cannot do on its own is turn `{x, y}` back into a real `Vec2`
 * instance, so this module is deliberately schema-driven: a field typed `'vec2'` is reconstructed
 * as one, and everything else passes through unchanged. Components defined with no schema at all
 * are serialised opaquely, whatever shape they happen to be — this module never assumes it knows
 * more about a component than the component declared about itself.
 *
 * Scene shape:
 * ```json
 * { "version": 1, "entities": [ { "components": { "Transform": {...}, "Sprite": {...} } } ] }
 * ```
 * Entity identity is not preserved across a save/load round trip — entities are recreated fresh
 * on load, the same way a level loader recreates a level's entities on every scene change
 * (SPEC §12, and consistent with how `Scene.onEnter` already works in `@novaforge/runtime`).
 */

/** The scene format version this module reads and writes. Bump on a breaking format change. */
export const SCENE_FORMAT_VERSION = 1;

/**
 * Deep-clone a component's schema-declared fields into plain JSON-safe data.
 *
 * Used both for scene saves and for the command stack's create/delete snapshots — one function,
 * so a bug in field handling cannot exist in one path and not the other.
 *
 * @param {import('@novaforge/core').ComponentType} type
 * @param {any} value a live component instance
 * @returns {any} a value with no shared references to `value`, safe to hold onto indefinitely
 */
export function snapshotComponent(type, value) {
  if (type.isTag) return true;
  // No schema: serialise the whole value opaquely. `JSON.parse(JSON.stringify(...))` both
  // detaches it from the live instance and normalises any `Vec2` fields via their `toJSON`.
  if (type.schema === null) return JSON.parse(JSON.stringify(value));

  /** @type {Record<string, any>} */
  const out = {};
  for (const field of Object.keys(type.schema)) {
    out[field] = JSON.parse(JSON.stringify(value[field]));
  }
  return out;
}

/**
 * Reconstruct the values object `World.add` expects from a snapshot produced by
 * {@link snapshotComponent}.
 *
 * @param {import('@novaforge/core').ComponentType} type
 * @param {any} data
 * @returns {any}
 */
export function restoreComponentValues(type, data) {
  if (type.isTag) return undefined;
  if (type.schema === null) return data;

  /** @type {Record<string, any>} */
  const out = {};
  for (const [field, spec] of Object.entries(type.schema)) {
    const raw = data?.[field];
    out[field] = spec.type === 'vec2' && raw !== undefined && raw !== null
      ? new Vec2(raw.x, raw.y)
      : raw;
  }
  return out;
}

/**
 * Serialise one entity's components.
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @returns {{ components: Record<string, any> }}
 */
export function serializeEntity(world, entity) {
  /** @type {Record<string, any>} */
  const components = {};
  for (const { type, value } of world.componentsOf(entity)) {
    components[type.name] = snapshotComponent(type, value);
  }
  return { components };
}

/**
 * Serialise a whole scene.
 * @param {import('@novaforge/core').World} world
 * @param {number[]} [entities] defaults to every entity in the world
 * @returns {{ version: number, entities: Array<{ components: Record<string, any> }> }}
 */
export function serializeScene(world, entities = world.entities()) {
  return {
    version: SCENE_FORMAT_VERSION,
    entities: entities.map((entity) => serializeEntity(world, entity)),
  };
}

/**
 * @param {import('@novaforge/core').World} world
 * @returns {string} the scene as formatted JSON text, ready to save to a file.
 */
export function saveSceneToText(world) {
  return JSON.stringify(serializeScene(world), null, 2);
}

/**
 * Spawn one entity from a serialised record.
 *
 * An unresolvable component name — from a scene saved by a build that defined a component this
 * one no longer does — is skipped with a warning rather than aborting the whole load. A scene
 * file surviving a partial rename is more useful than a load that refuses to open it at all
 * (the spirit of Invariant A1, applied to scene data instead of assets).
 *
 * @param {import('@novaforge/core').World} world
 * @param {{ components: Record<string, any> }} entityData
 * @returns {number} the new entity handle
 */
export function deserializeEntity(world, entityData) {
  const entity = world.createEntity();
  for (const [name, data] of Object.entries(entityData.components ?? {})) {
    const type = getComponentType(name);
    if (type === undefined) {
      console.warn(`deserializeEntity: unknown component "${name}"; skipping`);
      continue;
    }
    world.add(entity, type, restoreComponentValues(type, data));
  }
  return entity;
}

/**
 * Load a serialised scene into a world.
 * @param {import('@novaforge/core').World} world
 * @param {{ version?: number, entities?: Array<{ components: Record<string, any> }> }} scene
 * @param {{ clearExisting?: boolean }} [options]
 * @returns {number[]} the newly created entity handles
 * @throws {Error} if the scene's format version is newer than this module understands — silently
 *   misreading a future format would produce a corrupted-looking scene with no explanation.
 */
export function deserializeScene(world, scene, options = {}) {
  if ((scene.version ?? SCENE_FORMAT_VERSION) > SCENE_FORMAT_VERSION) {
    throw new Error(
      `deserializeScene: scene format v${scene.version} is newer than this build understands (v${SCENE_FORMAT_VERSION})`,
    );
  }

  if (options.clearExisting) world.clearEntities();

  return (scene.entities ?? []).map((entityData) => deserializeEntity(world, entityData));
}

/**
 * @param {import('@novaforge/core').World} world
 * @param {string} text JSON produced by {@link saveSceneToText}
 * @param {{ clearExisting?: boolean }} [options]
 * @returns {number[]} the newly created entity handles
 */
export function loadSceneFromText(world, text, options) {
  return deserializeScene(world, JSON.parse(text), options);
}
