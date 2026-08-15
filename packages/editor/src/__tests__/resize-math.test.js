import { describe, it, expect } from 'vitest';
import { resizedSize } from '../resize-math.js';

describe('resizedSize', () => {
  it('grows by the pointer delta', () => {
    expect(resizedSize(200, 50, 0, 1000)).toBe(250);
  });

  it('shrinks by a negative delta', () => {
    expect(resizedSize(200, -50, 0, 1000)).toBe(150);
  });

  it('clamps to the minimum', () => {
    expect(resizedSize(200, -1000, 100, 1000)).toBe(100);
  });

  it('clamps to the maximum', () => {
    expect(resizedSize(200, 5000, 0, 1000)).toBe(1000);
  });

  it('inverts the delta sign when invert is true', () => {
    expect(resizedSize(200, 50, 0, 1000, true)).toBe(150);
    expect(resizedSize(200, -50, 0, 1000, true)).toBe(250);
  });

  it('still clamps correctly when inverted', () => {
    expect(resizedSize(200, 5000, 100, 1000, true)).toBe(100);
  });
});
