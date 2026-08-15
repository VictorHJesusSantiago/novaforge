/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { World, defineComponent, resetComponentRegistry } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { defineTrack, defineTimeline, TimelinePlayer, play } from '@novaforge/animation';
import { CommandStack } from '../command-stack.js';
import { Selection } from '../selection.js';
import { TimelinePanel } from '../timeline-panel.js';

/** @type {any} */ let Widget;
/** @type {World} */ let world;
/** @type {Selection} */ let selection;
/** @type {CommandStack} */ let stack;
/** @type {HTMLElement} */ let container;
/** @type {TimelinePanel} */ let panel;

beforeEach(() => {
  resetComponentRegistry();
  Widget = defineComponent('Widget', () => ({ n: 0, point: new Vec2(0, 0) }), {
    n: { type: 'number' },
    point: { type: 'vec2' },
  });
  world = new World();
  selection = new Selection();
  stack = new CommandStack();
  container = document.createElement('div');
  panel = new TimelinePanel(container, world, selection, stack);
});

describe('empty states', () => {
  it('shows a placeholder with nothing selected', () => {
    panel.refresh();
    expect(container.textContent).toMatch(/No entity selected/);
  });

  it('shows a placeholder for an entity with no TimelinePlayer', () => {
    const entity = world.spawn([Widget]);
    selection.select(entity);
    expect(container.textContent).toMatch(/no TimelinePlayer/);
  });

  it('shows a placeholder for a TimelinePlayer with no timeline', () => {
    const entity = world.spawn([Widget], [TimelinePlayer]);
    selection.select(entity);
    expect(container.textContent).toMatch(/no timeline/);
  });
});

describe('rendering a playing timeline', () => {
  /** @returns {number} an entity playing a 0->100 ramp over 10s. */
  function spawnPlaying() {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }, { time: 10, value: 100 }]);
    const timeline = defineTimeline('ramp', [track]);
    const entity = world.spawn([Widget], [TimelinePlayer]);
    play(world.get(entity, TimelinePlayer), timeline);
    return entity;
  }

  it('shows the timeline name and duration', () => {
    const entity = spawnPlaying();
    selection.select(entity);
    expect(container.textContent).toMatch(/ramp/);
    expect(container.textContent).toMatch(/10\.00s/);
  });

  it('renders one row per track', () => {
    const entity = spawnPlaying();
    selection.select(entity);
    expect(container.querySelectorAll('.nf-timeline__track')).toHaveLength(1);
  });

  it('renders one marker per keyframe', () => {
    const entity = spawnPlaying();
    selection.select(entity);
    expect(container.querySelectorAll('.nf-timeline__keyframe')).toHaveLength(2);
  });

  it('the scrubber reflects the player time', () => {
    const entity = spawnPlaying();
    const player = world.get(entity, TimelinePlayer);
    if (player) player.time = 5;
    selection.select(entity);

    const scrubber = /** @type {HTMLInputElement} */ (container.querySelector('.nf-timeline__scrubber'));
    expect(scrubber.value).toBe('5');
  });

  it('dragging the scrubber sets the player time and pauses playback', () => {
    const entity = spawnPlaying();
    selection.select(entity);

    const scrubber = /** @type {HTMLInputElement} */ (container.querySelector('.nf-timeline__scrubber'));
    scrubber.value = '3';
    scrubber.dispatchEvent(new Event('input'));

    const player = world.get(entity, TimelinePlayer);
    expect(player?.time).toBe(3);
    expect(player?.playing).toBe(false);
  });

  it('clicking a keyframe marker seeks to it', () => {
    const entity = spawnPlaying();
    selection.select(entity);

    const markers = container.querySelectorAll('.nf-timeline__keyframe');
    /** @type {HTMLButtonElement} */ (markers[1]).click();

    expect(world.get(entity, TimelinePlayer)?.time).toBe(10);
  });

  it('the play/pause button toggles player.playing', () => {
    const entity = spawnPlaying();
    selection.select(entity);
    const player = world.get(entity, TimelinePlayer);
    expect(player?.playing).toBe(true);

    const playButton = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-timeline__header button'));
    playButton.click();

    expect(player?.playing).toBe(false);
  });
});

describe('capturing a keyframe', () => {
  it('inserts a keyframe at the playhead holding the current field value', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    const timeline = defineTimeline('t', [track]);
    const entity = world.spawn([Widget, { n: 77 }], [TimelinePlayer]);
    const player = world.get(entity, TimelinePlayer);
    play(player, timeline);
    player.time = 5;
    selection.select(entity);

    const addButton = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-timeline__add-keyframe'));
    addButton.click();

    expect(track.keyframes.find((k) => k.time === 5)?.value).toBe(77);
  });

  it('is undoable', () => {
    const track = defineTrack(Widget, 'n', [{ time: 0, value: 0 }]);
    const timeline = defineTimeline('t', [track]);
    const entity = world.spawn([Widget], [TimelinePlayer]);
    const player = world.get(entity, TimelinePlayer);
    play(player, timeline);
    player.time = 5;
    selection.select(entity);

    const addButton = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-timeline__add-keyframe'));
    addButton.click();
    expect(track.keyframes).toHaveLength(2);

    stack.undo();
    expect(track.keyframes).toHaveLength(1);
  });

  it('captures a vec2 field as an independent copy, not a live reference', () => {
    const track = defineTrack(Widget, 'point', [{ time: 0, value: new Vec2(0, 0) }]);
    const timeline = defineTimeline('t', [track]);
    const entity = world.spawn([Widget], [TimelinePlayer]);
    const widget = world.get(entity, Widget);
    widget.point.set(3, 4);
    play(world.get(entity, TimelinePlayer), timeline);
    world.get(entity, TimelinePlayer).time = 2;
    selection.select(entity);

    const addButton = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-timeline__add-keyframe'));
    addButton.click();

    widget.point.set(999, 999);

    const captured = track.keyframes.find((k) => k.time === 2)?.value;
    expect(captured.x).toBe(3);
    expect(captured.y).toBe(4);
  });
});

describe('dispose', () => {
  it('stops reacting to selection changes', () => {
    const entity = world.spawn([Widget]);
    panel.dispose();
    expect(() => selection.select(entity)).not.toThrow();
  });
});
