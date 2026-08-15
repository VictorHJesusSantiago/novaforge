import { describe, it, expect, beforeEach } from 'vitest';
import {
  World,
  defineComponent,
  resetComponentRegistry,
  registerComponentType,
  setParent,
  getParent,
  Parent,
  NULL_ENTITY,
} from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { CommandStack } from '../command-stack.js';
import {
  setFieldCommand,
  addComponentCommand,
  removeComponentCommand,
  createEntityCommand,
  deleteEntityCommand,
  renameEntityCommand,
  setParentCommand,
} from '../commands.js';

/** @type {any} */ let Position;
/** @type {any} */ let Name;
/** @type {World} */ let world;
/** @type {CommandStack} */ let stack;

beforeEach(() => {
  resetComponentRegistry();
  registerComponentType(Parent);
  Position = defineComponent(
    'Position',
    () => ({ point: new Vec2(0, 0) }),
    { point: { type: 'vec2' } },
  );
  Name = defineComponent('Name', () => ({ value: '' }), { value: { type: 'string' } });
  world = new World();
  stack = new CommandStack();
});

describe('setFieldCommand', () => {
  it('applies the new value on execute', () => {
    const entity = world.spawn([Position]);
    stack.execute(setFieldCommand(world, entity, Position, 'point', new Vec2(0, 0), new Vec2(5, 5)));
    expect(world.get(entity, Position)?.point).toEqual(new Vec2(5, 5));
  });

  it('restores the captured old value on undo', () => {
    const entity = world.spawn([Position]);
    stack.execute(setFieldCommand(world, entity, Position, 'point', new Vec2(1, 1), new Vec2(5, 5)));
    stack.undo();
    expect(world.get(entity, Position)?.point).toEqual(new Vec2(1, 1));
  });

  it('supports being built after the field was already changed live', () => {
    const entity = world.spawn([Position]);
    const before = new Vec2(0, 0);
    const live = world.get(entity, Position);
    if (live) live.point.set(50, 50);

    stack.execute(setFieldCommand(world, entity, Position, 'point', before, new Vec2(50, 50)));
    stack.undo();
    expect(world.get(entity, Position)?.point).toEqual(before);
  });

  it('does nothing if the entity no longer has the component', () => {
    const entity = world.spawn([Position]);
    world.remove(entity, Position);
    expect(() =>
      stack.execute(setFieldCommand(world, entity, Position, 'point', new Vec2(), new Vec2(1, 1))),
    ).not.toThrow();
  });
});

describe('addComponentCommand / removeComponentCommand', () => {
  it('adds with factory defaults', () => {
    const entity = world.createEntity();
    stack.execute(addComponentCommand(world, entity, Position));
    expect(world.has(entity, Position)).toBe(true);
  });

  it('undoing add removes the component', () => {
    const entity = world.createEntity();
    stack.execute(addComponentCommand(world, entity, Position));
    stack.undo();
    expect(world.has(entity, Position)).toBe(false);
  });

  it('removing restores the exact prior values on undo, not factory defaults', () => {
    const entity = world.spawn([Position]);
    world.get(entity, Position)?.point.set(7, 8);

    stack.execute(removeComponentCommand(world, entity, Position));
    expect(world.has(entity, Position)).toBe(false);

    stack.undo();
    expect(world.get(entity, Position)?.point).toEqual(new Vec2(7, 8));
  });

  it('removing an absent component is a harmless no-op', () => {
    const entity = world.createEntity();
    expect(() => stack.execute(removeComponentCommand(world, entity, Position))).not.toThrow();
    stack.undo();
    expect(world.has(entity, Position)).toBe(false);
  });
});

describe('createEntityCommand / deleteEntityCommand', () => {
  it('creates a live, bare entity', () => {
    const command = createEntityCommand(world);
    stack.execute(command);
    const entity = command.entity();
    expect(entity).not.toBeNull();
    expect(world.isAlive(/** @type {number} */ (entity))).toBe(true);
  });

  it('undoing create destroys it immediately', () => {
    const command = createEntityCommand(world);
    stack.execute(command);
    const entity = /** @type {number} */ (command.entity());
    stack.undo();
    expect(world.isAlive(entity)).toBe(false);
  });

  it('deletes an entity and restores its exact components on undo', () => {
    const entity = world.spawn([Position, { point: new Vec2(3, 4) }]);
    const command = deleteEntityCommand(world, entity);

    stack.execute(command);
    expect(world.isAlive(entity)).toBe(false);

    stack.undo();
    const restored = /** @type {number} */ (command.entity());
    expect(world.isAlive(restored)).toBe(true);
    expect(world.get(restored, Position)?.point).toEqual(new Vec2(3, 4));
  });

  it('mints a new handle on undo rather than reviving the old one', () => {
    const entity = world.spawn([Position]);
    const command = deleteEntityCommand(world, entity);
    stack.execute(command);
    stack.undo();
    expect(command.entity()).not.toBe(entity);
  });

  it('redo deletes it again', () => {
    const entity = world.spawn([Position]);
    const command = deleteEntityCommand(world, entity);
    stack.execute(command);
    stack.undo();
    const restored = /** @type {number} */ (command.entity());

    stack.redo();

    expect(world.isAlive(restored)).toBe(false);
  });
});

