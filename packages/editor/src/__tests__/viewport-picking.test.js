import { describe, it, expect } from 'vitest';
import { World, Transform } from '@novaforge/core';
import { Camera2D } from '@novaforge/renderer';
import { pickEntity } from '../viewport-picking.js';

/** @returns {Camera2D} an 800x600 camera at the origin, zoom 1. */
function camera() {
  return new Camera2D({ viewportWidth: 800, viewportHeight: 600 });
}

describe('pickEntity', () => {
  it('picks the entity under the click point', () => {
    const world = new World();
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(0, 0);

    const screen = camera().worldToScreen({ x: 0, y: 0 });
    expect(pickEntity(world, camera(), world.entities(), screen)).toBe(entity);
  });

  it('picks the nearer of two candidates', () => {
    const world = new World();
    const near = world.spawn([Transform]);
    world.get(near, Transform)?.position.set(10, 0);
    const far = world.spawn([Transform]);
    world.get(far, Transform)?.position.set(200, 0);

    const cam = camera();
    const screen = cam.worldToScreen({ x: 10, y: 0 });
    expect(pickEntity(world, cam, world.entities(), screen)).toBe(near);
  });

  it('returns null when nothing is within range', () => {
    const world = new World();
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(5000, 5000);

    const cam = camera();
    const screen = cam.worldToScreen({ x: 0, y: 0 });
    expect(pickEntity(world, cam, world.entities(), screen)).toBeNull();
  });

  it('ignores entities with no Transform', () => {
    const world = new World();
    const entity = world.createEntity();
    const cam = camera();
    expect(pickEntity(world, cam, [entity], cam.worldToScreen({ x: 0, y: 0 }))).toBeNull();
  });

  it('respects a custom max distance', () => {
    const world = new World();
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(15, 0);

    const cam = camera();
    const screen = cam.worldToScreen({ x: 0, y: 0 });
    expect(pickEntity(world, cam, world.entities(), screen, 10)).toBeNull();
    expect(pickEntity(world, cam, world.entities(), screen, 20)).toBe(entity);
  });

  it('accounts for camera zoom when converting world distance to screen distance', () => {
    const world = new World();
    const entity = world.spawn([Transform]);
    world.get(entity, Transform)?.position.set(50, 0);

    const cam = camera();
    cam.zoom = 4; // 50 world units is 200 screen pixels at this zoom
    const screen = cam.worldToScreen({ x: 0, y: 0 });
    expect(pickEntity(world, cam, world.entities(), screen, 24)).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    const world = new World();
    const cam = camera();
    expect(pickEntity(world, cam, [], cam.worldToScreen({ x: 0, y: 0 }))).toBeNull();
  });
});
