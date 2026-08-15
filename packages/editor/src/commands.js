import { getComponentType, getDescendants, setParent, Parent } from '@novaforge/core';
import { snapshotComponent, restoreComponentValues, serializeEntity, deserializeEntity } from './serializer.js';

/**
 * Command factories: the editor's actual vocabulary of edits.
 *
 * `CommandStack` only knows about `{ do, undo }`; every concrete edit the UI can make is built
 * here, on top of the world and the serialiser. Keeping them in one file makes the set of things
 * "editing a scene" can mean into something a reader can see at a glance.
 */

/**
 * Change one field of one component.
 *
 * The interactive-drag case (a gizmo dragging an entity every pointermove) is why `oldValue` is
 * captured by the caller up front rather than read from the world inside `do()`: a drag applies
 * the new value directly to the live component many times before ever calling `execute`, so by
 * the time this command is built the "current" value is already the new one — the command has
 * to be told what the value was *before the drag started*, not what it is now.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @param {import('@novaforge/core').ComponentType} type
 * @param {string} field
 * @param {any} oldValue
 * @param {any} newValue
 * @returns {import('./command-stack.js').Command}
 */
export function setFieldCommand(world, entity, type, field, oldValue, newValue) {
  return {
    label: `Set ${type.name}.${field}`,
    do() {
      const value = world.get(entity, type);
      if (value !== undefined) value[field] = newValue;
    },
    undo() {
      const value = world.get(entity, type);
      if (value !== undefined) value[field] = oldValue;
    },
  };
}

/**
 * Add a component to an entity with its factory defaults.
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @param {import('@novaforge/core').ComponentType} type
 * @returns {import('./command-stack.js').Command}
 */
export function addComponentCommand(world, entity, type) {
  return {
    label: `Add ${type.name}`,
    do() {
      world.add(entity, type);
    },
    undo() {
      world.remove(entity, type);
    },
  };
}

/**
 * Remove a component from an entity, snapshotting it so undo can restore its exact values —
 * not just re-add it with factory defaults, which would silently discard whatever the user had
 * tuned.
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @param {import('@novaforge/core').ComponentType} type
 * @returns {import('./command-stack.js').Command}
 */
export function removeComponentCommand(world, entity, type) {
  /** @type {any} */
  let snapshot = null;
  return {
    label: `Remove ${type.name}`,
    do() {
      const value = world.get(entity, type);
      if (value !== undefined) snapshot = snapshotComponent(type, value);
      world.remove(entity, type);
    },
    undo() {
      if (snapshot !== null) world.add(entity, type, restoreComponentValues(type, snapshot));
    },
  };
}

/**
 * Create a bare entity — undo destroys it immediately (not deferred), since this only ever
 * runs outside the system-iteration context the deferred path exists for.
 * @param {import('@novaforge/core').World} world
 * @returns {import('./command-stack.js').Command & { entity: () => number | null }}
 */
export function createEntityCommand(world) {
  /** @type {number | null} */
  let entity = null;
  return {
    label: 'Create entity',
    do() {
      entity = world.createEntity();
    },
    undo() {
      if (entity !== null) world.destroyImmediate(entity);
    },
    entity: () => entity,
  };
}

/**
 * Delete an entity **and its whole subtree**, snapshotting every component of every victim so
 * undo recreates the exact hierarchy — not just the entity itself, and not children silently
 * orphaned with a dangling `Parent` reference.
 *
 * Undo mints **new** handles for every recreated entity — Invariant E1 makes that unavoidable.
 * That creates a second problem beyond the single-entity case: each victim's `Parent` component,
 * if it pointed at another victim (a child pointing at its now-also-deleted parent), was
 * snapshotted holding the *old* handle. After recreation those handles no longer exist, so a
 * remap pass fixes up exactly the `Parent` references that pointed within the deleted subtree —
 * a `Parent` pointing at something *outside* the subtree (this entity's own, unaffected parent)
 * is never touched, because that entity's handle never changed.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @returns {import('./command-stack.js').Command & { entity: () => number | null }}
 */
export function deleteEntityCommand(world, entity) {
  const originalHandles = [entity, ...getDescendants(world, entity)];
  const snapshots = originalHandles.map((victim) => serializeEntity(world, victim));

  /** @type {number[]} current handles, parent-before-child, updated across undo/redo cycles */
  let current = originalHandles.slice();

  return {
    label: 'Delete entity',
    do() {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        if (world.isAlive(current[i])) world.destroyImmediate(current[i]);
      }
    },
    undo() {
      /** @type {Map<number, number>} old handle -> new handle, for the remap pass below */
      const remap = new Map();
      const recreated = [];

      for (let i = 0; i < snapshots.length; i += 1) {
        const newHandle = deserializeEntity(world, snapshots[i]);
        remap.set(originalHandles[i], newHandle);
        recreated.push(newHandle);
      }

      for (const newHandle of recreated) {
        const parent = world.get(newHandle, Parent);
        if (parent === undefined) continue;
        const remapped = remap.get(parent.entity);
        if (remapped !== undefined) parent.entity = remapped;
      }

      current = recreated;
    },
    entity: () => current[0] ?? null,
  };
}

/**
 * Move an entity to a new parent (or to the root, for `newParent === NULL_ENTITY`) — what the
 * scene tree's drag-and-drop reparenting calls.
 *
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @param {number} oldParent `NULL_ENTITY` if it was a root
 * @param {number} newParent `NULL_ENTITY` to make it a root
 * @returns {import('./command-stack.js').Command}
 */
export function setParentCommand(world, entity, oldParent, newParent) {
  return {
    label: 'Reparent entity',
    do() {
      setParent(world, entity, newParent);
    },
    undo() {
      setParent(world, entity, oldParent);
    },
  };
}

/**
 * Rename an entity's `Name` component, creating it if the entity does not have one yet.
 * @param {import('@novaforge/core').World} world
 * @param {number} entity
 * @param {string} oldName
 * @param {string} newName
 * @returns {import('./command-stack.js').Command}
 */
export function renameEntityCommand(world, entity, oldName, newName) {
  const NameType = /** @type {any} */ (getComponentType('Name'));
  return {
    label: 'Rename entity',
    do() {
      world.getOrAdd(entity, NameType).value = newName;
    },
    undo() {
      world.getOrAdd(entity, NameType).value = oldName;
    },
  };
}
