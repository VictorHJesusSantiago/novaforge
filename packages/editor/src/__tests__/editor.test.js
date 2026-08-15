/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { Transform } from '@novaforge/core';
import { Game } from '@novaforge/runtime';
import { RigidBody, Collider, BodyType, box } from '@novaforge/physics';
import { Editor } from '../editor.js';

/**
 * The editor wraps a real, headless `Game` — no mocks. This is the same reasoning as the
 * breakout example's gameplay test (ADR-0008): assembling the pieces the way a real host page
 * would is what catches bugs that isolated unit tests, each constructing its own convenient
 * fixture, do not.
 */

/** @returns {{ game: Game, editor: Editor }} */
function setup() {
  const game = new Game({ gravity: { x: 0, y: 980 } });
  const editor = new Editor(game, {
    sceneTree: document.createElement('div'),
    inspector: document.createElement('div'),
    assetPanel: document.createElement('div'),
    overlayCanvas: document.createElement('canvas'),
  });
  return { game, editor };
}

/** @param {Game} game @param {{x:number,y:number}} [position] @returns {number} */
function spawnFallingBody(game, position = { x: 0, y: 0 }) {
  const shape = box(20, 20);
  const entity = game.world.createEntity();
  game.world.add(entity, Transform).position.set(position.x, position.y);
  game.world.add(entity, RigidBody, { type: BodyType.DYNAMIC });
  game.world.add(entity, Collider, { shape });
  return entity;
}

describe('starts in edit mode', () => {
  it('does not simulate until play is pressed', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);

    let now = 0;
    editor.frame(now);
    for (let i = 0; i < 30; i += 1) {
      now += 1000 / 60;
      editor.frame(now);
    }

    expect(game.world.get(entity, Transform)?.position.y).toBe(0);
  });

  it('still renders live edits while paused', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);

    editor.frame(0);
    game.world.get(entity, Transform)?.position.set(999, 999);
    editor.frame(16);

    expect(game.world.get(entity, Transform)?.position.x).toBe(999);
  });
});

describe('play', () => {
  it('lets simulated time accumulate', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);

    editor.frame(0);
    editor.play();

    let now = 0;
    for (let i = 0; i < 30; i += 1) {
      now += 1000 / 60;
      editor.frame(now);
    }

    expect(game.world.get(entity, Transform)?.position.y).toBeGreaterThan(0);
  });

  it('is idempotent', () => {
    const { editor } = setup();
    editor.frame(0);
    editor.play();
    const modeAfterFirstPlay = editor.mode;
    editor.play();
    expect(editor.mode).toBe(modeAfterFirstPlay);
  });
});

describe('stop', () => {
  it('restores the exact pre-play scene, discarding what happened during the run', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game, { x: 0, y: 0 });

    editor.frame(0);
    editor.play();

    let now = 0;
    for (let i = 0; i < 60; i += 1) {
      now += 1000 / 60;
      editor.frame(now);
    }
    expect(game.world.get(entity, Transform)?.position.y).toBeGreaterThan(0);

    editor.stop();

    const survivors = game.world.entities();
    expect(survivors).toHaveLength(1);
    expect(game.world.get(survivors[0], Transform)?.position.y).toBe(0);
  });

  it('stops advancing simulated time once back in edit mode', () => {
    const { game, editor } = setup();
    spawnFallingBody(game);
    editor.frame(0);
    editor.play();

    let now = 0;
    for (let i = 0; i < 10; i += 1) {
      now += 1000 / 60;
      editor.frame(now);
    }
    editor.stop();

    const [entity] = game.world.entities();
    const yAfterStop = game.world.get(entity, Transform)?.position.y;

    for (let i = 0; i < 30; i += 1) {
      now += 1000 / 60;
      editor.frame(now);
    }

    expect(game.world.get(entity, Transform)?.position.y).toBe(yAfterStop);
  });

  it('clears the undo history on stop', () => {
    const { editor } = setup();
    editor.frame(0);
    editor.commandStack.execute({ label: 'noop', do() {}, undo() {} });
    expect(editor.commandStack.canUndo).toBe(true);

    editor.play();
    editor.stop();

    expect(editor.commandStack.canUndo).toBe(false);
  });

  it('is a no-op in edit mode', () => {
    const { editor } = setup();
    expect(() => editor.stop()).not.toThrow();
  });
});

describe('step', () => {
  it('advances the simulation by exactly one fixed step', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);

    editor.step();

    const expectedVelocity = game.physics?.gravity.y ?? 0;
    expect(game.world.get(entity, Transform)?.position.y).toBeGreaterThan(0);
    expect(game.world.get(entity, Transform)?.position.y).toBeLessThan(expectedVelocity);
  });

  it('does nothing in play mode', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);
    editor.frame(0);
    editor.play();

    const before = game.world.get(entity, Transform)?.position.y;
    editor.step();
    expect(game.world.get(entity, Transform)?.position.y).toBe(before);
  });
});

describe('save and load', () => {
  it('round-trips the current scene', () => {
    const { game, editor } = setup();
    spawnFallingBody(game, { x: 12, y: 34 });

    const text = editor.save();

    const other = new Game({ physics: false });
    const otherEditor = new Editor(other, {
      sceneTree: document.createElement('div'),
      inspector: document.createElement('div'),
      assetPanel: document.createElement('div'),
      overlayCanvas: document.createElement('canvas'),
    });
    otherEditor.load(text);

    const [entity] = other.world.entities();
    expect(other.world.get(entity, Transform)?.position.x).toBe(12);
  });

  it('load clears whatever was there before', () => {
    const { game, editor } = setup();
    spawnFallingBody(game);
    const text = editor.save();

    spawnFallingBody(game);
    editor.load(text);

    expect(game.world.entities()).toHaveLength(1);
  });
});

describe('selection and inspector integration', () => {
  it('selecting an entity in the scene tree shows it in the inspector', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);
    editor.sceneTree.refresh();

    editor.selection.select(entity);

    expect(editor.inspector.container.textContent).toMatch(new RegExp(`Entity #${entity}`));
  });
});

describe('dispose', () => {
  it('does not throw and does not affect the game', () => {
    const { game, editor } = setup();
    const entity = spawnFallingBody(game);
    expect(() => editor.dispose()).not.toThrow();
    expect(game.world.isAlive(entity)).toBe(true);
  });
});
