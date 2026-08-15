import { describe, it, expect } from 'vitest';
import {
  NULL_ENTITY,
  MAX_ENTITIES,
  MAX_GENERATION,
  ENTITY_INDEX_MASK,
  makeEntity,
  entityIndex,
  entityGeneration,
  describeEntity,
} from '../entity.js';

describe('entity packing', () => {
  it('round-trips index and generation', () => {
    const e = makeEntity(12345, 7);
    expect(entityIndex(e)).toBe(12345);
    expect(entityGeneration(e)).toBe(7);
  });

  it('round-trips at the limits of both fields', () => {
    const e = makeEntity(ENTITY_INDEX_MASK, MAX_GENERATION);
    expect(entityIndex(e)).toBe(ENTITY_INDEX_MASK);
    expect(entityGeneration(e)).toBe(MAX_GENERATION);
  });

  it('produces distinct handles for the same index at different generations', () => {
    expect(makeEntity(5, 1)).not.toBe(makeEntity(5, 2));
  });

  it('produces distinct handles for different indices at the same generation', () => {
    expect(makeEntity(5, 1)).not.toBe(makeEntity(6, 1));
  });
});

describe('entity handle representation', () => {
  it('fits in a positive signed 32-bit integer', () => {
    const e = makeEntity(ENTITY_INDEX_MASK, MAX_GENERATION);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(2 ** 31);
    expect(Number.isInteger(e)).toBe(true);
  });

  it('is never zero for a generation of 1 or more', () => {
    for (let index = 0; index < 64; index += 1) {
      expect(makeEntity(index, 1)).not.toBe(NULL_ENTITY);
    }
  });

  it('addresses just over a million entities', () => {
    expect(MAX_ENTITIES).toBe(1048576);
  });

  it('allows 2047 recycles before the generation wraps', () => {
    expect(MAX_GENERATION).toBe(2047);
  });
});

describe('describeEntity', () => {
  it('formats a handle readably', () => {
    expect(describeEntity(makeEntity(12, 3))).toBe('Entity#12:3');
  });

  it('names the null sentinel', () => {
    expect(describeEntity(NULL_ENTITY)).toBe('Entity(null)');
  });
});
