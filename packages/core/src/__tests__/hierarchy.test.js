import { describe, it, expect } from 'vitest';
import { World } from '../world.js';
import { NULL_ENTITY } from '../entity.js';
import {
  setParent,
  getParent,
  getChildren,
  getRoots,
  getDescendants,
  isAncestorOf,
  destroyHierarchy,
} from '../hierarchy.js';

describe('setParent / getParent', () => {
  it('attaches a child to a parent', () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    expect(getParent(world, child)).toBe(parent);
  });

  it('reports NULL_ENTITY for a root', () => {
    const world = new World();
    const entity = world.createEntity();
    expect(getParent(world, entity)).toBe(NULL_ENTITY);
  });

  it('detaches back to a root when set to NULL_ENTITY', () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    setParent(world, child, NULL_ENTITY);
    expect(getParent(world, child)).toBe(NULL_ENTITY);
  });

  it('re-parenting overwrites the previous parent', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, a);
    setParent(world, child, b);
    expect(getParent(world, child)).toBe(b);
  });

  // Invariant E1 reused: a stale Parent reference must degrade to "no parent", not crash.
  it('treats a destroyed parent as no parent', () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    world.destroyImmediate(parent);
    expect(getParent(world, child)).toBe(NULL_ENTITY);
  });

  it('rejects making an entity its own parent', () => {
    const world = new World();
    const entity = world.createEntity();
    expect(() => setParent(world, entity, entity)).toThrow(/descendant/);
  });

  it('rejects a cycle through a grandchild', () => {
    const world = new World();
    const grandparent = world.createEntity();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, parent, grandparent);
    setParent(world, child, parent);

    expect(() => setParent(world, grandparent, child)).toThrow(/descendant/);
  });

  it('does not mutate anything when a cycle is rejected', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    setParent(world, b, a);

    expect(() => setParent(world, a, b)).toThrow();
    expect(getParent(world, b)).toBe(a);
    expect(getParent(world, a)).toBe(NULL_ENTITY);
  });
});

describe('isAncestorOf', () => {
  it('is true for the entity itself', () => {
    const world = new World();
    const entity = world.createEntity();
    expect(isAncestorOf(world, entity, entity)).toBe(true);
  });

  it('is true through several generations', () => {
    const world = new World();
    const grandparent = world.createEntity();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, parent, grandparent);
    setParent(world, child, parent);

    expect(isAncestorOf(world, grandparent, child)).toBe(true);
  });

  it('is false for an unrelated entity', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    expect(isAncestorOf(world, a, b)).toBe(false);
  });
});

describe('getChildren', () => {
  it('lists direct children only', () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    const grandchild = world.createEntity();
    setParent(world, child, parent);
    setParent(world, grandchild, child);

    expect(getChildren(world, parent)).toEqual([child]);
  });

  it('is empty for a leaf', () => {
    const world = new World();
    const entity = world.createEntity();
    expect(getChildren(world, entity)).toEqual([]);
  });

  it('is empty for a dead entity', () => {
    const world = new World();
    const entity = world.createEntity();
    world.destroyImmediate(entity);
    expect(getChildren(world, entity)).toEqual([]);
  });

  it('lists several children of the same parent', () => {
    const world = new World();
    const parent = world.createEntity();
    const a = world.createEntity();
    const b = world.createEntity();
    setParent(world, a, parent);
    setParent(world, b, parent);
    expect(getChildren(world, parent).sort()).toEqual([a, b].sort());
  });
});

describe('getRoots', () => {
  it('lists entities with no parent', () => {
    const world = new World();
    const root = world.createEntity();
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);

    expect(getRoots(world).sort()).toEqual([root, parent].sort());
  });

  it('is every entity in a world with no hierarchy at all', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    expect(getRoots(world).sort()).toEqual([a, b].sort());
  });
});

describe('getDescendants', () => {
  it('walks the whole subtree, parent before child', () => {
    const world = new World();
    const root = world.createEntity();
    const child = world.createEntity();
    const grandchild = world.createEntity();
    setParent(world, child, root);
    setParent(world, grandchild, child);

    expect(getDescendants(world, root)).toEqual([child, grandchild]);
  });

  it('is empty for a leaf', () => {
    const world = new World();
    expect(getDescendants(world, world.createEntity())).toEqual([]);
  });

  it('includes every branch of a fan-out', () => {
    const world = new World();
    const root = world.createEntity();
    const a = world.createEntity();
    const b = world.createEntity();
    setParent(world, a, root);
    setParent(world, b, root);

    expect(getDescendants(world, root).sort()).toEqual([a, b].sort());
  });
});

describe('destroyHierarchy', () => {
  it('destroys an entity and every descendant', () => {
    const world = new World();
    const root = world.createEntity();
    const child = world.createEntity();
    const grandchild = world.createEntity();
    setParent(world, child, root);
    setParent(world, grandchild, child);

    const destroyed = destroyHierarchy(world, root);
    world.flushDestroyed();

    expect(destroyed.sort()).toEqual([root, child, grandchild].sort());
    expect(world.isAlive(root)).toBe(false);
    expect(world.isAlive(child)).toBe(false);
    expect(world.isAlive(grandchild)).toBe(false);
  });

  it('leaves an unrelated sibling alone', () => {
    const world = new World();
    const root = world.createEntity();
    const child = world.createEntity();
    const other = world.createEntity();
    setParent(world, child, root);

    destroyHierarchy(world, root);
    world.flushDestroyed();

    expect(world.isAlive(other)).toBe(true);
  });

  // Plain world.destroy is the deliberate contrast: it orphans children instead.
  it('differs from plain world.destroy, which orphans children instead of cascading', () => {
    const world = new World();
    const root = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, root);

    world.destroy(root);
    world.flushDestroyed();

    expect(world.isAlive(child)).toBe(true);
    expect(getParent(world, child)).toBe(NULL_ENTITY);
  });
});
