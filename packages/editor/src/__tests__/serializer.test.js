import { describe, it, expect, beforeEach } from 'vitest';
import { World, defineComponent, defineTag, resetComponentRegistry } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import {
  snapshotComponent,
  restoreComponentValues,
  serializeEntity,
  serializeScene,
  deserializeEntity,
  deserializeScene,
  saveSceneToText,
  loadSceneFromText,
  SCENE_FORMAT_VERSION,
} from '../serializer.js';

/** @type {any} */ let Position;
/** @type {any} */ let Opaque;
/** @type {any} */ let Frozen;
/** @type {World} */ let world;

beforeEach(() => {
  resetComponentRegistry();
  Position = defineComponent(
    'Position',
    () => ({ point: new Vec2(0, 0), label: 'origin' }),
    { point: { type: 'vec2' }, label: { type: 'string' } },
  );
  Opaque = defineComponent('Opaque', () => ({ nested: { a: 1, list: [1, 2, 3] } }));
  Frozen = defineTag('Frozen');
  world = new World();
});

describe('snapshotComponent', () => {
  it('converts a vec2 field to a plain {x,y} via its toJSON', () => {
    const value = Position.factory();
    value.point.set(3, 4);
    const snap = snapshotComponent(Position, value);
    expect(snap.point).toEqual({ x: 3, y: 4 });
    expect(snap.point).not.toBeInstanceOf(Vec2);
  });

  it('detaches from the live instance', () => {
    const value = Position.factory();
    const snap = snapshotComponent(Position, value);
    value.point.set(99, 99);
    expect(snap.point).toEqual({ x: 0, y: 0 });
  });

  it('serialises a tag as a bare true', () => {
    expect(snapshotComponent(Frozen, true)).toBe(true);
  });

  it('serialises a schema-less component opaquely, whatever shape it is', () => {
    const value = Opaque.factory();
    const snap = snapshotComponent(Opaque, value);
    expect(snap).toEqual({ nested: { a: 1, list: [1, 2, 3] } });
  });

  it('includes only schema-declared fields, dropping anything else on the instance', () => {
    const value = Position.factory();
    /** @type {any} */ (value).transient = 'should not be saved';
    const snap = snapshotComponent(Position, value);
    expect(snap.transient).toBeUndefined();
  });
});

describe('restoreComponentValues', () => {
  it('reconstructs a real Vec2 from a plain {x,y}', () => {
    const restored = restoreComponentValues(Position, { point: { x: 3, y: 4 }, label: 'x' });
    expect(restored.point).toBeInstanceOf(Vec2);
    expect(restored.point.x).toBe(3);
  });

  it('passes non-vec2 fields through unchanged', () => {
    const restored = restoreComponentValues(Position, { point: { x: 0, y: 0 }, label: 'hero' });
    expect(restored.label).toBe('hero');
  });

  it('returns undefined for a tag, matching what World.add expects', () => {
    expect(restoreComponentValues(Frozen, true)).toBeUndefined();
  });

  it('passes an opaque component through unchanged', () => {
    const data = { nested: { a: 2, list: [] } };
    expect(restoreComponentValues(Opaque, data)).toBe(data);
  });
});

describe('entity round trip', () => {
  it('serialises and restores every component on an entity', () => {
    const entity = world.spawn([Position, { label: 'hero' }], [Frozen]);
    world.get(entity, Position)?.point.set(5, 6);

    const snapshot = serializeEntity(world, entity);
    const restored = deserializeEntity(world, snapshot);

    expect(world.get(restored, Position)?.point.x).toBe(5);
    expect(world.get(restored, Position)?.label).toBe('hero');
    expect(world.has(restored, Frozen)).toBe(true);
  });

  // Invariant E1: a destroyed and recreated entity is a new handle. The serialiser cannot and
  // must not fake identity preservation across a save/load round trip.
  it('produces a different entity handle than the original', () => {
    const entity = world.spawn([Position]);
    const snapshot = serializeEntity(world, entity);
    const restored = deserializeEntity(world, snapshot);
    expect(restored).not.toBe(entity);
  });

  it('warns and skips an unknown component rather than throwing', () => {
    const restored = deserializeEntity(world, {
      components: { NotReal: { x: 1 } },
    });
    expect(world.isAlive(restored)).toBe(true);
    expect(world.componentsOf(restored)).toEqual([]);
  });

  it('round-trips an entity with no components', () => {
    const entity = world.createEntity();
    const restored = deserializeEntity(world, serializeEntity(world, entity));
    expect(world.componentsOf(restored)).toEqual([]);
  });
});

describe('scene round trip', () => {
  it('serialises the whole world by default', () => {
    world.spawn([Position]);
    world.spawn([Frozen]);
    const scene = serializeScene(world);
    expect(scene.entities).toHaveLength(2);
    expect(scene.version).toBe(SCENE_FORMAT_VERSION);
  });

  it('serialises only a given subset of entities when asked', () => {
    const a = world.spawn([Position]);
    world.spawn([Position]);
    const scene = serializeScene(world, [a]);
    expect(scene.entities).toHaveLength(1);
  });

  it('recreates every entity on load', () => {
    world.spawn([Position, { label: 'a' }]);
    world.spawn([Position, { label: 'b' }]);
    const scene = serializeScene(world);

    const fresh = new World();
    const created = deserializeScene(fresh, scene);

    expect(created).toHaveLength(2);
    expect(fresh.query([Position]).count()).toBe(2);
  });

  it('clears existing entities first when asked', () => {
    const survivor = world.spawn([Position, { label: 'keep' }]);
    const scene = serializeScene(world, [survivor]);

    const other = world.createEntity();
    deserializeScene(world, scene, { clearExisting: true });

    expect(world.isAlive(other)).toBe(false);
    expect(world.query([Position]).count()).toBe(1);
  });

  it('leaves existing entities alone by default', () => {
    const scene = serializeScene(world, [world.spawn([Position])]);
    const other = world.createEntity();
    deserializeScene(world, scene);
    expect(world.isAlive(other)).toBe(true);
  });

  it('rejects a scene from a newer, unrecognised format version', () => {
    expect(() => deserializeScene(world, { version: 999, entities: [] })).toThrow(/999/);
  });

  it('round-trips through actual JSON text', () => {
    world.spawn([Position, { label: 'hero' }]);
    const text = saveSceneToText(world);
    expect(typeof text).toBe('string');

    const fresh = new World();
    const created = loadSceneFromText(fresh, text);
    expect(fresh.get(created[0], Position)?.label).toBe('hero');
  });

  it('produces text that survives an actual JSON.parse/stringify cycle unchanged', () => {
    world.spawn([Position, { label: 'hero' }], [Frozen]);
    const text = saveSceneToText(world);
    const reparsed = JSON.parse(text);
    expect(reparsed).toEqual(JSON.parse(JSON.stringify(reparsed)));
  });
});
