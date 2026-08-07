import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioMixer } from '../mixer.js';
import { Bus } from '../bus.js';

/** @type {AudioMixer} */ let mixer;

beforeEach(() => {
  // `context: null` forces silent mode, which is also what Node gives you anyway. The mixer
  // keeps a complete model of what would be playing, so everything below is still assertable.
  mixer = new AudioMixer({ context: null });
});

describe('silent mode', () => {
  it('constructs with no Web Audio available', () => {
    expect(mixer.isAudible).toBe(false);
  });

  it('creates the default buses regardless', () => {
    expect(mixer.busNames().sort()).toEqual(['music', 'sfx', 'ui']);
  });

  // A game that crashes on a missing sound effect is unshippable.
  it('plays without throwing and reports a voice id', () => {
    expect(() => mixer.play('explosion')).not.toThrow();
    expect(mixer.play('explosion')).toBeGreaterThan(0);
  });

  it('models a looping voice so the count is still meaningful', () => {
    mixer.play('music', { loop: true, bus: 'music' });
    expect(mixer.voiceCount).toBe(1);
  });

  it('does not leave one-shot voices resident', () => {
    mixer.play('blip');
    mixer.play('blip');
    expect(mixer.voiceCount).toBe(0);
  });
});

describe('buses', () => {
  it('creates a named bus', () => {
    const bus = mixer.createBus('ambience', 0.3);
    expect(bus.name).toBe('ambience');
    expect(bus.volume).toBe(0.3);
  });

  it('returns the same instance for an existing name', () => {
    expect(mixer.createBus('sfx')).toBe(mixer.bus('sfx'));
  });

  // A typo'd bus name should mis-route the sound, not kill the frame it was triggered on.
  it('creates an unknown bus on demand instead of throwing', () => {
    expect(() => mixer.bus('typo')).not.toThrow();
    expect(mixer.busNames()).toContain('typo');
  });

  it('clamps bus volume to [0, 1]', () => {
    const bus = mixer.bus('sfx');
    bus.volume = 5;
    expect(bus.volume).toBe(1);
    bus.volume = -5;
    expect(bus.volume).toBe(0);
  });

  it('reports zero effective volume while muted, without losing the setting', () => {
    const bus = new Bus('music', 0.7);
    bus.setMuted(true);
    expect(bus.effectiveVolume()).toBe(0);
    expect(bus.volume).toBe(0.7);

    bus.setMuted(false);
    expect(bus.effectiveVolume()).toBe(0.7);
  });
});

describe('master volume', () => {
  it('clamps to [0, 1]', () => {
    mixer.masterVolume = 3;
    expect(mixer.masterVolume).toBe(1);
    mixer.masterVolume = -1;
    expect(mixer.masterVolume).toBe(0);
  });

  it('keeps the setting through a mute cycle', () => {
    mixer.masterVolume = 0.4;
    mixer.setMuted(true);
    expect(mixer.masterVolume).toBe(0.4);
    mixer.setMuted(false);
    expect(mixer.masterVolume).toBe(0.4);
  });
});

describe('voices', () => {
  it('stops a looping voice by id', () => {
    const voice = mixer.play('music', { loop: true });
    expect(mixer.voiceCount).toBe(1);
    expect(mixer.stop(voice)).toBe(true);
    expect(mixer.voiceCount).toBe(0);
  });

  it('reports false when stopping an unknown voice', () => {
    expect(mixer.stop(9999)).toBe(false);
  });

  it('stops every voice of one sound', () => {
    mixer.play('siren', { loop: true });
    mixer.play('siren', { loop: true });
    mixer.play('engine', { loop: true });

    expect(mixer.stopAllOf('siren')).toBe(2);
    expect(mixer.voiceCount).toBe(1);
  });

  it('stops everything', () => {
    mixer.play('a', { loop: true });
    mixer.play('b', { loop: true });
    expect(mixer.stopAll()).toBe(2);
    expect(mixer.voiceCount).toBe(0);
  });

  // 200 identical explosions in one frame are inaudible as anything but clipping, and a real
  // performance problem.
  it('refuses to exceed the voice cap', () => {
    mixer.maxVoices = 4;
    for (let i = 0; i < 100; i += 1) mixer.play('spam', { loop: true });
    expect(mixer.voiceCount).toBe(4);
  });

  it('returns 0 when a play is dropped by the cap', () => {
    mixer.maxVoices = 1;
    mixer.play('a', { loop: true });
    expect(mixer.play('b', { loop: true })).toBe(0);
  });

  it('frees capacity after stopping', () => {
    mixer.maxVoices = 1;
    const voice = mixer.play('a', { loop: true });
    mixer.stop(voice);
    expect(mixer.play('b', { loop: true })).toBeGreaterThan(0);
  });
});

describe('loading', () => {
  it('reports failure rather than rejecting in silent mode', async () => {
    await expect(mixer.load('x', 'missing.ogg')).resolves.toBe(false);
  });

  // One bad path must not fail a scene's whole preload.
  it('resolves loadAll even when every entry fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mixer.loadAll({ a: 'a.ogg', b: 'b.ogg' })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('dispose', () => {
  it('stops everything and becomes inaudible', () => {
    mixer.play('a', { loop: true });
    mixer.dispose();
    expect(mixer.voiceCount).toBe(0);
    expect(mixer.isAudible).toBe(false);
  });
});
