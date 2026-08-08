import { describe, it, expect } from 'vitest';
import { Transform } from '@novaforge/core';
import { INPUT_RESOURCE } from '@novaforge/input';
import { RigidBody, Collider, BodyType, box, setMass } from '@novaforge/physics';
import { Game } from '../game.js';
import { ReplayRecorder, ReplayPlayer, parseRecording } from '../replay.js';

/**
 * A controllable box: moves left/right on arrow keys and falls under gravity. Enough surface —
 * input *and* physics — to prove a replay reproduces both, not just one.
 * @param {Game} game
 * @returns {number}
 */
function spawnControllable(game) {
  const shape = box(20, 20);
  const entity = game.world.createEntity();
  game.world.add(entity, Transform);
  const body = game.world.add(entity, RigidBody, { type: BodyType.DYNAMIC });
  setMass(body, shape, 1);
  game.world.add(entity, Collider, { shape });

  game.world.addSystem(
    'fixedUpdate',
    (world) => {
      const input = world.getResource(INPUT_RESOURCE);
      if (input === undefined) return;
      let dx = 0;
      if (input.isKeyDown('ArrowRight')) dx += 1;
      if (input.isKeyDown('ArrowLeft')) dx -= 1;
      const rb = world.get(entity, RigidBody);
      if (rb) rb.velocity.x = dx * 200;
    },
    { order: -50, name: 'control' },
  );

  return entity;
}

/**
 * Drive a game through a scripted session, recording (or replaying into) it.
 * @param {Game} game
 * @param {ReplayRecorder | ReplayPlayer} tape
 * @param {number} frames
 * @param {(frame: number, game: Game) => void} [onFrame] fires before each `game.frame` call —
 *   where a recording session pushes its scripted input
 */
function drive(game, tape, frames, onFrame) {
  let now = 0;
  for (let i = 0; i < frames; i += 1) {
    now += 1000 / 60;

    if (tape instanceof ReplayRecorder) {
      // recordFrame() must advance the frame counter *before* this iteration's scripted input
      // is pushed, so the event is tagged with the frame it belongs to — the same frame number
      // ReplayPlayer.nextFrame() will have advanced to when it later replays that same event.
      tape.recordFrame(now);
      onFrame?.(i, game);
      game.frame(now);
      continue;
    }

    const recordedNow = tape.nextFrame();
    if (recordedNow === null) break;
    game.frame(recordedNow);
  }
}

/** @returns {{ x: number, y: number, rotation: number, vx: number, vy: number }} */
function snapshot(game, entity) {
  const transform = game.world.get(entity, Transform);
  const body = game.world.get(entity, RigidBody);
  return {
    x: transform?.position.x ?? 0,
    y: transform?.position.y ?? 0,
    rotation: transform?.rotation ?? 0,
    vx: body?.velocity.x ?? 0,
    vy: body?.velocity.y ?? 0,
  };
}

describe('recording', () => {
  it('captures a timestamp per frame', () => {
    const game = new Game({ physics: false });
    const recorder = new ReplayRecorder(game.input);
    drive(game, recorder, 5);
    expect(recorder.timestamps).toHaveLength(5);
  });

  it('captures pushed input events tagged with their frame', () => {
    const game = new Game({ physics: false });
    const recorder = new ReplayRecorder(game.input);

    drive(game, recorder, 3, (frame) => {
      if (frame === 1) game.input.pushKeyDown('ArrowRight');
    });

    const keyEvents = recorder.events.filter((e) => e.method === 'pushKeyDown');
    expect(keyEvents).toEqual([{ frame: 2, method: 'pushKeyDown', args: ['ArrowRight'] }]);
  });

  it('stop restores the original methods', () => {
    const game = new Game({ physics: false });
    const original = game.input.pushKeyDown;
    const recorder = new ReplayRecorder(game.input);
    expect(game.input.pushKeyDown).not.toBe(original);
    recorder.stop();
    expect(game.input.pushKeyDown).toBe(original);
  });

  it('serialises to JSON text and back', () => {
    const game = new Game({ physics: false });
    const recorder = new ReplayRecorder(game.input);
    drive(game, recorder, 2, (frame) => {
      if (frame === 0) game.input.pushKeyDown('Space');
    });

    const parsed = parseRecording(recorder.toText());
    expect(parsed.timestamps).toEqual(recorder.timestamps);
    expect(parsed.events).toEqual(recorder.events);
  });
});

describe('deterministic playback', () => {
  it('reproduces the exact final state of a physics + input session', () => {
    const original = new Game({ gravity: { x: 0, y: 980 } });
    const entity = spawnControllable(original);
    const recorder = new ReplayRecorder(original.input);

    drive(original, recorder, 180, (frame) => {
      if (frame === 20) original.input.pushKeyDown('ArrowRight');
      if (frame === 80) original.input.pushKeyUp('ArrowRight');
      if (frame === 100) original.input.pushKeyDown('ArrowLeft');
      if (frame === 140) original.input.pushKeyUp('ArrowLeft');
    });

    const originalFinal = snapshot(original, entity);

    const replayed = new Game({ gravity: { x: 0, y: 980 } });
    const replayedEntity = spawnControllable(replayed);
    const player = new ReplayPlayer(replayed.input, recorder.toJSON());
    drive(replayed, player, 180);

    const replayedFinal = snapshot(replayed, replayedEntity);

    expect(replayedFinal).toEqual(originalFinal);
  });

  it('reproduces a session with no input at all (gravity only)', () => {
    const original = new Game({ gravity: { x: 0, y: 500 } });
    const entity = spawnControllable(original);
    const recorder = new ReplayRecorder(original.input);
    drive(original, recorder, 60);

    const replayed = new Game({ gravity: { x: 0, y: 500 } });
    const replayedEntity = spawnControllable(replayed);
    drive(replayed, new ReplayPlayer(replayed.input, recorder.toJSON()), 60);

    expect(snapshot(replayed, replayedEntity)).toEqual(snapshot(original, entity));
  });

  it('round-trips through actual JSON text, not just the in-memory object', () => {
    const original = new Game({ gravity: { x: 0, y: 700 } });
    const entity = spawnControllable(original);
    const recorder = new ReplayRecorder(original.input);
    drive(original, recorder, 90, (frame) => {
      if (frame === 10) original.input.pushKeyDown('ArrowRight');
    });

    const text = recorder.toText();

    const replayed = new Game({ gravity: { x: 0, y: 700 } });
    const replayedEntity = spawnControllable(replayed);
    drive(replayed, new ReplayPlayer(replayed.input, parseRecording(text)), 90);

    expect(snapshot(replayed, replayedEntity)).toEqual(snapshot(original, entity));
  });

  it('stops advancing once the recording is exhausted', () => {
    const game = new Game({ physics: false });
    const recorder = new ReplayRecorder(game.input);
    drive(game, recorder, 5);

    const player = new ReplayPlayer(game.input, recorder.toJSON());
    let calls = 0;
    for (;;) {
      const now = player.nextFrame();
      if (now === null) break;
      calls += 1;
    }

    expect(calls).toBe(5);
    expect(player.finished).toBe(true);
  });

  it('rejects a recording from a newer, unrecognised format version', () => {
    const game = new Game({ physics: false });
    expect(
      () => new ReplayPlayer(game.input, { version: 999, timestamps: [], events: [] }),
    ).toThrow(/999/);
  });
});
