/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Splitter } from '../splitter.js';

/** @param {string} type @param {number} x @returns {MouseEvent} */
function pointerEvent(type, x) {
  return new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true });
}

describe('construction', () => {
  it('applies the initial size as a CSS custom property', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    new Splitter(handle, { orientation: 'horizontal', target, property: '--w', initial: 240 });
    expect(target.style.getPropertyValue('--w')).toBe('240px');
  });
});

describe('dragging', () => {
  it('grows the size as the pointer moves right', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, {
      orientation: 'horizontal',
      target,
      property: '--w',
      initial: 240,
      min: 100,
      max: 600,
    });

    handle.dispatchEvent(pointerEvent('pointerdown', 100));
    handle.dispatchEvent(pointerEvent('pointermove', 150));

    expect(splitter.size).toBe(290);
    expect(target.style.getPropertyValue('--w')).toBe('290px');
  });

  it('does nothing before a pointerdown', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    new Splitter(handle, { orientation: 'horizontal', target, property: '--w', initial: 240 });

    handle.dispatchEvent(pointerEvent('pointermove', 500));

    expect(target.style.getPropertyValue('--w')).toBe('240px');
  });

  it('stops resizing after pointerup', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, {
      orientation: 'horizontal',
      target,
      property: '--w',
      initial: 240,
      max: 600,
    });

    handle.dispatchEvent(pointerEvent('pointerdown', 100));
    handle.dispatchEvent(pointerEvent('pointerup', 150));
    handle.dispatchEvent(pointerEvent('pointermove', 300));

    expect(splitter.size).toBe(240);
  });

  it('respects the invert option for a trailing-edge panel', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, {
      orientation: 'horizontal',
      target,
      property: '--w',
      initial: 240,
      max: 600,
      invert: true,
    });

    handle.dispatchEvent(pointerEvent('pointerdown', 100));
    handle.dispatchEvent(pointerEvent('pointermove', 150));

    expect(splitter.size).toBe(190);
  });

  it('respects vertical orientation, tracking clientY instead of clientX', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, {
      orientation: 'vertical',
      target,
      property: '--h',
      initial: 160,
      max: 600,
    });

    const down = new MouseEvent('pointerdown', { clientX: 999, clientY: 100, bubbles: true });
    const move = new MouseEvent('pointermove', { clientX: 999, clientY: 140, bubbles: true });
    handle.dispatchEvent(down);
    handle.dispatchEvent(move);

    expect(splitter.size).toBe(200);
  });
});

describe('setSize', () => {
  it('sets the size directly and clamps it', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, {
      orientation: 'horizontal',
      target,
      property: '--w',
      initial: 240,
      min: 100,
      max: 300,
    });

    splitter.setSize(9999);
    expect(splitter.size).toBe(300);
  });
});

describe('dispose', () => {
  it('stops responding to drags', () => {
    const handle = document.createElement('div');
    const target = document.createElement('div');
    const splitter = new Splitter(handle, { orientation: 'horizontal', target, property: '--w', initial: 240 });

    splitter.dispose();
    handle.dispatchEvent(pointerEvent('pointerdown', 100));
    handle.dispatchEvent(pointerEvent('pointermove', 500));

    expect(splitter.size).toBe(240);
  });
});
