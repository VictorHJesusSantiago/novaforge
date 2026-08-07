import { defineComponent } from './component.js';
import { NULL_ENTITY } from './entity.js';

/**
 * Parent/child grouping for the editor's scene tree.
 *
 * **What this is not.** `Parent` records *organisational* structure only — it does not compose
 * transforms. A child's `Transform.position` stays world-space, exactly as it always has;
 * nothing here makes moving a parent drag its children along. Real transform inheritance is a
 * bigger, riskier change: `Transform.position` is read as world-space by every system in
 * `physics` and `renderer` today, and making it sometimes-local-sometimes-world would mean
 * teaching every one of those systems to resolve a chain first. Grouping without inheritance is
 * the honest subset that is safe to ship without touching either of those packages: it gives the
 * scene tree real nesting now, and composed transforms can be layered on top of it later without
 * a breaking change, because "parent" and "local offset" are separable concerns.
 *
 * **Stale references degrade safely.** A `Parent.entity` pointing at a destroyed entity is
 * detected the same way any stale handle is — `world.isAlive()` returns false for it — so a
 * child whose parent was destroyed without cascading (plain `world.destroy`, not
 * {@link destroyHierarchy}) is simply treated as a root by every function here, never as a crash.
 */
export const Parent = defineComponent(
  'Parent',
  () => ({ entity: NULL_ENTITY }),
  { entity: { type: 'entity' } },
);

/**
 * @param {import('./world.js').World} world
 * @param {number} entity
 * @returns {number} the parent's handle, or `NULL_ENTITY` for a root or an entity whose parent
 *   was destroyed without cascading.
 */
export function getParent(world, entity) {
  const parent = world.get(entity, Parent);
  if (parent === undefined) return NULL_ENTITY;
  if (!world.isAlive(parent.entity)) return NULL_ENTITY;
  return parent.entity;
}

/**
 * @param {import('./world.js').World} world
 * @param {number} candidateAncestor
 * @param {number} entity
 * @returns {boolean} true if `candidateAncestor` is `entity` itself or anywhere in its parent
 *   chain.
 */
export function isAncestorOf(world, candidateAncestor, entity) {
  let current = entity;
  // Bounded by MAX_ENTITIES in the worst case, but a real hierarchy is never that deep; the
  // guard exists purely so a bug that produced a cycle some other way fails as an infinite loop
  // here would, minus the actual infinite loop.
  for (let steps = 0; steps < 1_000_000; steps += 1) {
    if (current === candidateAncestor) return true;
    const next = getParent(world, current);
    if (next === NULL_ENTITY) return false;
    current = next;
  }
  throw new Error('isAncestorOf: parent chain did not terminate (a cycle exists)');
}

/**
 * Attach `entity` under `parent`, or detach it to become a root when `parent` is `NULL_ENTITY`.
 *
 * @param {import('./world.js').World} world
 * @param {number} entity
 * @param {number} parent `NULL_ENTITY` to make `entity` a root
 * @returns {void}
 * @throws {Error} if `parent` is `entity` itself or one of its own descendants — attaching it
 *   would create a cycle, which every function that walks "up to the root" assumes cannot exist.
 */
export function setParent(world, entity, parent) {
  if (parent !== NULL_ENTITY && isAncestorOf(world, entity, parent)) {
    throw new Error(
      `setParent: cannot make ${parent} the parent of ${entity} — ${parent} is already a descendant of ${entity}`,
    );
  }

  if (parent === NULL_ENTITY) {
    world.remove(entity, Parent);
    return;
  }
  world.add(entity, Parent, { entity: parent });
}

/**
 * @param {import('./world.js').World} world
 * @param {number} entity
 * @returns {number[]} every entity directly parented to `entity`.
 *   O(entities with a Parent component) — fine for a scene tree, wrong for a hot loop.
 */
export function getChildren(world, entity) {
  if (!world.isAlive(entity)) return [];
  /** @type {number[]} */
  const children = [];
  for (const [child, parent] of world.query([Parent])) {
    if (parent.entity === entity) children.push(child);
  }
  return children;
}

/**
 * @param {import('./world.js').World} world
 * @returns {number[]} every entity with no live parent — the scene tree's top level.
 */
export function getRoots(world) {
  return world.entities().filter((entity) => getParent(world, entity) === NULL_ENTITY);
}

/**
 * @param {import('./world.js').World} world
 * @param {number} entity
 * @returns {number[]} every descendant, depth-first, parent before child.
 */
export function getDescendants(world, entity) {
  /** @type {number[]} */
  const result = [];
  for (const child of getChildren(world, entity)) {
    result.push(child, ...getDescendants(world, child));
  }
  return result;
}

/**
 * Destroy an entity and every descendant, deferred the same way `World.destroy` is.
 *
 * Plain `world.destroy(entity)` does **not** do this — it orphans children, promoting them to
 * roots, which is the right default for `World` (which has no idea what a "child" is) but the
 * wrong default for an editor's delete button, which is why this lives here instead.
 *
 * @param {import('./world.js').World} world
 * @param {number} entity
 * @returns {number[]} every entity destroyed, `entity` first then its descendants.
 */
export function destroyHierarchy(world, entity) {
  const victims = [entity, ...getDescendants(world, entity)];
  for (const victim of victims) world.destroy(victim);
  return victims;
}
