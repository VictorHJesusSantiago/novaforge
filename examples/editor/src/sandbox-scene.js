import { Transform, Name } from '@novaforge/core';
import { ShapeRect, ShapeCircle, TextLabel } from '@novaforge/renderer';
import { RigidBody, Collider, BodyType, box, circle, setMass, makeStatic } from '@novaforge/physics';
import {
  defineTrack,
  defineTimeline,
  TimelinePlayer,
  play,
  installTimelineSystem,
} from '@novaforge/animation';

/**
 * A small, real scene to edit — not a placeholder. It exercises every field type the inspector
 * renders (number, boolean, string, colour, enum, vec2, opaque) and gives the physics step
 * something to actually do once Play is pressed: three boxes drop onto a static floor. It also
 * carries one keyframe-animated entity — a pulsing beacon — so the timeline panel has something
 * real to show the moment the scene loads, not just after a user builds one from scratch.
 *
 * @param {import('@novaforge/runtime').Game} game
 * @returns {void}
 */
export function buildSandboxScene(game) {
  const world = game.world;

  const floor = world.spawn(
    [Transform],
    [Name, { value: 'Floor' }],
    [ShapeRect, { width: 500, height: 30, color: 0x2a2a3a }],
    [RigidBody, { type: BodyType.STATIC, restitution: 0.3, friction: 0.6 }],
    [Collider, { shape: box(500, 30) }],
  );
  world.get(floor, Transform)?.position.set(0, 200);
  makeStatic(world.get(floor, RigidBody));

  const colors = [0xef476f, 0xffd166, 0x4cc9f0];
  for (let i = 0; i < 3; i += 1) {
    const shape = box(40, 40);
    const box_ = world.spawn(
      [Transform],
      [Name, { value: `Crate ${i + 1}` }],
      [ShapeRect, { width: 40, height: 40, color: colors[i] }],
      [RigidBody, { type: BodyType.DYNAMIC, restitution: 0.4, friction: 0.5 }],
      [Collider, { shape }],
    );
    world.get(box_, Transform)?.position.set(-80 + i * 60, -40 - i * 60);
    setMass(world.get(box_, RigidBody), shape, 1);
  }

  const ballShape = circle(20);
  const ball = world.spawn(
    [Transform],
    [Name, { value: 'Ball' }],
    [ShapeCircle, { radius: 20, color: 0x9d8df1 }],
    [RigidBody, { type: BodyType.DYNAMIC, restitution: 0.7, friction: 0.2 }],
    [Collider, { shape: ballShape }],
  );
  world.get(ball, Transform)?.position.set(120, -150);
  setMass(world.get(ball, RigidBody), ballShape, 1);

  installTimelineSystem(world);

  const beacon = world.spawn(
    [Transform],
    [Name, { value: 'Beacon' }],
    [ShapeCircle, { radius: 14, color: 0xffd166 }],
    [TimelinePlayer],
  );
  world.get(beacon, Transform)?.position.set(-180, -180);

  const colorTrack = defineTrack(ShapeCircle, 'color', [
    { time: 0, value: 0xef476f },
    { time: 1, value: 0x4cc9f0 },
    { time: 2, value: 0xef476f },
  ]);
  const radiusTrack = defineTrack(ShapeCircle, 'radius', [
    { time: 0, value: 14 },
    { time: 1, value: 22 },
    { time: 2, value: 14 },
  ]);
  const beaconTimeline = defineTimeline('pulse', [colorTrack, radiusTrack], { loop: true });
  play(world.get(beacon, TimelinePlayer), beaconTimeline);

  const label = world.spawn(
    [Transform],
    [Name, { value: 'Title' }],
    [TextLabel, { text: 'NovaForge Sandbox', font: '20px monospace', color: 0xe8e8f0 }],
  );
  world.get(label, Transform)?.position.set(0, -220);

  // The camera Game already built from the canvas's own size is exactly what is wanted here —
  // replacing it with a new instance would leave `installInputSystems`'s closure (captured in
  // Game's constructor) pointing at the old one, silently breaking mouse world-position
  // projection. Reusing the existing camera is not a shortcut; it is the only correct option.
  game.camera.snapTo({ x: 0, y: 0 });
}
