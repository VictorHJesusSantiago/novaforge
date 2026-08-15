/**
 * Entity handles.
 *
 * An entity is a plain 32-bit integer, not an object — packing an index and a generation
 * counter into one number (SPEC §3):
 *
 * ```
 *  bit 30            20 19              0
 *      | generation (11) |   index (20)  |
 * ```
 *
 * The generation is what makes stale handles detectable. When an entity is destroyed its index
 * returns to a free list and its generation increments, so a handle captured before the destroy
 * no longer matches and `World.isAlive` reports false. Without this, index reuse would silently
 * resurrect dead entities and a component holding an entity reference would point at a stranger.
 *
 * 31 bits total, deliberately: staying inside the signed 32-bit range keeps every operation on
 * the fast integer path in V8 and keeps `|` and `>>>` well-defined.
 */

export const ENTITY_INDEX_BITS = 20;
export const ENTITY_INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;

export const ENTITY_GENERATION_BITS = 11;
export const ENTITY_GENERATION_MASK = (1 << ENTITY_GENERATION_BITS) - 1;

/** Highest addressable entity index — 1,048,576 live entities. */
export const MAX_ENTITIES = ENTITY_INDEX_MASK + 1;

/** Generation wraps after this many recycles of the same index (SPEC Invariant E2). */
export const MAX_GENERATION = ENTITY_GENERATION_MASK;

/**
 * The absent-entity sentinel.
 *
 * Generations start at 1 rather than 0 precisely so that no live handle is ever `0`. That makes
 * `if (entity)` safe, and it makes an uninitialised component field distinguishable from a
 * reference to the first entity ever created.
 */
export const NULL_ENTITY = 0;

/**
 * @param {number} index
 * @param {number} generation
 * @returns {number} a packed entity handle.
 */
export function makeEntity(index, generation) {
  return ((generation & ENTITY_GENERATION_MASK) << ENTITY_INDEX_BITS) | (index & ENTITY_INDEX_MASK);
}

/**
 * @param {number} entity
 * @returns {number} the storage index this handle refers to.
 */
export function entityIndex(entity) {
  return entity & ENTITY_INDEX_MASK;
}

/**
 * @param {number} entity
 * @returns {number} the generation this handle was minted with.
 */
export function entityGeneration(entity) {
  return (entity >>> ENTITY_INDEX_BITS) & ENTITY_GENERATION_MASK;
}

/**
 * Human-readable form for logs and test failures. `Entity#12:3` reads far better in an
 * assertion diff than `3145740`.
 * @param {number} entity
 * @returns {string}
 */
export function describeEntity(entity) {
  if (entity === NULL_ENTITY) return 'Entity(null)';
  return `Entity#${entityIndex(entity)}:${entityGeneration(entity)}`;
}
