import { describe, it, expect } from 'vitest';
import {
  rgb,
  rgba,
  fromHexString,
  toCssColor,
  channels,
  lerpColor,
  WHITE,
  BLACK,
  MAGENTA,
} from '../color.js';

describe('packing', () => {
  it('packs channels into 0xRRGGBB', () => {
    expect(rgb(255, 0, 0)).toBe(0xff0000);
    expect(rgb(0, 255, 0)).toBe(0x00ff00);
    expect(rgb(0, 0, 255)).toBe(0x0000ff);
    expect(rgb(255, 255, 255)).toBe(WHITE);
    expect(rgb(0, 0, 0)).toBe(BLACK);
  });

  it('round-trips through channels', () => {
    const { r, g, b } = channels(0x336699);
    expect(r).toBe(0x33);
    expect(g).toBe(0x66);
    expect(b).toBe(0x99);
  });

  it('masks out-of-range channels rather than corrupting neighbours', () => {
    expect(channels(rgb(300, 0, 0)).g).toBe(0);
  });

  it('rgba keeps alpha separate from the packed colour', () => {
    expect(rgba(255, 0, 0, 0.5)).toEqual({ color: 0xff0000, alpha: 0.5 });
  });
});

describe('hex parsing', () => {
  it('parses six-digit hex, with or without a hash', () => {
    expect(fromHexString('#ff8800')).toBe(0xff8800);
    expect(fromHexString('ff8800')).toBe(0xff8800);
  });

  it('expands three-digit shorthand', () => {
    expect(fromHexString('#f80')).toBe(0xff8800);
    expect(fromHexString('#fff')).toBe(WHITE);
  });

  it('tolerates surrounding whitespace', () => {
    expect(fromHexString('  #123456  ')).toBe(0x123456);
  });

  it('falls back to magenta for anything unparseable', () => {
    expect(fromHexString('not-a-color')).toBe(MAGENTA);
    expect(fromHexString('')).toBe(MAGENTA);
    expect(fromHexString('#gggggg')).toBe(MAGENTA);
    expect(fromHexString('#ff')).toBe(MAGENTA);
  });
});

describe('CSS output', () => {
  it('emits a hex string at full alpha', () => {
    expect(toCssColor(0xff8800)).toBe('#ff8800');
  });

  it('pads short values to six digits', () => {
    expect(toCssColor(0x000010)).toBe('#000010');
    expect(toCssColor(BLACK)).toBe('#000000');
  });

  it('emits rgba below full alpha', () => {
    expect(toCssColor(0xff0000, 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });
});

describe('interpolation', () => {
  it('returns the endpoints exactly', () => {
    expect(lerpColor(BLACK, WHITE, 0)).toBe(BLACK);
    expect(lerpColor(BLACK, WHITE, 1)).toBe(WHITE);
  });

  it('blends halfway per channel', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('clamps t outside [0, 1] instead of extrapolating into garbage', () => {
    expect(lerpColor(BLACK, WHITE, 5)).toBe(WHITE);
    expect(lerpColor(BLACK, WHITE, -5)).toBe(BLACK);
  });

  it('keeps every channel in range across the sweep', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const { r, g, b } = channels(lerpColor(0x123456, 0xfedcba, t));
      for (const value of [r, g, b]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(255);
      }
    }
  });
});
