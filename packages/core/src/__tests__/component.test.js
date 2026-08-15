import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineComponent,
  defineTag,
  componentCount,
  resetComponentRegistry,
  getComponentType,
  listComponentTypes,
  registerComponentType,
} from '../component.js';

beforeEach(() => {
  resetComponentRegistry();
});

describe('defineComponent', () => {
  it('assigns dense, increasing ids', () => {
    const a = defineComponent('A', () => ({}));
    const b = defineComponent('B', () => ({}));
    expect(a.id).toBe(0);
    expect(b.id).toBe(1);
    expect(componentCount()).toBe(2);
  });

  it('keeps the name for diagnostics and serialisation', () => {
    expect(defineComponent('Health', () => ({ hp: 1 })).name).toBe('Health');
  });

  it('produces a fresh instance per factory call', () => {
    const type = defineComponent('Position', () => ({ x: 0, y: 0 }));
    expect(type.factory()).not.toBe(type.factory());
  });

  it('rejects a duplicate name', () => {
    defineComponent('Dup', () => ({}));
    expect(() => defineComponent('Dup', () => ({}))).toThrow(/already defined/);
  });

  it('requires a factory function', () => {
    expect(() => defineComponent('Bad', /** @type {any} */ ({ x: 0 }))).toThrow(TypeError);
  });

  it('defaults the schema to null', () => {
    expect(defineComponent('NoSchema', () => ({})).schema).toBeNull();
  });

  it('keeps a supplied schema for the editor inspector', () => {
    const type = defineComponent('Health', () => ({ hp: 100 }), {
      hp: { type: 'number', min: 0, max: 100 },
    });
    expect(type.schema?.hp.max).toBe(100);
  });
});

describe('defineTag', () => {
  it('is marked as a tag', () => {
    expect(defineTag('Frozen').isTag).toBe(true);
  });

  it('produces a bare true, not an object', () => {
    expect(defineTag('Selected').factory()).toBe(true);
  });

  it('shares the name registry with defineComponent', () => {
    defineComponent('Shared', () => ({}));
    expect(() => defineTag('Shared')).toThrow(/already defined/);
  });
});

describe('getComponentType', () => {
  it('resolves a defined component by name', () => {
    const type = defineComponent('Health', () => ({ hp: 1 }));
    expect(getComponentType('Health')).toBe(type);
  });

  it('returns undefined for an unknown name', () => {
    expect(getComponentType('DoesNotExist')).toBeUndefined();
  });

  it('resolves tags too', () => {
    const tag = defineTag('Frozen');
    expect(getComponentType('Frozen')).toBe(tag);
  });
});

describe('listComponentTypes', () => {
  it('lists every defined type in definition order', () => {
    const a = defineComponent('A', () => ({}));
    const b = defineComponent('B', () => ({}));
    expect(listComponentTypes()).toEqual([a, b]);
  });

  it('is empty before anything is defined', () => {
    expect(listComponentTypes()).toEqual([]);
  });
});

describe('registerComponentType', () => {
  it('restores name resolution for a type after a registry reset', () => {
    const original = defineComponent('Health', () => ({ hp: 1 }));
    resetComponentRegistry();
    expect(getComponentType('Health')).toBeUndefined();

    registerComponentType(original);
    expect(getComponentType('Health')).toBe(original);
  });

  it('does not mint a new id or disturb the counter', () => {
    const original = defineComponent('Health', () => ({ hp: 1 }));
    resetComponentRegistry();
    registerComponentType(original);
    const next = defineComponent('Mana', () => ({ mp: 1 }));

    expect(getComponentType('Health')?.id).toBe(original.id);
    expect(next.id).toBe(0);
  });
});

describe('resetComponentRegistry', () => {
  it('frees the names and restarts the ids', () => {
    defineComponent('Temp', () => ({}));
    resetComponentRegistry();
    expect(componentCount()).toBe(0);
    expect(defineComponent('Temp', () => ({})).id).toBe(0);
  });
});