describe('deleteEntityCommand cascades to the whole subtree', () => {
  it('destroys children along with the entity', () => {
    const parent = world.spawn([Position]);
    const child = world.createEntity();
    setParent(world, child, parent);

    stack.execute(deleteEntityCommand(world, parent));

    expect(world.isAlive(parent)).toBe(false);
    expect(world.isAlive(child)).toBe(false);
  });

  it('destroys grandchildren too', () => {
    const root = world.spawn([Position]);
    const child = world.createEntity();
    const grandchild = world.createEntity();
    setParent(world, child, root);
    setParent(world, grandchild, child);

    stack.execute(deleteEntityCommand(world, root));

    expect(world.isAlive(grandchild)).toBe(false);
  });

  it('leaves an unrelated entity alone', () => {
    const parent = world.spawn([Position]);
    const child = world.createEntity();
    setParent(world, child, parent);
    const other = world.createEntity();

    stack.execute(deleteEntityCommand(world, parent));

    expect(world.isAlive(other)).toBe(true);
  });

  it('undo restores the whole subtree with the parent/child edge intact', () => {
    const parent = world.spawn([Position, { point: new Vec2(9, 9) }]);
    const child = world.createEntity();
    setParent(world, child, parent);

    const command = deleteEntityCommand(world, parent);
    stack.execute(command);
    stack.undo();

    const newParent = /** @type {number} */ (command.entity());
    expect(world.get(newParent, Position)?.point).toEqual(new Vec2(9, 9));

    const children = world.entities().filter((e) => getParent(world, e) === newParent);
    expect(children).toHaveLength(1);
  });

  it('does not remap a Parent that pointed outside the deleted subtree', () => {
    const grandparent = world.createEntity();
    const parent = world.spawn([Position]);
    setParent(world, parent, grandparent);
    const child = world.createEntity();
    setParent(world, child, parent);

    const command = deleteEntityCommand(world, parent);
    stack.execute(command);
    stack.undo();

    const newParent = /** @type {number} */ (command.entity());
    expect(getParent(world, newParent)).toBe(grandparent);
  });

  it('redo deletes the recreated subtree again', () => {
    const parent = world.spawn([Position]);
    const child = world.createEntity();
    setParent(world, child, parent);

    const command = deleteEntityCommand(world, parent);
    stack.execute(command);
    stack.undo();
    const recreatedParent = /** @type {number} */ (command.entity());

    stack.redo();

    expect(world.isAlive(recreatedParent)).toBe(false);
    expect(world.entities().filter((e) => getParent(world, e) === recreatedParent)).toHaveLength(0);
  });
});

describe('setParentCommand', () => {
  it('attaches the entity to the new parent', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    stack.execute(setParentCommand(world, child, NULL_ENTITY, parent));
    expect(getParent(world, child)).toBe(parent);
  });

  it('restores the previous parent on undo', () => {
    const oldParent = world.createEntity();
    const newParent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, oldParent);

    stack.execute(setParentCommand(world, child, oldParent, newParent));
    stack.undo();

    expect(getParent(world, child)).toBe(oldParent);
  });

  it('supports detaching to root via NULL_ENTITY', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);

    stack.execute(setParentCommand(world, child, parent, NULL_ENTITY));

    expect(getParent(world, child)).toBe(NULL_ENTITY);
  });
});

describe('renameEntityCommand', () => {
  it('creates a Name component if the entity has none', () => {
    const entity = world.createEntity();
    stack.execute(renameEntityCommand(world, entity, '', 'Player'));
    expect(world.get(entity, Name)?.value).toBe('Player');
  });

  it('renames an entity that already has a Name', () => {
    const entity = world.spawn([Name, { value: 'Old' }]);
    stack.execute(renameEntityCommand(world, entity, 'Old', 'New'));
    expect(world.get(entity, Name)?.value).toBe('New');
  });

  it('restores the previous name on undo', () => {
    const entity = world.spawn([Name, { value: 'Old' }]);
    stack.execute(renameEntityCommand(world, entity, 'Old', 'New'));
    stack.undo();
    expect(world.get(entity, Name)?.value).toBe('Old');
  });
});
